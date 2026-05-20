const SmsTemplate = require('../models/SmsTemplate');
const { sendDltSms, normalizeIndianMobile } = require('../services/fast2smsService');
const {
  extractSmsTemplateVariableSlots,
  buildVariablesValues,
} = require('../services/smsTemplateVariableUtils');

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
  const templateId = String(req.body?.templateId || '').trim();
  const rawVariables = req.body?.variables;

  try {
    if (!templateId) {
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

    const template = await SmsTemplate.findOne({ templateId, isActive: true });
    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Active DLT template not found. Import or activate the template first.',
      });
    }

    const senderId = String(template.senderId || '').trim();
    if (!senderId) {
      return res.status(400).json({
        success: false,
        message: 'Template is missing sender ID (HEADER). Re-import the DLT Excel file.',
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
      templateId: template.templateId,
      senderId,
      variablesValues,
    });

    return res.status(200).json({
      success: true,
      phone: result.phone,
      templateId: result.templateId,
      senderId: result.senderId,
      variablesValues: result.variablesValues,
      providerResponse: result.providerResponse,
    });
  } catch (error) {
    console.log('[SINGLE DLT SMS ERROR]', {
      phone,
      templateId,
      message: error?.message || String(error),
    });
    return res.status(400).json({
      success: false,
      message: error?.message || 'Failed to send DLT SMS.',
    });
  }
};
