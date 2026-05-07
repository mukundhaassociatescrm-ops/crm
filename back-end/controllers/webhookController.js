const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const { processGupshupWebhook } = require('./chatController');

// In-memory debug store for recent Gupshup webhook events.
// This is intentionally small and non-persistent to avoid memory growth.
const gupshupWebhookDebugStore = [];
const MAX_GUPSHUP_DEBUG_EVENTS = 200;

const addGupshupDebugEvent = (event) => {
  gupshupWebhookDebugStore.push(event);
  if (gupshupWebhookDebugStore.length > MAX_GUPSHUP_DEBUG_EVENTS) {
    gupshupWebhookDebugStore.shift();
  }
};

const prettyPrint = (value) => {
  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    return String(value);
  }
};

// Normalize all phone numbers to digits only (no '+', no 'whatsapp:', no spaces).
const normalizePhoneNumber = (value) => {
  if (!value) {
    return '';
  }

  return String(value).replace(/^whatsapp:/i, '').replace(/\D/g, '').trim();
};

const normalizeDigits = (value) => {
  if (!value) {
    return '';
  }
  return String(value).replace(/^whatsapp:/i, '').replace(/\D/g, '').trim();
};

const resolveBusinessNumber = ({ from, to }, env = process.env) => {
  const configured = normalizeDigits(env.WHATSAPP_NUMBER);
  if (!configured) {
    return '';
  }

  const normalizedFrom = normalizeDigits(from);
  const normalizedTo = normalizeDigits(to);
  if (normalizedFrom === configured || normalizedTo === configured) {
    return configured;
  }

  return configured;
};

const normalizeStatus = (status) => {
  switch (String(status || '').toLowerCase()) {
    case 'read':
      return 'read';
    case 'delivered':
      return 'delivered';
    default:
      return 'sent';
  }
};

const parseMetaEvent = (body) => {
  const entry = body?.entry?.[0];
  const change = entry?.changes?.[0]?.value;
  const metadata = change?.metadata || {};

  if (!change) {
    return [];
  }

  const incomingMessages = (change.messages || []).map((message) => {
    const rawFrom = message.from;
    const rawTo = metadata.display_phone_number || metadata.phone_number_id;
    return ({
    source: 'meta',
    eventType: 'message',
    messageId: message.id,
    from: normalizePhoneNumber(rawFrom),
    to: normalizePhoneNumber(rawTo),
    text: message.text?.body || message.button?.text || message.interactive?.button_reply?.title || '',
    type: message.type || 'text',
    direction: 'incoming',
    status: 'sent',
    timestamp: message.timestamp ? new Date(Number(message.timestamp) * 1000) : new Date(),
    replyTo: message.context?.id,
    conversationPhone: normalizePhoneNumber(rawFrom),
    rawFrom,
    rawTo,
  });
  });

  const statusEvents = (change.statuses || []).map((status) => {
    const rawFrom = metadata.display_phone_number || metadata.phone_number_id;
    const rawTo = status.recipient_id;
    return ({
    source: 'meta',
    eventType: 'status',
    messageId: status.id,
    from: normalizePhoneNumber(rawFrom),
    to: normalizePhoneNumber(rawTo),
    text: '',
    type: 'text',
    direction: 'outgoing',
    status: normalizeStatus(status.status),
    timestamp: status.timestamp ? new Date(Number(status.timestamp) * 1000) : new Date(),
    replyTo: undefined,
    conversationPhone: normalizePhoneNumber(rawTo),
    rawFrom,
    rawTo,
  });
  });

  return [...incomingMessages, ...statusEvents].filter((event) => event.messageId && event.conversationPhone);
};

