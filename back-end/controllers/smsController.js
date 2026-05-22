const mongoose = require('mongoose');
const SmsTemplate = require('../models/SmsTemplate');
const { sendDltSms, normalizeIndianMobile } = require('../services/fast2smsService');
const {
  extractSmsTemplateVariableSlots,
  buildVariablesValues,
} = require('../services/smsTemplateVariableUtils');
const {
  resolveFast2smsMessageId,
  hasConfiguredMessageId,
  resolveFast2smsSenderId,
  resolveFast2smsEntityId,
  buildTemplateLookupQuery,
  isFast2smsMessageId,
} = require('../services/dltTemplateResolver');
const {
  resolveFast2smsMessageIdFromRecord,
  resolveDltContentTemplateIdFromRecord,
  isDltContentTemplateId,
} = require('../services/smsFast2smsIdUtils');

const asTrimmed = (value) => String(value ?? '').trim();

const normalizeVariablesInput = (rawVariables, slotCount) => {
  if (!slotCount) {
    return [];
  }

  if (Array.isArray(rawVariables)) {
    return rawVariables.map((value) => String(value ?? '').trim());
  }

  if (rawVariables && typeof rawVariables === 'object') {
    return Array.from({ length: slotCount }, (_, index) => String(rawVariables[index] ?? '').trim());
  }

  return [];
};

const findActiveTemplate = async (requestedKey) => {
  const key = asTrimmed(requestedKey);
  if (!key) {
    return null;
  }

  if (mongoose.Types.ObjectId.isValid(key)) {
    const byMongoId = await SmsTemplate.findOne({ _id: key, isActive: true });
    if (byMongoId) {
      return byMongoId;
    }
  }

  const lookupQuery = buildTemplateLookupQuery(key);
  if (!lookupQuery) {
    return null;
  }

  return SmsTemplate.findOne({ ...lookupQuery, isActive: true });
};

exports.sendSingleSms = async (req, res) => {
  const phone = req.body?.phone;
  const requestedTemplateKey = asTrimmed(req.body?.templateRecordId || req.body?.templateId);
  const rawVariables = req.body?.variables;

  try {
    if (!requestedTemplateKey) {
      return res.status(400).json({
        success: false,
        message: 'templateRecordId is required.',
      });
    }

    const normalizedPhone = normalizeIndianMobile(phone);
    if (!normalizedPhone) {
      return res.status(400).json({
        success: false,
        message: 'A valid Indian mobile number is required.',
      });
    }

    const template = await findActiveTemplate(requestedTemplateKey);
    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Active DLT template not found. Sync from Fast2SMS or activate the template first.',
      });
    }

    const dltContentTemplateId = resolveDltContentTemplateIdFromRecord(template);
    const storedMessageId = asTrimmed(template.messageId || template.dltMessageId);

    console.log('[SMS SEND TEMPLATE RECORD]', {
      _id: String(template._id),
      crmTemplateId: template.templateId,
      templateId: template.templateId,
      messageId: template.messageId || null,
      fast2smsMessageId: resolveFast2smsMessageIdFromRecord(template) || null,
      dltTemplateId: dltContentTemplateId || null,
      contentTemplateId: template.contentTemplateId || null,
      senderId: template.senderId || null,
      entityId: template.entityId || null,
      templateName: template.templateName || null,
      provider: template.provider || null,
      contentLength: String(template.templateContent || '').length,
      requestedTemplateKey,
    });

    if (storedMessageId && isDltContentTemplateId(storedMessageId)) {
      return res.status(400).json({
        success: false,
        message: 'Template has DLT Content Template ID in messageId field. Run Sync Templates from Fast2SMS to store the correct Fast2SMS Message ID (e.g. 215773).',
      });
    }

    if (!hasConfiguredMessageId(template)) {
      return res.status(400).json({
        success: false,
        message: 'Template sync incomplete. Missing Fast2SMS Message ID (DLT Manager). Sync templates and ensure messageId is a short numeric ID, not the DLT content template ID.',
      });
    }

    const fast2smsMessageId = resolveFast2smsMessageId(template);

    console.log('[SMS MESSAGE ID RESOLVED]', {
      fast2smsMessageId,
      dltContentTemplateId: dltContentTemplateId || null,
      note: 'Fast2SMS bulkV2 uses message=<Message ID>, not DLT content template ID',
    });

    const senderId = resolveFast2smsSenderId(template);
    if (!senderId) {
      return res.status(400).json({
        success: false,
        message: 'Sender ID not configured for this template',
      });
    }

    const entityId = resolveFast2smsEntityId(template);

    const slots = extractSmsTemplateVariableSlots(template.templateContent);
    const variables = normalizeVariablesInput(rawVariables, slots.length);

    if (slots.length > 0) {
      const missing = slots.filter((slot) => !variables[slot.index]);
      if (missing.length) {
        return res.status(400).json({
          success: false,
          message: `Fill all template variables (${missing.length} missing).`,
          data: { requiredVariables: slots },
        });
      }
    }

    const variablesValues = buildVariablesValues(slots, variables);

    const result = await sendDltSms({
      phone: normalizedPhone,
      messageId: fast2smsMessageId,
      senderId,
      variablesValues,
      entityId,
    });

    return res.status(200).json({
      success: true,
      phone: result.phone,
      templateRecordId: String(template._id),
      crmTemplateId: template.templateId,
      messageId: fast2smsMessageId,
      senderId: result.senderId,
      entityId: entityId || undefined,
      variablesValues: result.variablesValues,
      providerResponse: result.providerResponse,
    });
  } catch (error) {
    console.log('[SINGLE DLT SMS ERROR]', {
      phone,
      templateRecordId: requestedTemplateKey,
      message: error?.message || String(error),
    });
    return res.status(400).json({
      success: false,
      message: error?.message || 'Failed to send DLT SMS.',
    });
  }
};
