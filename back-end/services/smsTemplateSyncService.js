const SmsTemplate = require('../models/SmsTemplate');
const { fetchDltTemplates, fetchDltSenders } = require('./fast2smsService');

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

const normalizeKey = (value) => String(value ?? '').trim();

const pickFirst = (record, keys) => {
  for (const key of keys) {
    const value = normalizeKey(record?.[key]);
    if (value) {
      return value;
    }
  }
  return '';
};

const normalizeApprovalStatus = (value) => {
  const raw = normalizeKey(value).toLowerCase();
  if (!raw) {
    return '';
  }
  return raw;
};

const isApprovedStatus = (status) => {
  const normalized = normalizeApprovalStatus(status);
  return ['approved', 'active', 'verified', 'success', 'true', '1'].includes(normalized);
};

const buildSenderLookup = (senders = []) => {
  const lookup = new Map();

  senders.forEach((sender) => {
    const senderId = pickFirst(sender, ['sender_id', 'senderId', 'header', 'sender']);
    if (!senderId) {
      return;
    }

    lookup.set(senderId.toUpperCase(), {
      entityId: pickFirst(sender, ['entity_id', 'entityId', 'principal_entity_id']),
      entityName: pickFirst(sender, ['entity_name', 'entityName', 'company_name', 'name']),
    });
  });

  return lookup;
};

const mapProviderTemplate = (record, senderLookup) => {
  const messageId = pickFirst(record, ['message_id', 'messageId', 'id', 'message']);
  const contentTemplateId = pickFirst(record, [
    'template_id',
    'templateId',
    'content_template_id',
    'contentTemplateId',
    'dlt_template_id',
  ]);
  const senderId = pickFirst(record, ['sender_id', 'senderId', 'header', 'sender']);
  const senderMeta = senderLookup.get(senderId.toUpperCase()) || {};
  const entityId = pickFirst(record, ['entity_id', 'entityId', 'principal_entity_id']) || senderMeta.entityId;
  const entityName = pickFirst(record, ['entity_name', 'entityName', 'company_name']) || senderMeta.entityName;
  const templateContent = pickFirst(record, [
    'message_text',
    'messageText',
    'template_content',
    'templateContent',
    'content',
    'message',
  ]);
  const templateName = pickFirst(record, [
    'template_name',
    'templateName',
    'name',
    'title',
  ]) || contentTemplateId || messageId;
  const approvalStatus = pickFirst(record, [
    'status',
    'approval_status',
    'approvalStatus',
    'verification_status',
    'jio_status',
  ]);
  const templateType = pickFirst(record, ['template_type', 'templateType', 'type', 'category']);
  const crmTemplateId = contentTemplateId || (messageId ? `f2sms:${messageId}` : '');

  if (!crmTemplateId || !messageId) {
    return null;
  }

  const syncedAt = new Date();

  return {
    templateId: crmTemplateId,
    templateName,
    messageId,
    dltMessageId: messageId,
    contentTemplateId: contentTemplateId || crmTemplateId,
    senderId,
    entityId,
    entityName,
    templateContent,
    templateType,
    approvalStatus,
    provider: 'fast2sms',
    syncedAt,
    isActive: isApprovedStatus(approvalStatus) || Boolean(senderId && templateContent),
    verificationStatus: isApprovedStatus(approvalStatus),
    jioStatus: approvalStatus,
  };
};

const hasTemplateChanged = (existing, nextPayload) => SYNC_TRACKED_FIELDS.some((field) => {
  if (field === 'syncedAt') {
    const existingTime = existing[field] ? new Date(existing[field]).getTime() : null;
    const nextTime = nextPayload[field] ? new Date(nextPayload[field]).getTime() : null;
    return existingTime !== nextTime;
  }
  return String(existing[field] ?? '') !== String(nextPayload[field] ?? '');
});

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

const syncSmsTemplatesFromFast2Sms = async () => {
  console.log('[FAST2SMS TEMPLATE SYNC START]');

  const [templateRecords, senderRecords] = await Promise.all([
    fetchDltTemplates(),
    fetchDltSenders(),
  ]);

  const senderLookup = buildSenderLookup(senderRecords);
  const summary = {
    synced: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    parsed: templateRecords.length,
  };

  for (const record of templateRecords) {
    const payload = mapProviderTemplate(record, senderLookup);
    if (!payload) {
      summary.skipped += 1;
      console.log('[FAST2SMS TEMPLATE SKIPPED]', { reason: 'missing_message_or_template_id', record });
      continue;
    }

    console.log('[FAST2SMS TEMPLATE PARSED]', {
      templateId: payload.templateId,
      messageId: payload.messageId,
      senderId: payload.senderId,
      entityName: payload.entityName,
      approvalStatus: payload.approvalStatus,
    });

    try {
      const lookup = buildUpsertLookup(payload);
      const existing = lookup ? await SmsTemplate.findOne(lookup) : null;

      if (!existing) {
        await SmsTemplate.create(payload);
        summary.created += 1;
        summary.synced += 1;
        console.log('[FAST2SMS TEMPLATE UPSERT]', { action: 'created', templateId: payload.templateId });
        continue;
      }

      if (!hasTemplateChanged(existing, payload)) {
        summary.skipped += 1;
        continue;
      }

      SYNC_TRACKED_FIELDS.forEach((field) => {
        existing[field] = payload[field];
      });
      if (!existing.templateId || existing.templateId.startsWith('f2sms:')) {
        existing.templateId = payload.templateId;
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
  mapProviderTemplate,
  buildSenderLookup,
};
