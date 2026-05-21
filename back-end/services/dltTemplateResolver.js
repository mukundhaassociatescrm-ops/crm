/**
 * Fast2SMS route "dlt" expects `message` = Message ID from Fast2SMS DLT Manager.
 * Jio DLT Excel does not include this — configure via CRM (messageId field).
 */

const resolveConfiguredMessageId = (template) => String(template?.messageId || template?.dltMessageId || '').trim();

const resolveFast2smsMessageId = (template) => {
  const testMessageId = String(process.env.FAST2SMS_DLT_TEST_MESSAGE_ID || '').trim();
  if (testMessageId) {
    console.log('[SINGLE DLT SMS TEST OVERRIDE]', {
      messageId: testMessageId,
      senderId: process.env.FAST2SMS_DLT_TEST_SENDER_ID || null,
    });
    return testMessageId;
  }

  const messageId = resolveConfiguredMessageId(template);
  if (messageId) {
    return messageId;
  }

  return '';
};

const hasConfiguredMessageId = (template) => Boolean(resolveConfiguredMessageId(template));

const resolveFast2smsSenderId = (template) => {
  const testSenderId = String(process.env.FAST2SMS_DLT_TEST_SENDER_ID || '').trim();
  if (testSenderId) {
    return testSenderId;
  }

  return String(template?.senderId || '').trim();
};

const resolveFast2smsEntityId = (template) => {
  const testEntityId = String(process.env.FAST2SMS_DLT_TEST_ENTITY_ID || '').trim();
  if (testEntityId) {
    return testEntityId;
  }

  return String(template?.entityId || '').trim();
};

const buildTemplateLookupQuery = (requestedId) => {
  const id = String(requestedId || '').trim();
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
