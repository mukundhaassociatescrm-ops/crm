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

const logSavingTemplate = (action, payload) => {
  const forLog = { ...payload };
  if (forLog.syncedAt instanceof Date) {
    forLog.syncedAt = forLog.syncedAt.toISOString();
  }
  console.log('SAVING TEMPLATE:', JSON.stringify({ action, ...forLog }, null, 2));
};

const syncSmsTemplatesFromFast2Sms = async () => {
  console.log('=== FAST2SMS TEMPLATE SYNC RUN START ===');

  const [flatTemplates, senderRows] = await Promise.all([
    fetchDltTemplates(),
    fetchDltSenders(),
  ]);

  const parsedSenders = senderRows.map((row) => ({
    senderId: String(row.sender_id || row.senderId || '').trim(),
    entityId: String(row.entity_id || row.entityId || '').trim(),
    entityName: String(row.entity_name || row.entityName || '').trim(),
  })).filter((s) => s.senderId);

  const senderLookup = buildSenderLookupMap(parsedSenders);

  const summary = {
    synced: 0,
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

    const normalized = normalizeSmsTemplateForApi(payload);
    console.log('[FAST2SMS TEMPLATE NORMALIZED]', {
      templateName: normalized.templateName,
      templateId: normalized.templateId,
      messageId: normalized.messageId,
      dltTemplateId: normalized.dltTemplateId,
      senderId: normalized.senderId,
      contentLength: normalized.content.length,
      ready: normalized.ready,
    });

    try {
      const existing = await findExistingTemplate(payload);
      const savePayload = { ...payload };
      delete savePayload.missingFields;
      delete savePayload.varCount;

      if (!existing) {
        logSavingTemplate('create', savePayload);
        await SmsTemplate.create(savePayload);
        summary.created += 1;
        summary.synced += 1;
        console.log('[FAST2SMS TEMPLATE UPSERT]', { action: 'created', templateId: savePayload.templateId });
        continue;
      }

      console.log('[FAST2SMS TEMPLATE MERGE]', {
        action: 'matched_existing',
        existingTemplateId: existing.templateId,
        existingMessageId: existing.messageId || null,
        incomingMessageId: savePayload.messageId,
        wasMissingMessageId: isMissingMessageId(existing),
      });

      const nextPayload = { ...savePayload };
      if (String(existing.templateId || '').trim() && !String(existing.templateId).startsWith('f2sms:')) {
        nextPayload.templateId = existing.templateId;
        nextPayload.contentTemplateId = existing.contentTemplateId || existing.templateId;
      }

      if (!hasTemplateChanged(existing, nextPayload)) {
        if (isMissingMessageId(existing) && savePayload.messageId) {
          applySyncToExisting(existing, nextPayload);
          logSavingTemplate('backfill_message_id', existing.toObject ? existing.toObject() : existing);
          await existing.save();
          summary.updated += 1;
          summary.synced += 1;
          console.log('[FAST2SMS TEMPLATE UPSERT]', {
            action: 'backfilled_message_id',
            templateId: existing.templateId,
            messageId: existing.messageId,
          });
        } else {
          summary.skipped += 1;
        }
        continue;
      }

      applySyncToExisting(existing, nextPayload);
      logSavingTemplate('update', existing.toObject ? existing.toObject() : { ...nextPayload, templateId: existing.templateId });
      await existing.save();
      summary.updated += 1;
      summary.synced += 1;
      console.log('[FAST2SMS TEMPLATE UPSERT]', {
        action: 'updated',
        templateId: existing.templateId,
        messageId: existing.messageId,
      });
    } catch (error) {
      summary.errors += 1;
      console.log('[FAST2SMS TEMPLATE SKIPPED]', {
        templateId: payload.templateId,
        reason: 'save_error',
        message: error?.message || String(error),
      });
    }
  }

  summary.backfill = await backfillMissingMessageIds();

  console.log('=== FAST2SMS TEMPLATE SYNC END ===');
  console.log('[FAST2SMS TEMPLATE SYNC COMPLETE]', summary);
  return summary;
};

module.exports = {
  syncSmsTemplatesFromFast2Sms,
  backfillMissingMessageIds,
};
