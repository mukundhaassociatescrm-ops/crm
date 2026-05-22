/**
 * Fast2SMS route "dlt" expects `message` = Message ID from Fast2SMS DLT Manager.
 */

const asTrimmed = (value) => String(value ?? '').trim();

const resolveConfiguredMessageId = (template) => {
  const messageId = asTrimmed(template?.messageId || template?.dltMessageId);
  if (messageId) {
    return messageId;
  }

  const templateId = asTrimmed(template?.templateId);
  if (templateId) {
    console.log('[SMS MESSAGE ID FALLBACK]', {
      templateId,
      reason: 'using_templateId_as_messageId',
      note: 'Prefer Fast2SMS sync to populate messageId on this row',
    });
    return templateId;
  }

  return '';
};

const resolveFast2smsMessageId = (template) => {
  const testMessageId = asTrimmed(process.env.FAST2SMS_DLT_TEST_MESSAGE_ID);
  if (testMessageId) {
    console.log('[SINGLE DLT SMS TEST OVERRIDE]', {
      messageId: testMessageId,
      senderId: process.env.FAST2SMS_DLT_TEST_SENDER_ID || null,
    });
    return testMessageId;
  }

  return resolveConfiguredMessageId(template);
};

const hasConfiguredMessageId = (template) => Boolean(resolveConfiguredMessageId(template));

const resolveFast2smsSenderId = (template) => {
  const testSenderId = asTrimmed(process.env.FAST2SMS_DLT_TEST_SENDER_ID);
  if (testSenderId) {
    return testSenderId;
  }

  return asTrimmed(template?.senderId);
};

const resolveFast2smsEntityId = (template) => {
  const testEntityId = asTrimmed(process.env.FAST2SMS_DLT_TEST_ENTITY_ID);
  if (testEntityId) {
    return testEntityId;
  }

  return asTrimmed(template?.entityId);
};

const buildTemplateLookupQuery = (requestedId) => {
  const id = asTrimmed(requestedId);
  if (!id) {
    return null;
  }

  return {
    $or: [
      { messageId: id },
      { dltMessageId: id },
      { contentTemplateId: id },
      { templateId: id },
    ],
  };
};

module.exports = {
  resolveConfiguredMessageId,
  resolveFast2smsMessageId,
  hasConfiguredMessageId,
  resolveFast2smsSenderId,
  resolveFast2smsEntityId,
  buildTemplateLookupQuery,
};
