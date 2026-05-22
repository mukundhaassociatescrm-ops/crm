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

  if (payload.senderId && payload.templateContent) {
    const excelMatch = await SmsTemplate.findOne({
      senderId: payload.senderId,
      templateContent: payload.templateContent,
      $or: [
        { messageId: '' },
        { messageId: { $exists: false } },
        { dltMessageId: '' },
        { dltMessageId: { $exists: false } },
      ],
    });
    if (excelMatch) {
      return excelMatch;
    }
  }

  return null;
};

const hasTemplateChanged = (existing, nextPayload) => SYNC_TRACKED_FIELDS.some((field) => {
  if (field === 'syncedAt') {
    const existingTime = existing[field] ? new Date(existing[field]).getTime() : null;
    const nextTime = nextPayload[field] ? new Date(nextPayload[field]).getTime() : null;
    return existingTime !== nextTime;
  }
  return String(existing[field] ?? '') !== String(nextPayload[field] ?? '');
});

const syncSmsTemplatesFromFast2Sms = async () => {
  console.log('[FAST2SMS TEMPLATE SYNC START]');

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
      messageId: normalized.messageId,
      dltTemplateId: normalized.dltTemplateId,
      senderId: normalized.senderId,
      contentLength: normalized.content.length,
      variableCount: normalized.variables?.length || 0,
      ready: normalized.ready,
    });

    try {
      const existing = await findExistingTemplate(payload);
      const savePayload = { ...payload };
      delete savePayload.missingFields;
      delete savePayload.varCount;

      if (!existing) {
        await SmsTemplate.create(savePayload);
        summary.created += 1;
        summary.synced += 1;
        console.log('[FAST2SMS TEMPLATE UPSERT]', { action: 'created', templateId: payload.templateId });
        continue;
      }

      if (!hasTemplateChanged(existing, savePayload)) {
        summary.skipped += 1;
        continue;
      }

      SYNC_TRACKED_FIELDS.forEach((field) => {
        existing[field] = savePayload[field];
      });
      if (payload.contentTemplateId && !String(payload.contentTemplateId).startsWith('f2sms:')) {
        existing.contentTemplateId = payload.contentTemplateId;
      }
      if (!existing.templateId || existing.templateId.startsWith('f2sms:')) {
        existing.templateId = existing.contentTemplateId || payload.templateId;
      }
      await existing.save();
      summary.updated += 1;
      summary.synced += 1;
      console.log('[FAST2SMS TEMPLATE UPSERT]', { action: 'updated', templateId: payload.templateId });
    } catch (error) {
      summary.errors += 1;
      console.log('[FAST2SMS TEMPLATE SKIPPED]', {
        templateId: payload.templateId,
        reason: 'save_error',
        message: error?.message || String(error),
      });
    }
  }

  console.log('[FAST2SMS TEMPLATE SYNC COMPLETE]', summary);
  return summary;
};

module.exports = {
  syncSmsTemplatesFromFast2Sms,
};