const parseTwilioEvent = (body) => {
  const messageId = body.MessageSid || body.SmsMessageSid;
  if (!messageId) {
    return [];
  }

  const rawFrom = body.From || body.WaId;
  const rawTo = body.To;
  const from = normalizePhoneNumber(rawFrom);
  const to = normalizePhoneNumber(rawTo);
  const direction = String(body.Direction || '').toLowerCase().includes('inbound') ? 'incoming' : 'outgoing';
  const phoneNumber = direction === 'incoming' ? from : to;

  return [
    {
      source: 'twilio',
      eventType: 'message',
      messageId,
      from,
      to,
      text: body.Body || '',
      type: body.NumMedia && Number(body.NumMedia) > 0 ? 'media' : 'text',
      direction,
      status: normalizeStatus(body.MessageStatus || (direction === 'incoming' ? 'sent' : 'sent')),
      timestamp: new Date(),
      replyTo: undefined,
      conversationPhone: phoneNumber,
      rawFrom,
      rawTo,
    },
  ].filter((event) => event.from && event.to && event.conversationPhone);
};

const parseWhatsAppPayload = (body) => {
  if (body?.entry?.length) {
    return parseMetaEvent(body);
  }

  if (body?.MessageSid || body?.SmsMessageSid) {
    return parseTwilioEvent(body);
  }

  return [];
};

