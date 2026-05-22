const { extractSmsTemplateVariableSlots } = require('./smsTemplateVariableUtils');

const asTrimmed = (value) => String(value ?? '').trim();

const resolveDltTemplateId = (doc) => {
  const contentTemplateId = asTrimmed(doc?.contentTemplateId);
  if (contentTemplateId && !contentTemplateId.startsWith('f2sms:')) {
    return contentTemplateId;
  }
  const templateId = asTrimmed(doc?.templateId);
  if (templateId && !templateId.startsWith('f2sms:')) {
    return templateId;
  }
  return '';
};

const resolveMessageId = (doc) => asTrimmed(doc?.messageId || doc?.dltMessageId);

const resolveContent = (doc) => asTrimmed(doc?.templateContent || doc?.content);

/**
 * API-facing normalized DLT template (Single SMS / list).
 */
const normalizeSmsTemplateForApi = (doc) => {
  const content = resolveContent(doc);
  const messageId = resolveMessageId(doc);
  const dltTemplateId = resolveDltTemplateId(doc);
  const variables = extractSmsTemplateVariableSlots(content);

  return {
    ...doc,
    templateName: asTrimmed(doc?.templateName) || dltTemplateId || doc?.templateId,
    content,
    templateContent: content,
    senderId: asTrimmed(doc?.senderId),
    messageId,
    dltTemplateId,
    contentTemplateId: dltTemplateId || doc?.contentTemplateId,
    variables,
    entityId: asTrimmed(doc?.entityId),
    entityName: asTrimmed(doc?.entityName),
    route: 'dlt',
    ready: Boolean(
      asTrimmed(doc?.senderId)
      && content
      && (messageId || dltTemplateId),
    ),
  };
};

module.exports = {
  normalizeSmsTemplateForApi,
  resolveMessageId,
  resolveDltTemplateId,
  resolveContent,
};
