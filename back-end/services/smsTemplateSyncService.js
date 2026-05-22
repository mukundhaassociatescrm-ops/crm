const mongoose = require('mongoose');
const SmsTemplate = require('../models/SmsTemplate');
const { fetchDltTemplates, fetchDltSenders } = require('./fast2smsService');
const {
  buildSenderLookupMap,
  mapFlatTemplateToDbPayload,
} = require('./smsDltManagerParsers');
const { normalizeSmsTemplateForApi } = require('./smsTemplateNormalize');

const SYNC_TRACKED_FIELDS = [
  'templateName',
  'messageId',
  'senderId',
  'entityId',
  'entityName',
  'templateContent',
  'templateType',
  'approvalStatus',
  'provider',
  'syncedAt',
  'isActive',
  'contentTemplateId',
  'dltMessageId',
];

const normalizeContent = (text) => String(text || '').replace(/\s+/g, ' ').trim();

const isMissingMessageId = (doc) => !String(doc?.messageId || doc?.dltMessageId || '').trim();

const buildUpsertLookup = (payload) => {
  const clauses = [];
  if (payload.messageId) {
    clauses.push({ messageId: payload.messageId });
    clauses.push({ dltMessageId: payload.messageId });
  }
  if (payload.templateId) {
    clauses.push({ templateId: payload.templateId });
  }
  if (payload.contentTemplateId) {
    clauses.push({ contentTemplateId: payload.contentTemplateId });
  }
  return clauses.length ? { $or: clauses } : null;
};

const findExistingTemplate = async (payload) => {
  const lookup = buildUpsertLookup(payload);
  if (lookup) {
    const byKey = await SmsTemplate.findOne(lookup);
    if (byKey) {
      return byKey;
    }
  }

  const dltKey = String(payload.contentTemplateId || '').trim();
  if (dltKey && !dltKey.startsWith('f2sms:')) {
    const byDltTemplateId = await SmsTemplate.findOne({
      $or: [{ templateId: dltKey }, { contentTemplateId: dltKey }],
    });
    if (byDltTemplateId) {
      return byDltTemplateId;
    }
  }

  if (payload.senderId && payload.templateContent) {
    const exactContent = await SmsTemplate.findOne({
      templateContent: payload.templateContent,
    });
    if (exactContent) {
      return exactContent;
    }

    const normalizedIncoming = normalizeContent(payload.templateContent);
    if (normalizedIncoming) {
      const candidates = await SmsTemplate.find({
        senderId: payload.senderId,
        templateContent: { $exists: true, $ne: '' },
      }).limit(50);

      const contentMatch = candidates.find(
        (row) => normalizeContent(row.templateContent) === normalizedIncoming,
      );
      if (contentMatch) {
        return contentMatch;
      }
    }
  }

  return null;
};

const applySyncToExisting = (existing, savePayload) => {
  const { isDltContentTemplateId } = require('./smsFast2smsIdUtils');
  const preservedTemplateId = String(existing.templateId || '').trim();
  const preserveCrmTemplateKey = preservedTemplateId && !preservedTemplateId.startsWith('f2sms:');

  SYNC_TRACKED_FIELDS.forEach((field) => {
    existing[field] = savePayload[field];
  });

  if (isDltContentTemplateId(existing.messageId) && savePayload.messageId) {
    existing.messageId = savePayload.messageId;
    existing.dltMessageId = savePayload.dltMessageId;
    console.log('[FAST2SMS TEMPLATE REPAIR]', {
      crmTemplateId: existing.templateId,
      repairedMessageId: existing.messageId,
      reason: 'replaced_dlt_content_id_in_messageId_field',
    });
  }

  if (preserveCrmTemplateKey) {
    existing.templateId = preservedTemplateId;
    existing.contentTemplateId = existing.contentTemplateId || preservedTemplateId;
  } else if (!existing.templateId || existing.templateId.startsWith('f2sms:')) {
    existing.templateId = existing.contentTemplateId || savePayload.templateId;
  }

  if (savePayload.contentTemplateId && !String(savePayload.contentTemplateId).startsWith('f2sms:')) {
    existing.contentTemplateId = savePayload.contentTemplateId;
  }
};

