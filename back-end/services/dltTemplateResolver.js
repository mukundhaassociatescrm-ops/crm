const mongoose = require('mongoose');
const {
  asTrimmed,
  isFast2smsMessageId,
  resolveFast2smsMessageIdFromRecord,
} = require('./smsFast2smsIdUtils');

/**
 * Fast2SMS bulkV2 route "dlt" uses JSON field `message` = DLT Manager Message ID only.
 * See: https://docs.fast2sms.com/reference/dlt-sms
 */

const resolveFast2smsMessageId = (template) => {
  const testMessageId = asTrimmed(process.env.FAST2SMS_DLT_TEST_MESSAGE_ID);
  if (testMessageId) {
    console.log('[SINGLE DLT SMS TEST OVERRIDE]', {
      messageId: testMessageId,
      senderId: process.env.FAST2SMS_DLT_TEST_SENDER_ID || null,
    });
    return testMessageId;
  }

  return resolveFast2smsMessageIdFromRecord(template);
};

const hasConfiguredMessageId = (template) => Boolean(resolveFast2smsMessageId(template));

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

const buildTemplateLookupQuery = (requestedKey) => {
  const id = asTrimmed(requestedKey);
  if (!id) {
    return null;
  }

  const clauses = [
    { messageId: id },
    { dltMessageId: id },
    { contentTemplateId: id },
    { templateId: id },
  ];

  if (mongoose.Types.ObjectId.isValid(id)) {
    clauses.unshift({ _id: id });
  }

  return { $or: clauses };
};

module.exports = {
  resolveFast2smsMessageId,
  hasConfiguredMessageId,
  resolveFast2smsSenderId,
  resolveFast2smsEntityId,
  buildTemplateLookupQuery,
  isFast2smsMessageId,
};
