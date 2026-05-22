const Group = require('../models/Group');
const Client = require('../models/Client');
const MessageLog = require('../models/MessageLog');
const Message = require('../models/Message');
const { sendWhatsAppMessage, sendMessage: sendWhatsAppChatMessage } = require('../services/whatsappService');
const { sendGupshupTextMessage, sendGupshupTemplateMessage, normalizeDestination } = require('../services/gupshupApiService');
const { sendFast2SmsBulk, normalizeIndianMobile } = require('../services/fast2smsService');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

exports.sendBulkMessage = async (req, res, next) => {
  let log = null;
  try {
    const { groupId, message, channel = 'sms' } = req.body;
    const normalizedChannel = String(channel).toLowerCase();
    const attachmentUrl = String(req.body?.attachmentUrl || '').trim();
    const attachmentFilename = String(req.body?.attachmentFilename || '').trim();
    const attachmentMimeType = String(req.body?.attachmentMimeType || '').trim();

    if (!groupId) {
      return res.status(400).json({ success: false, message: 'groupId is required.' });
    }

    if (!['sms', 'whatsapp'].includes(normalizedChannel)) {
      return res.status(400).json({ success: false, message: "channel must be either 'sms' or 'whatsapp'." });
    }

    if (normalizedChannel === 'sms' && !String(message || '').trim()) {
      return res.status(400).json({ success: false, message: 'message is required for SMS.' });
    }

    let whatsappTemplateId = '';
    let whatsappTemplateParams = [];
    if (normalizedChannel === 'whatsapp') {
      whatsappTemplateId = String(req.body?.templateId || '').trim();
      if (!whatsappTemplateId) {
        return res.status(400).json({ success: false, message: 'templateId is required for WhatsApp bulk sends.' });
      }
      if (!Array.isArray(req.body?.params)) {
        return res.status(400).json({ success: false, message: 'Params must be array' });
      }
      whatsappTemplateParams = req.body.params.map((value) => String(value ?? ''));
      const expectedRaw = req.body?.expectedParamCount ?? req.body?.variableCount;
      const expectedParamCount = Number.parseInt(String(expectedRaw ?? ''), 10);
      if (Number.isFinite(expectedParamCount) && expectedParamCount > 0) {
        if (whatsappTemplateParams.length !== expectedParamCount) {
          return res.status(400).json({
            success: false,
            message: `Template requires ${expectedParamCount} parameter(s)`,
          });
        }
        const allFilled = whatsappTemplateParams.every((p) => String(p).trim() !== '');
        if (!allFilled) {
          return res.status(400).json({ success: false, message: 'Template parameters required' });
        }
      }
    }

    if (normalizedChannel === 'sms') {
      console.log('[BULK SMS SEND]', {
        groupId,
        messageLength: String(message || '').trim().length,
      });
    }

    if (normalizedChannel === 'whatsapp') {
      console.log('[WHATSAPP CAMPAIGN SEND]', {
        groupId,
        templateId: whatsappTemplateId,
        paramCount: whatsappTemplateParams.length,
        hasAttachment: Boolean(attachmentUrl),
        attachmentFilename,
        attachmentMimeType,
      });
    }

    const logMessage = normalizedChannel === 'sms'
      ? String(message || '').trim()
      : `WhatsApp template ${whatsappTemplateId}`;

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ success: false, message: 'Group not found' });
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

    const totalRecipients = contacts.length;
    if (!totalRecipients) {
      return res.status(400).json({ success: false, message: 'Group has no contacts to send.' });
    }

    log = await MessageLog.create({
      groupId,
      message: logMessage,
      channel: normalizedChannel,
      attachmentUrl: attachmentUrl || undefined,
      sentBy: req.user._id,
      totalRecipients,
      sentCount: 0,
      successCount: 0,
      failedCount: 0,
      status: 'Processing',
    });

    let sentCount = 0;
    let failedCount = 0;
    let submittedCount = 0;
    let firstDeliveryError = '';
    const bulkFailures = [];

    if (normalizedChannel === 'sms') {
      const allNumbers = contacts
        .map((contact) => normalizeIndianMobile(contact.mobile))
        .filter(Boolean);

      if (!allNumbers.length) {
        return res.status(400).json({ success: false, message: 'No valid mobile numbers available in this group.' });
      }

      const uniqueNumbers = Array.from(new Set(allNumbers));
      const smsBatchSize = 200;

      for (let i = 0; i < uniqueNumbers.length; i += smsBatchSize) {
        const batchNumbers = uniqueNumbers.slice(i, i + smsBatchSize);
        try {
          const smsResult = await sendFast2SmsBulk({ message, numbers: batchNumbers });
          sentCount += smsResult.acceptedCount;
        } catch (error) {
          failedCount += batchNumbers.length;
          if (!firstDeliveryError) {
            firstDeliveryError = error.message || 'SMS delivery failed for one or more batches.';
          }
        }
      }
    } else {
      const perMessageDelayMs = 300;
      console.log('[BULK WHATSAPP TEMPLATE SEND START]', {
        groupId,
        templateId: whatsappTemplateId,
        params: whatsappTemplateParams,
        recipientCount: contacts.length,
      });
      console.log('[BULK WHATSAPP PAYLOAD SAMPLE]', {
        channel: 'whatsapp',
        template: {
          id: whatsappTemplateId,
          params: whatsappTemplateParams,
        },
        note: 'Same structure as single /api/chat/send-template',
      });

      for (const contact of contacts) {
        const normalizedPhone = normalizeDestination(contact.mobile);
        submittedCount += 1;

        const singleEquivalentPayload = {
          to: normalizedPhone,
          templateId: whatsappTemplateId,
          params: whatsappTemplateParams,
        };
        console.log('[BULK WHATSAPP TRY]', singleEquivalentPayload);

        try {
          if (!normalizedPhone) {
            throw new Error('Invalid recipient number.');
          }

          const providerResult = await sendGupshupTemplateMessage({
            to: normalizedPhone,
            templateId: whatsappTemplateId,
            params: whatsappTemplateParams,
          });

          if (!providerResult?.accepted) {
            throw new Error('Provider did not accept the template message.');
          }

          sentCount += 1;
          console.log('[BULK WHATSAPP PROVIDER ACCEPTED]', {
            phone: normalizedPhone,
            messageId: providerResult.messageId || null,
            providerStatus: providerResult.providerStatus || null,
          });
        } catch (err) {
          failedCount += 1;
          const errorMessage = err?.response?.data?.message
            || err?.response?.data?.error
            || err?.message
            || String(err);
          if (!firstDeliveryError) {
            firstDeliveryError = errorMessage;
          }
          bulkFailures.push({
            phone: contact.mobile,
            normalizedPhone,
            error: errorMessage,
            providerBody: err?.response?.data || null,
          });
          console.log('[BULK WHATSAPP PROVIDER REJECTED]', {
            phone: contact.mobile,
            normalizedPhone,
            error: errorMessage,
            providerBody: err?.response?.data || null,
          });
        }

        await delay(perMessageDelayMs);
      }

      console.log('[BULK WHATSAPP FINAL COUNTS]', {
        submittedCount,
        sentCount,
        failedCount,
      });
    }

    log.sentCount = sentCount;
    log.successCount = sentCount;
    log.failedCount = failedCount;
    if (normalizedChannel === 'whatsapp') {
      log.status = sentCount === 0 ? 'Failed' : (failedCount > 0 ? 'Partial' : 'Completed');
    } else {
      // Preserve existing SMS status behavior.
      log.status = sentCount > 0 ? 'Completed' : 'Failed';
    }
    await log.save();

    if (normalizedChannel === 'whatsapp' && String(process.env.WHATSAPP_BULK_SELF_TEST || '').toLowerCase() === 'true') {
      const testTo = process.env.WHATSAPP_BULK_SELF_TEST_NUMBER;
      if (testTo) {
        console.log('[WA SELF TEST] start', testTo);
        const testResult = await sendWhatsAppMessage(testTo, 'Hello test');
        console.log('[WA SELF TEST] result', testResult);
      } else {
        console.log('[WA SELF TEST] skipped: WHATSAPP_BULK_SELF_TEST_NUMBER not set');
      }
    }

    if (normalizedChannel === 'whatsapp' && sentCount === 0 && failedCount > 0) {
      return res.status(502).json({
        success: false,
        message: firstDeliveryError || 'WhatsApp template was rejected for all recipients.',
        submittedCount,
        sentCount: 0,
        failedCount,
        failures: bulkFailures.slice(0, 20),
      });
    }

    if (sentCount === 0 && failedCount > 0) {
      const normalizedDeliveryError = String(firstDeliveryError || '').toLowerCase();
      const requiresFast2SmsActivation = normalizedDeliveryError.includes('complete one transaction of 100 inr')
        || normalizedDeliveryError.includes('before using api route');

      const failureStatusCode = requiresFast2SmsActivation ? 402 : 502;
      const failureMessage = requiresFast2SmsActivation
        ? 'Fast2SMS account activation required: complete one transaction of 100 INR or more in Fast2SMS before using this SMS route.'
        : (firstDeliveryError || 'Failed to deliver messages for the selected channel.');

      return res.status(failureStatusCode).json({
        success: false,
        message: failureMessage,
        sentCount: 0,
      });
    }

    return res.status(200).json({
      success: true,
      sentCount,
      failedCount,
      submittedCount: normalizedChannel === 'whatsapp' ? submittedCount : sentCount,
      partial: normalizedChannel === 'whatsapp' ? failedCount > 0 : false,
      ...(normalizedChannel === 'whatsapp' && failedCount > 0
        ? { failures: bulkFailures.slice(0, 20) }
        : {}),
    });
  } catch (error) {
    if (log) {
      try {
        log.status = 'Failed';
        await log.save();
      } catch {
        // Ignore log update failure to preserve original error path.
      }
    }
    next(error);
  }
};

exports.sendMessage = async (req, res, next) => {
  try {
    const { to, message } = req.body;

    if (!to || !message) {
      return res.status(400).json({ success: false, message: 'to and message are required.' });
    }

    const result = await sendWhatsAppChatMessage(to, message);

    return res.status(200).json({
      success: true,
      data: {
        provider: result.provider,
        messageId: result.messageId,
      },
      message: 'Message request accepted. It will be persisted when the webhook is received.',
    });
  } catch (error) {
    next(error);
  }
};

exports.getMessages = async (req, res, next) => {
  try {
    const { conversationId } = req.query;

    if (!conversationId) {
      return res.status(400).json({ success: false, message: 'conversationId is required.' });
    }

    const messages = await Message.find({ conversationId }).sort({ timestamp: 1, createdAt: 1 });

    return res.status(200).json({
      success: true,
      data: messages,
    });
  } catch (error) {
    next(error);
  }
};