exports.verifyWebhook = async (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (!mode || !token) {
    return res.sendStatus(400);
  }

  if (mode === 'subscribe' && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
};

const persistWebhookEvent = async (event) => {
  const businessNumber = resolveBusinessNumber({ from: event.from, to: event.to }, process.env);
  const debugEnabled = String(process.env.CHAT_DEBUG || '').toLowerCase() === 'true';
  if (debugEnabled) {
    console.log('[CHAT_DEBUG]', 'meta/twilio webhook numbers', {
      envBusinessRaw: process.env.WHATSAPP_NUMBER,
      envBusinessNormalized: normalizeDigits(process.env.WHATSAPP_NUMBER),
      rawFrom: event.rawFrom,
      rawTo: event.rawTo,
      from: event.from,
      to: event.to,
      businessNumber,
      conversationPhone: event.conversationPhone,
    });
  }
  const existingConversation = await Conversation.findOne({
    phoneNumber: event.conversationPhone,
    ...(businessNumber ? { businessNumber } : {}),
  });
  const conversation = await Conversation.findOneAndUpdate(
    {
      phoneNumber: event.conversationPhone,
      ...(businessNumber ? { businessNumber } : {}),
    },
    {
      $set: {
        lastMessage: event.text || existingConversation?.lastMessage || '',
        updatedAt: event.timestamp || new Date(),
        ...(businessNumber ? { businessNumber } : {}),
      },
      $setOnInsert: {
        phoneNumber: event.conversationPhone,
        businessNumber: businessNumber || '',
        createdAt: event.timestamp || new Date(),
      },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
      timestamps: false,
    }
  );

  const existingMessage = await Message.findOne({ messageId: event.messageId });
  if (existingMessage) {
    existingMessage.status = event.status;
    existingMessage.timestamp = event.timestamp || existingMessage.timestamp;
    if (businessNumber && !existingMessage.businessNumber) {
      existingMessage.businessNumber = businessNumber;
    }
    if (event.text) {
      existingMessage.text = event.text;
    }
    if (event.replyTo) {
      existingMessage.replyTo = event.replyTo;
    }
    existingMessage.conversationId = conversation._id;
    await existingMessage.save();
    return { message: existingMessage, isNew: false };
  }

  const message = await Message.create({
    businessNumber: businessNumber || '',
    messageId: event.messageId,
    conversationId: conversation._id,
    from: event.from,
    to: event.to,
    text: event.text || '',
    type: event.type || 'text',
    direction: event.direction,
    status: event.status,
    timestamp: event.timestamp || new Date(),
    replyTo: event.replyTo,
  });

  return { message, isNew: true };
};

exports.handleWebhook = async (req, res, next) => {
  try {
    const events = parseWhatsAppPayload(req.body);

    if (!events.length) {
      return res.status(200).json({ success: true, message: 'Webhook received with no actionable events.' });
    }

    const results = [];
    for (const event of events) {
      results.push(await persistWebhookEvent(event));
    }

    return res.status(200).json({
      success: true,
      data: {
        processed: results.length,
        created: results.filter((item) => item.isNew).length,
        updated: results.filter((item) => !item.isNew).length,
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.handleGupshupWebhook = async (req, res) => {
  try {
    // Return HTTP 200 immediately so the provider receives acknowledgement quickly.
    res.status(200).json({ success: true, message: 'Gupshup webhook received' });

    const body = req.body || {};
    const payload = body.payload || {};
    const nestedPayload = payload.payload || {};
    const debugEnabled = String(process.env.CHAT_DEBUG || '').toLowerCase() === 'true';
    if (debugEnabled) {
      console.log('[CHAT_DEBUG]', 'gupshup webhook received (raw body):\n' + prettyPrint(body));
      console.log('[CHAT_DEBUG]', 'gupshup payload numbers', {
        envBusinessRaw: process.env.WHATSAPP_NUMBER,
        envBusinessNormalized: normalizeDigits(process.env.WHATSAPP_NUMBER),
        payloadSourceRaw: payload.source || payload.from,
        payloadDestinationRaw: payload.destination || payload.to,
        payloadSourceNormalized: normalizeDigits(payload.source || payload.from),
        payloadDestinationNormalized: normalizeDigits(payload.destination || payload.to),
      });
    }

    // Extract key values requested for operational debugging.
    const eventType = body.type || 'unknown';
    const status = payload.status || nestedPayload.status || 'unknown';
    const messageId = payload.id || payload.messageId || nestedPayload.id || nestedPayload.messageId || 'unknown';
    const destination = payload.destination || payload.to || nestedPayload.destination || nestedPayload.to || 'unknown';
    const source = payload.source || payload.from || nestedPayload.source || nestedPayload.from || 'unknown';
    const text = payload.text || payload.body || nestedPayload.text || nestedPayload.body || '';
    const reason = payload.reason || nestedPayload.reason || null;

    const storedEvent = await processGupshupWebhook(body);
    if (debugEnabled) {
      console.log('[CHAT_DEBUG]', 'gupshup processed', {
        stored: Boolean(storedEvent),
        storedMessageId: storedEvent?.messageId,
        storedStatus: storedEvent?.status,
        storedPhone: storedEvent?.phone,
      });
    }

    const eventLog = {
      receivedAt: new Date().toISOString(),
      type: eventType,
      status,
      messageId,
      destination,
      source,
      text,
      reason,
      stored: Boolean(storedEvent),
      raw: body,
    };

    addGupshupDebugEvent(eventLog);

    // Full body log for easy troubleshooting with readable formatting.
    console.log('[GUPSHUP] Full request body:\n' + prettyPrint(body));

    // Focused event log for key fields.
    console.log(
      '[GUPSHUP] type=' +
        eventType +
        ' status=' +
        status +
        ' messageId=' +
        messageId +
        ' destination=' +
        destination +
        ' source=' +
        source +
        (text ? ' text=' + JSON.stringify(text) : '') +
        (reason ? ' reason=' + reason : '')
    );

    // Status-specific log lines for quick operational scanning.
    const normalizedStatus = String(status).toLowerCase();
    if (normalizedStatus === 'delivered') {
      console.log('[GUPSHUP][DELIVERED] Message delivered. messageId=' + messageId + ' destination=' + destination);
    } else if (normalizedStatus === 'failed') {
      console.log(
        '[GUPSHUP][FAILED] Message failed. messageId=' +
          messageId +
          ' destination=' +
          destination +
          (reason ? ' reason=' + reason : '')
      );
    } else if (normalizedStatus === 'read') {
      console.log('[GUPSHUP][READ] Message read. messageId=' + messageId + ' destination=' + destination);
    }
  } catch (error) {
    // Keep processing resilient and avoid throwing from webhook path.
    console.error('[GUPSHUP] Error while processing webhook:', error);
    if (!res.headersSent) {
      return res.status(200).json({ success: true, message: 'Gupshup webhook received with processing error' });
    }
  }
};