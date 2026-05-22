const mongoose = require('mongoose');
const Group = require('../models/Group');
const Client = require('../models/Client');
const SmsTemplate = require('../models/SmsTemplate');
const { sendDltSms, sendDltBulkCustom, normalizeIndianMobile } = require('../services/fast2smsService');
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
  resolveBulkDltCustomMessage,
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

const resolveLiveTemplateFromBody = (body) => {
  const source = body?.template;
  if (!source || typeof source !== 'object') {
    return null;
  }

  const messageId = asTrimmed(source.messageId || source.fast2smsMessageId);
  const senderId = asTrimmed(source.senderId);
  const templateContent = asTrimmed(source.templateContent || source.content);

  if (!messageId || !senderId || !templateContent) {
    return null;
  }

  if (!isFast2smsMessageId(messageId)) {
    return null;
  }

  return {
    _id: asTrimmed(source._id) || `f2sms:${messageId}`,
    templateId: asTrimmed(source.templateId) || messageId,
    templateName: asTrimmed(source.templateName) || `Template ${messageId}`,
    messageId,
    dltMessageId: messageId,
    senderId,
    entityId: asTrimmed(source.entityId),
    entityName: asTrimmed(source.entityName),
    templateContent,
    provider: 'fast2sms',
    isActive: true,
  };
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

    let template = resolveLiveTemplateFromBody(req.body);

    if (!template && requestedTemplateKey) {
      template = await findActiveTemplate(requestedTemplateKey);
    }

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'DLT template not found. Select a live Fast2SMS template or provide template details in the request.',
      });
    }

    const dltContentTemplateId = resolveDltContentTemplateIdFromRecord(template);
    const storedMessageId = asTrimmed(template.messageId || template.dltMessageId);
    const templateRecord = template.toObject ? template.toObject() : template;
    const isLiveTemplate = Boolean(req.body?.template);

    console.log('SELECTED TEMPLATE:', JSON.stringify({
      source: isLiveTemplate ? 'fast2sms_live' : 'database',
      _id: String(templateRecord._id),
      templateId: templateRecord.templateId,
      messageId: templateRecord.messageId || null,
      dltMessageId: templateRecord.dltMessageId || null,
      senderId: templateRecord.senderId || null,
      entityId: templateRecord.entityId || null,
      contentTemplateId: templateRecord.contentTemplateId || null,
      dltTemplateId: dltContentTemplateId || null,
      templateName: templateRecord.templateName || null,
      provider: templateRecord.provider || null,
      contentPreview: String(templateRecord.templateContent || '').slice(0, 120),
      requestedTemplateKey,
    }, null, 2));

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

    console.log('FINAL FAST2SMS PAYLOAD:', {
      route: 'dlt',
      sender_id: senderId,
      message_id: fast2smsMessageId,
      message: fast2smsMessageId,
      entity_id: entityId || null,
      numbers: normalizedPhone,
      variables_values: variablesValues || null,
    });

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
      templateRecordId: String(template._id || template.messageId),
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

const collectGroupContacts = async (groupId) => {
  const group = await Group.findById(groupId);
  if (!group) {
    return { group: null, contacts: [] };
  }

  const manualContacts = (group.contacts || []).map((contact) => ({
    name: contact.name || '',
    mobile: contact.phone || contact.mobile || '',
  }));
  const clientContacts = await Client.find({ groups: group._id }).select('name mobile');
  const contacts = [...manualContacts, ...clientContacts.map((client) => ({
    name: client.name || '',
    mobile: client.mobile || '',
  }))].filter((contact, index, list) => {
    const mobile = String(contact.mobile || '').trim();
    return mobile && list.findIndex((item) => String(item.mobile || '').trim() === mobile) === index;
  });

  return { group, contacts };
};

exports.sendBulkDltSms = async (req, res) => {
  const { groupId } = req.body;
  const rawVariables = req.body?.variables;

  try {
    if (!asTrimmed(groupId)) {
      return res.status(400).json({ success: false, message: 'groupId is required.' });
    }

    const template = resolveLiveTemplateFromBody(req.body);
    if (!template) {
      return res.status(400).json({
        success: false,
        message: 'template is required with messageId, senderId, and templateContent from live Fast2SMS.',
      });
    }

    const dltMessage = resolveBulkDltCustomMessage(template);
    if (!dltMessage) {
      return res.status(400).json({
        success: false,
        message: 'DLT template ID is required for bulk send (dltTemplateId or Fast2SMS Message ID).',
      });
    }

    const senderId = resolveFast2smsSenderId(template);
    if (!senderId) {
      return res.status(400).json({ success: false, message: 'senderId is required for DLT bulk SMS.' });
    }

    const { group, contacts } = await collectGroupContacts(groupId);
    if (!group) {
      return res.status(404).json({ success: false, message: 'Group not found.' });
    }

    if (!contacts.length) {
      return res.status(400).json({ success: false, message: 'Group has no contacts to send.' });
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
    const numbers = Array.from(
      new Set(contacts.map((contact) => normalizeIndianMobile(contact.mobile)).filter(Boolean)),
    );

    if (!numbers.length) {
      return res.status(400).json({ success: false, message: 'No valid mobile numbers in this group.' });
    }

    const requests = numbers.map((phone) => ({
      sender_id: senderId,
      message: dltMessage,
      variables_values: variablesValues || '',
      numbers: phone,
    }));

    console.log('[BULK DLT SMS SEND]', {
      groupId: String(group._id),
      groupName: group.name,
      recipientCount: requests.length,
      senderId,
      dltMessage,
      variablesValues: variablesValues || null,
    });

    const result = await sendDltBulkCustom({ requests });

    return res.status(200).json({
      success: true,
      sentCount: result.acceptedCount,
      senderId,
      dltMessage,
      variablesValues: variablesValues || undefined,
      providerResponse: result.raw,
    });
  } catch (error) {
    console.log('[BULK DLT SMS ERROR]', {
      groupId,
      message: error?.message || String(error),
    });
    return res.status(400).json({
      success: false,
      message: error?.message || 'Failed to send bulk DLT SMS.',
    });
  }
};