const hasTemplateChanged = (existing, nextPayload) => SYNC_TRACKED_FIELDS.some((field) => {
  if (field === 'syncedAt') {
    const existingTime = existing[field] ? new Date(existing[field]).getTime() : null;
    const nextTime = nextPayload[field] ? new Date(nextPayload[field]).getTime() : null;
    return existingTime !== nextTime;
  }
  return String(existing[field] ?? '') !== String(nextPayload[field] ?? '');
});

const backfillMissingMessageIds = async () => {
  const sources = await SmsTemplate.find({
    messageId: { $exists: true, $nin: ['', null] },
  }).select('messageId dltMessageId templateContent senderId').lean();

  let repairedByContent = 0;

  for (const source of sources) {
    if (!source.templateContent) {
      continue;
    }

    const result = await SmsTemplate.updateMany(
      {
        _id: { $ne: source._id },
        $or: [
          { messageId: '' },
          { messageId: null },
          { messageId: { $exists: false } },
        ],
        templateContent: source.templateContent,
      },
      {
        $set: {
          messageId: source.messageId,
          dltMessageId: source.dltMessageId || source.messageId,
        },
      },
    );
    repairedByContent += result.modifiedCount || 0;
  }

  const shortIdRepair = await SmsTemplate.updateMany(
    {
      $or: [
        { messageId: '' },
        { messageId: null },
        { messageId: { $exists: false } },
      ],
      templateId: { $regex: /^\d{1,11}$/ },
    },
    [
      {
        $set: {
          messageId: '$templateId',
          dltMessageId: '$templateId',
        },
      },
    ],
  );

  console.log('[FAST2SMS TEMPLATE BACKFILL]', {
    repairedByContent,
    repairedShortTemplateId: shortIdRepair.modifiedCount || 0,
  });

  return {
    repairedByContent,
    repairedShortTemplateId: shortIdRepair.modifiedCount || 0,
  };
};

const serializeForLog = (value) => {
  if (!value || typeof value !== 'object') {
    return value;
  }
  const clone = { ...value };
  if (clone.syncedAt instanceof Date) {
    clone.syncedAt = clone.syncedAt.toISOString();
  }
  return clone;
};

const logMongoSaveError = (payload, error) => {
  console.log('[FAST2SMS TEMPLATE SAVE ERROR]', {
    templateId: payload?.templateId,
    messageId: payload?.messageId,
    name: error?.name,
    code: error?.code,
    message: error?.message || String(error),
    keyPattern: error?.keyPattern,
    keyValue: error?.keyValue,
  });
};

const assertMongoConnected = () => {
  const state = mongoose.connection.readyState;
  if (state !== 1) {
    const labels = ['disconnected', 'connected', 'connecting', 'disconnecting'];
    throw new Error(
      `MongoDB not connected (state=${labels[state] || state}). Cannot sync templates until database is ready.`,
    );
  }
};

