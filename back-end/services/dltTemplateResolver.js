/**
 * Fast2SMS route "dlt" expects `message` = Message ID from Fast2SMS DLT Manager,
 * NOT the DLT registry Content Template ID (Excel TEMPLATE_ID).
 */

const resolveFast2smsMessageId = (template) => {
  const testMessageId = String(process.env.FAST2SMS_DLT_TEST_MESSAGE_ID || '').trim();
  if (testMessageId) {
    console.log('[SINGLE DLT SMS TEST OVERRIDE]', {
      messageId: testMessageId,
      senderId: process.env.FAST2SMS_DLT_TEST_SENDER_ID || null,
    });
    return testMessageId;
  }

  const dltMessageId = String(template?.dltMessageId || '').trim();
  if (dltMessageId) {
    return dltMessageId;
  }

  const legacyId = String(template?.templateId || '').trim();
  if (legacyId) {
    console.log('[SINGLE DLT SMS WARNING]', {
      reason: 'dlt_message_id_missing_using_template_id_fallback',
      templateId: legacyId,
      hint: 'Re-import Excel with MESSAGE_ID column mapped to dltMessageId',
    });
    return legacyId;
  }

  return '';
};

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
      { dltMessageId: id },
      { contentTemplateId: id },
      { templateId: id },
    ],
  };
};

module.exports = {
  resolveFast2smsMessageId,
  resolveFast2smsSenderId,
  resolveFast2smsEntityId,
  buildTemplateLookupQuery,
};
