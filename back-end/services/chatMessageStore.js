const Conversation = require('../models/Conversation');
const Message = require('../models/Message');

const isChatDebugEnabled = () => String(process.env.CHAT_DEBUG || '').toLowerCase() === 'true';

const chatDebug = (...args) => {
  if (!isChatDebugEnabled()) {
    return;
  }
  console.log('[CHAT_DEBUG]', ...args);
};

const normalizePhone = (value) => {
  if (!value) {
    return '';
  }
  return String(value).replace(/^whatsapp:/i, '').replace(/\D/g, '').trim();
};

const normalizeStatus = (value, fallback = 'sent') => {
  const status = String(value || '').toLowerCase();
  if (status === 'submitted' || status === 'enqueued' || status === 'queued') {
    return 'sent';
  }
  if (status === 'delivered' || status === 'read' || status === 'failed' || status === 'sent') {
    return status;
  }
  return fallback;
};

const normalizeDirection = (value, fallback = 'out') => {
  const direction = String(value || '').toLowerCase();
  if (direction === 'in' || direction === 'out') {
    return direction;
  }
  return fallback;
};

const toDate = (value) => {
  if (!value) {
    return new Date();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

const buildPreviewText = (message) => {
  return String(message.filename || message.text || '').trim();
};

const findOrCreateConversation = async (phone, previewText = '', options = {}) => {
  if (!phone) {
    return null;
  }

  const incrementUnreadBy = Math.max(0, Number(options.incrementUnreadBy || 0));

  const update = previewText ? { lastMessage: previewText } : {};
  if (incrementUnreadBy > 0) {
    update.$inc = { unreadCount: incrementUnreadBy };
  }

  const setPayload = { ...(previewText ? { lastMessage: previewText } : {}) };
  if (Object.keys(setPayload).length) {
    update.$set = setPayload;
  }

  return Conversation.findOneAndUpdate(
    { phoneNumber: phone },
    {
      ...update,
      $setOnInsert: { phoneNumber: phone },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    }
  );
};

const buildDirectionalEndpoints = (normalized) => {
  const phone = normalized.phone || normalized.destination || normalized.source;
  const isOutgoing = normalized.direction === 'out';

  return {
    phone,
    from: normalized.source || (isOutgoing ? 'business' : phone),
    to: normalized.destination || (isOutgoing ? phone : 'business'),
  };
};

const toMessageView = (messageDoc, phoneNumber) => ({
  messageId: messageDoc.messageId,
  phone: phoneNumber,
  text: messageDoc.text || '',
  type: messageDoc.type || 'text',
  fileUrl: messageDoc.fileUrl || '',
  filename: messageDoc.filename || '',
  mimeType: messageDoc.mimeType || '',
  direction: messageDoc.direction || 'out',
  status: messageDoc.status || 'sent',
  timestamp: messageDoc.timestamp || messageDoc.createdAt,
});

const findBestOutgoingMatch = async ({ phone, timestamp }) => {
  if (!phone) {
    return null;
  }

  const conversation = await Conversation.findOne({ phoneNumber: phone }).select('_id');
  if (!conversation?._id) {
    return null;
  }

  const statusTime = toDate(timestamp).getTime();
  const windowMs = 15 * 60 * 1000;
  const windowStart = new Date(statusTime - windowMs);
  const windowEnd = new Date(statusTime + windowMs);

  const candidates = await Message.find({
    conversationId: conversation._id,
    direction: { $in: ['out', 'outgoing'] },
    timestamp: { $gte: windowStart, $lte: windowEnd },
  }).sort({ timestamp: -1 });

  let best = null;
  let bestDelta = Number.MAX_SAFE_INTEGER;
  for (const item of candidates) {
    const hasRenderableContent = Boolean(String(item.text || item.filename || '').trim());
    if (!hasRenderableContent) {
      continue;
    }

    const delta = Math.abs(statusTime - toDate(item.timestamp).getTime());
    if (delta < bestDelta) {
      best = item;
      bestDelta = delta;
    }
  }

  return best;
};

const saveMessage = async (message) => {
  const normalized = {
    messageId: message.messageId || '',
    phone: normalizePhone(message.phone),
    text: String(message.text || ''),
    type: String(message.type || 'text').toLowerCase(),
    fileUrl: message.fileUrl ? String(message.fileUrl) : '',
    filename: message.filename ? String(message.filename) : '',
    mimeType: message.mimeType ? String(message.mimeType) : '',
    direction: normalizeDirection(message.direction),
    status: normalizeStatus(message.status),
    timestamp: toDate(message.timestamp),
    source: normalizePhone(message.source),
    destination: normalizePhone(message.destination),
    reason: message.reason ? String(message.reason) : undefined,
  };

  const previewText = buildPreviewText(normalized);
  const endpoints = buildDirectionalEndpoints(normalized);
  const phone = normalized.phone || endpoints.phone;

  if (normalized.messageId) {
    const existing = await Message.findOne({ messageId: normalized.messageId });
    if (existing) {
      let existingConversationId = existing.conversationId;
      if (!existingConversationId && phone) {
        const existingConversation = await findOrCreateConversation(phone, previewText, { incrementUnreadBy: 0 });
        existingConversationId = existingConversation?._id;
      }

      existing.conversationId = existingConversationId || existing.conversationId;
      existing.from = existing.from || endpoints.from;
      existing.to = existing.to || endpoints.to;
      existing.text = normalized.text || existing.text;
      existing.type = normalized.type || existing.type || 'text';
      existing.fileUrl = normalized.fileUrl || existing.fileUrl;
      existing.filename = normalized.filename || existing.filename;
      existing.mimeType = normalized.mimeType || existing.mimeType;
      existing.direction = existing.direction || normalized.direction;
      existing.status = normalized.status || existing.status;
      existing.timestamp = normalized.timestamp || existing.timestamp;
      await existing.save();
      return toMessageView(existing, phone);
    }
  }

  const conversation = await findOrCreateConversation(phone, previewText, {
    incrementUnreadBy: normalized.direction === 'in' ? 1 : 0,
  });

  const created = await Message.create({
    messageId: normalized.messageId || `chat-${Date.now()}`,
    conversationId: conversation?._id,
    from: endpoints.from,
    to: endpoints.to,
    text: normalized.text,
    type: normalized.type || 'text',
    fileUrl: normalized.fileUrl,
    filename: normalized.filename,
    mimeType: normalized.mimeType,
    direction: normalized.direction,
    status: normalized.status,
    timestamp: normalized.timestamp,
    replyTo: undefined,
  });

  return toMessageView(created, phone);
};

const updateMessageStatus = async ({ messageId, status, destination, source, timestamp, reason, phone }) => {
  const normalizedMessageId = String(messageId || '').trim();
  const normalizedDestination = normalizePhone(destination);
  const normalizedSource = normalizePhone(source);
  const normalizedStatus = normalizeStatus(status, 'sent');
  const normalizedPhone = normalizePhone(phone);
  const targetPhone = normalizedPhone || normalizedDestination || normalizedSource;

  if (!normalizedMessageId) {
    chatDebug('status:update skipped (missing messageId)', { status: normalizedStatus, targetPhone });
    return null;
  }

  const existing = await Message.findOne({ messageId: normalizedMessageId });
  if (existing) {
    existing.status = normalizedStatus;
    existing.timestamp = toDate(timestamp);
    existing.to = normalizedDestination || existing.to;
    existing.from = normalizedSource || existing.from;
    if (reason) {
      existing.reason = String(reason);
    }
    await existing.save();
    const conversation = await Conversation.findById(existing.conversationId).select('phoneNumber');
    chatDebug('status:update matched by messageId', {
      messageId: normalizedMessageId,
      status: normalizedStatus,
      phone: conversation?.phoneNumber || targetPhone,
    });
    return toMessageView(existing, conversation?.phoneNumber || targetPhone);
  }

  // Gupshup can send different IDs for status callbacks than send responses.
  // Match by phone + timestamp window so one outgoing bubble progresses sent/delivered/read.
  const matchedOutgoing = await findBestOutgoingMatch({
    phone: targetPhone,
    timestamp,
  });
  if (matchedOutgoing) {
    matchedOutgoing.status = normalizedStatus;
    matchedOutgoing.timestamp = toDate(timestamp);
    matchedOutgoing.to = normalizedDestination || matchedOutgoing.to;
    matchedOutgoing.from = normalizedSource || matchedOutgoing.from;
    if (reason) {
      matchedOutgoing.reason = String(reason);
    }
    await matchedOutgoing.save();
    const conversation = await Conversation.findById(matchedOutgoing.conversationId).select('phoneNumber');
    chatDebug('status:update matched by timestamp window', {
      incomingStatusMessageId: normalizedMessageId,
      matchedMessageId: matchedOutgoing.messageId,
      status: normalizedStatus,
      phone: conversation?.phoneNumber || targetPhone,
    });
    return toMessageView(matchedOutgoing, conversation?.phoneNumber || targetPhone);
  }

  // If we receive a status before the send API response is stored, create a fallback message.
  const conversation = await findOrCreateConversation(targetPhone, '');
  const fallback = await Message.create({
    messageId: normalizedMessageId,
    conversationId: conversation?._id,
    from: normalizedSource || 'business',
    to: normalizedDestination || targetPhone,
    text: '',
    type: 'text',
    fileUrl: '',
    filename: '',
    mimeType: '',
    direction: 'out',
    status: normalizedStatus,
    timestamp: toDate(timestamp),
    replyTo: undefined,
  });

  chatDebug('status:update created fallback message', {
    messageId: normalizedMessageId,
    status: normalizedStatus,
    phone: targetPhone,
  });
  return toMessageView(fallback, targetPhone);
};

const getMessagesByPhone = async (phone) => {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) {
    return [];
  }

  const conversation = await Conversation.findOne({ phoneNumber: normalizedPhone }).select('_id phoneNumber');
  if (!conversation?._id) {
    return [];
  }

  const messages = await Message.find({ conversationId: conversation._id }).sort({ timestamp: 1 });
  return messages.map((item) => toMessageView(item, conversation.phoneNumber));
};

const getConversationSummaries = async () => {
  const conversations = await Conversation.find({}).sort({ unreadCount: -1, updatedAt: -1 }).lean();
  return conversations.map((item) => ({
    _id: item.phoneNumber,
    phoneNumber: item.phoneNumber,
    lastMessage: item.lastMessage || '',
    unreadCount: Number(item.unreadCount || 0),
    lastReadAt: item.lastReadAt || null,
    updatedAt: item.updatedAt,
    createdAt: item.createdAt,
  }));
};

const markConversationAsRead = async (phone) => {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) {
    return null;
  }

  return Conversation.findOneAndUpdate(
    { phoneNumber: normalizedPhone },
    {
      $set: {
        unreadCount: 0,
        lastReadAt: new Date(),
      },
    },
    { new: true }
  ).lean();
};

module.exports = {
  normalizePhone,
  normalizeStatus,
  saveMessage,
  updateMessageStatus,
  getMessagesByPhone,
  getConversationSummaries,
  markConversationAsRead,
};