const syncSmsTemplatesFromFast2Sms = async () => {
  console.log('=== FAST2SMS TEMPLATE SYNC RUN START ===');
  assertMongoConnected();
  console.log('[SYNC STAGE] MongoDB connected — starting Fast2SMS fetch');

  const [flatTemplates, senderRows] = await Promise.all([
    fetchDltTemplates(),
    fetchDltSenders(),
  ]);

  console.log('[SYNC STAGE] Fast2SMS API + parse complete', {
    flatTemplateCount: flatTemplates.length,
    senderRowCount: senderRows.length,
  });

  const parsedSenders = senderRows.map((row) => ({
    senderId: String(row.sender_id || row.senderId || '').trim(),
    entityId: String(row.entity_id || row.entityId || '').trim(),
    entityName: String(row.entity_name || row.entityName || '').trim(),
  })).filter((s) => s.senderId);

  const senderLookup = buildSenderLookupMap(parsedSenders);

  const summary = {
    synced: 0,
    saved: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    malformed: 0,
    parsed: flatTemplates.length,
    senderRecords: parsedSenders.length,
    missingFieldWarnings: 0,
    backfill: null,
  };

  console.log('[FAST2SMS TEMPLATE SYNC DISCOVERY]', {
    flatTemplateCount: flatTemplates.length,
    senderRecordCount: parsedSenders.length,
  });

  for (const flat of flatTemplates) {
    const mapped = mapFlatTemplateToDbPayload(flat, senderLookup);
    if (!mapped || mapped.error) {
      summary.skipped += 1;
      summary.malformed += 1;
      console.log('[FAST2SMS TEMPLATE SKIPPED]', {
        reason: mapped?.error || 'map_failed',
        messageId: flat.messageId || null,
        senderId: flat.senderId || null,
      });
      continue;
    }

    const payload = mapped;
    if (payload.missingFields?.length) {
      summary.missingFieldWarnings += 1;
      console.log('[FAST2SMS TEMPLATE WARNING]', {
        messageId: payload.messageId,
        missingFields: payload.missingFields,
      });
    }

    const savePayload = { ...payload };
    delete savePayload.missingFields;
    delete savePayload.varCount;
    savePayload.provider = 'fast2sms';
    savePayload.isActive = savePayload.isActive !== false;

    const normalizedTemplate = normalizeSmsTemplateForApi(savePayload);
    console.log(
      'NORMALIZED TEMPLATE:',
      JSON.stringify(serializeForLog(normalizedTemplate), null, 2),
    );

    try {
      const existing = await findExistingTemplate(savePayload);
      const nextPayload = { ...savePayload };

      if (existing) {
        console.log('[FAST2SMS TEMPLATE MERGE]', {
          action: 'matched_existing',
          existingId: String(existing._id),
          existingTemplateId: existing.templateId,
          existingMessageId: existing.messageId || null,
          incomingMessageId: savePayload.messageId,
          wasMissingMessageId: isMissingMessageId(existing),
        });

        if (String(existing.templateId || '').trim() && !String(existing.templateId).startsWith('f2sms:')) {
          nextPayload.templateId = existing.templateId;
          nextPayload.contentTemplateId = existing.contentTemplateId || existing.templateId;
        }

        if (!hasTemplateChanged(existing, nextPayload)) {
          if (isMissingMessageId(existing) && savePayload.messageId) {
            applySyncToExisting(existing, nextPayload);
            const savedTemplate = await existing.save();
            summary.updated += 1;
            summary.synced += 1;
            summary.saved += 1;
            console.log(
              'TEMPLATE SAVED:',
              savedTemplate._id,
              savedTemplate.templateName,
            );
          } else {
            summary.skipped += 1;
            console.log('[FAST2SMS TEMPLATE SKIPPED]', {
              templateId: existing.templateId,
              reason: 'unchanged',
            });
          }
          continue;
        }

        applySyncToExisting(existing, nextPayload);
        const savedTemplate = await existing.save();
        summary.updated += 1;
        summary.synced += 1;
        summary.saved += 1;
        console.log(
          'TEMPLATE SAVED:',
          savedTemplate._id,
          savedTemplate.templateName,
        );
        continue;
      }

      console.log('[SYNC STAGE] DB operation: SmsTemplate.create()', {
        templateId: nextPayload.templateId,
        messageId: nextPayload.messageId,
      });

      const savedTemplate = await SmsTemplate.create(nextPayload);
      summary.created += 1;
      summary.synced += 1;
      summary.saved += 1;
      console.log(
        'TEMPLATE SAVED:',
        savedTemplate._id,
        savedTemplate.templateName,
      );
    } catch (error) {
      summary.errors += 1;
      logMongoSaveError(savePayload, error);
      console.log('[FAST2SMS TEMPLATE SKIPPED]', {
        templateId: savePayload.templateId,
        reason: 'save_error',
        message: error?.message || String(error),
      });
    }
  }

  summary.backfill = await backfillMissingMessageIds();

  const dbCount = await SmsTemplate.countDocuments({ provider: 'fast2sms' });
  console.log('TOTAL SAVED:', summary.saved);
  console.log('[SYNC STAGE] MongoDB fast2sms template count after sync:', dbCount);
  console.log('=== FAST2SMS TEMPLATE SYNC END ===');
  console.log('[FAST2SMS TEMPLATE SYNC COMPLETE]', summary);
  return summary;
};

module.exports = {
  syncSmsTemplatesFromFast2Sms,
  backfillMissingMessageIds,
};
