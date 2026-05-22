/**
 * Fast2SMS DLT Manager — separate parsers per `type` query param.
 * GET /dev/dlt_manager?type=sender  → flat sender/entity rows
 * GET /dev/dlt_manager?type=template → sender groups with nested templates[]
 */

const asTrimmedString = (value) => String(value ?? '').trim();

const pickValue = (record, keys) => {
  for (const key of keys) {
    const raw = record?.[key];
    if (raw === undefined || raw === null) {
      continue;
    }
    const value = asTrimmedString(raw);
    if (value) {
      return value;
    }
  }
  return '';
};

const unwrapTopLevelArray = (body) => {
  if (!body) {
    return [];
  }
  if (Array.isArray(body)) {
    return body;
  }
  if (Array.isArray(body.data)) {
    return body.data;
  }
  return [];
};

const redactBodyForLog = (body) => {
  if (!body || typeof body !== 'object') {
    return body;
  }
  const clone = JSON.parse(JSON.stringify(body));
  if (Array.isArray(clone.data)) {
    clone.data = clone.data.slice(0, 2).map((group) => ({
      ...group,
      templates: Array.isArray(group?.templates) ? group.templates.slice(0, 3) : group?.templates,
    }));
  }
  return clone;
};

/** type=sender — flat sender + entity metadata (no nested templates). */
const parseSenderResponse = (body) => {
  const records = unwrapTopLevelArray(body);

  console.log('[FAST2SMS DLT SENDER PARSED]', {
    senderGroupCount: records.length,
    sampleKeys: records[0] ? Object.keys(records[0]) : [],
  });

  return records.map((row) => ({
    senderId: pickValue(row, ['sender_id', 'senderId', 'header']),
    entityId: pickValue(row, ['entity_id', 'entityId']),
    entityName: pickValue(row, ['entity_name', 'entityName']),
    entityStatus: pickValue(row, ['entity_status', 'entityStatus']),
    raw: row,
  })).filter((row) => row.senderId);
};

/**
 * type=template — flatten data[].templates[] and attach parent sender/entity.
 */
const parseTemplateResponse = (body) => {
  console.log('[FAST2SMS DLT RAW type=template]', redactBodyForLog(body));

  const groups = unwrapTopLevelArray(body);
  const flatTemplates = [];
  let nestedTemplateTotal = 0;

  groups.forEach((group, groupIndex) => {
    const parentSenderId = pickValue(group, ['sender_id', 'senderId', 'header']);
    const parentEntityId = pickValue(group, ['entity_id', 'entityId']);
    const parentEntityName = pickValue(group, ['entity_name', 'entityName']);
    const parentEntityStatus = pickValue(group, ['entity_status', 'entityStatus']);
    const nested = Array.isArray(group?.templates) ? group.templates : [];

    nestedTemplateTotal += nested.length;

    nested.forEach((tpl, templateIndex) => {
      flatTemplates.push({
        groupIndex,
        templateIndex,
        messageId: pickValue(tpl, ['message_id', 'messageId']),
        content: pickValue(tpl, ['message', 'message_text', 'messageText']),
        dltTemplateId: pickValue(tpl, [
          'template_id',
          'templateId',
          'content_template_id',
          'contentTemplateId',
          'dlt_template_id',
        ]),
        templateName: pickValue(tpl, ['template_name', 'templateName', 'name', 'title']),
        approvalStatus: pickValue(tpl, ['status', 'approval_status', 'approvalStatus']),
        varCount: Number.parseInt(String(tpl?.var_count ?? tpl?.varCount ?? ''), 10) || 0,
        senderId: parentSenderId || pickValue(tpl, ['sender_id', 'senderId']),
        entityId: parentEntityId || pickValue(tpl, ['entity_id', 'entityId']),
        entityName: parentEntityName || pickValue(tpl, ['entity_name', 'entityName']),
        entityStatus: parentEntityStatus || pickValue(tpl, ['entity_status', 'entityStatus']),
        rawTemplate: tpl,
        rawGroup: group,
      });
    });
  });

  console.log('[FAST2SMS DLT TEMPLATE PARSED]', {
    senderGroupCount: groups.length,
    nestedTemplateCount: nestedTemplateTotal,
    flatTemplateCount: flatTemplates.length,
    sampleFlat: flatTemplates[0]
      ? {
          messageId: flatTemplates[0].messageId,
          senderId: flatTemplates[0].senderId,
          dltTemplateId: flatTemplates[0].dltTemplateId,
          contentLength: flatTemplates[0].content.length,
          varCount: flatTemplates[0].varCount,
        }
      : null,
  });

  if (groups.length > 0 && flatTemplates.length === 0) {
    console.log('[FAST2SMS DLT TEMPLATE WARNING]', {
      reason: 'no_nested_templates_found',
      hint: 'Expected data[].templates[] in type=template response',
      firstGroupKeys: groups[0] ? Object.keys(groups[0]) : [],
    });
  }

  return flatTemplates;
};

const buildSenderLookupMap = (parsedSenders = []) => {
  const lookup = new Map();
  parsedSenders.forEach((sender) => {
    lookup.set(sender.senderId.toUpperCase(), {
      entityId: sender.entityId,
      entityName: sender.entityName,
    });
  });
  return lookup;
};

const isApprovedStatus = (status) => {
  const normalized = asTrimmedString(status).toLowerCase();
  return ['approved', 'active', 'verified', 'success', 'true', '1'].includes(normalized);
};

/** Map flattened template row (from parseTemplateResponse) → MongoDB payload. */
const mapFlatTemplateToDbPayload = (flat, senderLookup = new Map()) => {
  const messageId = flat.messageId;
  if (!messageId) {
    return {
      error: 'missing_message_id',
      flat,
    };
  }

  const senderId = flat.senderId;
  const senderMeta = senderLookup.get(senderId.toUpperCase()) || {};
  const entityId = flat.entityId || senderMeta.entityId;
  const entityName = flat.entityName || senderMeta.entityName;
  const content = flat.content;
  const dltTemplateId = flat.dltTemplateId;
  const crmTemplateId = dltTemplateId || messageId;
  const templateName = flat.templateName || dltTemplateId || `Template ${messageId}`;

  const missingFields = [];
  if (!senderId) {
    missingFields.push('senderId');
  }
  if (!content) {
    missingFields.push('content');
  }

  return {
    templateId: crmTemplateId,
    templateName,
    messageId,
    dltMessageId: messageId,
    contentTemplateId: dltTemplateId || crmTemplateId,
    senderId,
    entityId,
    entityName,
    templateContent: content,
    templateType: '',
    approvalStatus: flat.approvalStatus,
    provider: 'fast2sms',
    syncedAt: new Date(),
    isActive: isApprovedStatus(flat.approvalStatus)
      || isApprovedStatus(flat.entityStatus)
      || Boolean(senderId && content && messageId),
    verificationStatus: isApprovedStatus(flat.approvalStatus),
    jioStatus: flat.approvalStatus,
    varCount: flat.varCount,
    missingFields,
  };
};

module.exports = {
  parseSenderResponse,
  parseTemplateResponse,
  buildSenderLookupMap,
  mapFlatTemplateToDbPayload,
  redactBodyForLog,
};
