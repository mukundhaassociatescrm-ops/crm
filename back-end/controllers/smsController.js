const SmsTemplate = require('../models/SmsTemplate');
const { sendDltSms, normalizeIndianMobile } = require('../services/fast2smsService');
const {
  extractSmsTemplateVariableSlots,
  buildVariablesValues,
} = require('../services/smsTemplateVariableUtils');
const {
  resolveConfiguredMessageId,
  resolveFast2smsMessageId,
  hasConfiguredMessageId,
  resolveFast2smsSenderId,
  resolveFast2smsEntityId,
  buildTemplateLookupQuery,
} = require('../services/dltTemplateResolver');

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

exports.sendSingleSms = async (req, res) => {
  const phone = req.body?.phone;
  const requestedTemplateKey = String(req.body?.templateId || '').trim();
  const rawVariables = req.body?.variables;

  try {
    if (!requestedTemplateKey) {
      return res.status(400).json({
        success: false,
        message: 'templateId is required. Single SMS uses DLT template mode only.',
      });
    }

    const normalizedPhone = normalizeIndianMobile(phone);
    if (!normalizedPhone) {
      return res.status(400).json({
        success: false,
        message: 'A valid Indian mobile number is required.',
      });
    }

    const lookupQuery = buildTemplateLookupQuery(requestedTemplateKey);
    const template = await SmsTemplate.findOne({ ...lookupQuery, isActive: true });
    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Active DLT template not found. Import or activate the template first.',
      });
    }

    console.log('[SMS SEND TEMPLATE]', {
      requestedTemplateKey,
      templateId: template.templateId,
      templateName: template.templateName,
      senderId: template.senderId,
      messageId: resolveConfiguredMessageId(template) || null,
    });

    if (!hasConfiguredMessageId(template)) {
      return res.status(400).json({
        success: false,
        message: 'Message ID not configured for this template',
      });
    }

    const fast2smsMessageId = resolveFast2smsMessageId(template);

    console.log('[SMS MESSAGE ID]', {
      messageId: fast2smsMessageId,
      source: template.messageId ? 'messageId' : 'dltMessageId',
    });

    const senderId = resolveFast2smsSenderId(template);
    if (!senderId) {
      return res.status(400).json({
        success: false,
        message: 'Template is missing sender ID (HEADER). Configure sender in imported template.',
      });
    }

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
      entityId: resolveFast2smsEntityId(template),
      contentTemplateId: template.contentTemplateId,
    });

    return res.status(200).json({
      success: true,
      phone: result.phone,
      templateId: template.templateId,
      messageId: fast2smsMessageId,
      senderId: result.senderId,
      variablesValues: result.variablesValues,
      providerResponse: result.providerResponse,
    });
  } catch (error) {
    console.log('[SINGLE DLT SMS ERROR]', {
      phone,
      templateId: requestedTemplateKey,
      message: error?.message || String(error),
    });
    return res.status(400).json({
      success: false,
      message: error?.message || 'Failed to send DLT SMS.',
    });
  }
};
