const { extractSmsTemplateVariableSlots } = require('./smsTemplateVariableUtils');
const {
  asTrimmed,
  resolveFast2smsMessageIdFromRecord,
  resolveDltContentTemplateIdFromRecord,
} = require('./smsFast2smsIdUtils');

const resolveContent = (doc) => asTrimmed(doc?.templateContent || doc?.content);

/**
 * API-facing normalized DLT template (Single SMS / list).
 * Separates CRM keys from Fast2SMS-approved IDs.
 */
const normalizeSmsTemplateForApi = (doc) => {
  const content = resolveContent(doc);
  const fast2smsMessageId = resolveFast2smsMessageIdFromRecord(doc);
  const dltTemplateId = resolveDltContentTemplateIdFromRecord(doc);
  const crmTemplateId = asTrimmed(doc?.templateId);
  const variables = extractSmsTemplateVariableSlots(content);

  return {
    ...doc,
    _id: doc._id,
    crmTemplateId,
    templateId: crmTemplateId,
    templateName: asTrimmed(doc?.templateName) || dltTemplateId || crmTemplateId,
    content,
    templateContent: content,
    senderId: asTrimmed(doc?.senderId),
    messageId: fast2smsMessageId,
    fast2smsMessageId,
    dltTemplateId,
    dltMessageId: fast2smsMessageId,
    contentTemplateId: dltTemplateId || doc?.contentTemplateId,
    variables,
    entityId: asTrimmed(doc?.entityId),
    entityName: asTrimmed(doc?.entityName),
    route: 'dlt',
    ready: Boolean(asTrimmed(doc?.senderId) && content && fast2smsMessageId),
  };
};

module.exports = {
  normalizeSmsTemplateForApi,
  resolveContent,
};
