const Conversation = require('../models/Conversation');
const Message = require('../models/Message');

const isChatDebugEnabled = () => String(process.env.CHAT_DEBUG || '').toLowerCase() === 'true';

const chatDebug = (...args) => {
  if (!isChatDebugEnabled()) {
    return;
  }
  console.log('[CHAT_DEBUG]', ...args);
};

/**
 * Canonical WhatsApp phone: 91XXXXXXXXXX (digits only, no +).
 * - 10-digit Indian mobile → prefix 91
 * - 12-digit starting with 91 → unchanged
 */
const normalizePhone = (value) => {
  if (!value) {
    return '';
  }
  const digits = String(value).replace(/^whatsapp:/i, '').replace(/\D/g, '').trim();
  if (!digits) {
    return '';
  }
  if (digits.length === 10) {
    return `91${digits}`;
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits;
  }
  return digits;
};

/** Legacy 10-digit keys still in DB until migration completes. */
const buildPhoneLookupCandidates = (normalizedPhone) => {
  if (!normalizedPhone) {
    return [];
  }
  const candidates = new Set([normalizedPhone]);
  if (normalizedPhone.length === 12 && normalizedPhone.startsWith('91')) {
    candidates.add(normalizedPhone.slice(2));
  } else if (normalizedPhone.length === 10) {
    candidates.add(`91${normalizedPhone}`);
  }
  return Array.from(candidates);
};

const isPhoneLike = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 10;
};

const maybeNormalizeEndpoint = (value) => {
  const raw = String(value || '').trim();
  if (!raw || raw === 'business') {
    return raw;
  }
  if (!isPhoneLike(raw)) {
    return raw;
  }
  return normalizePhone(raw) || raw;
};

const resolveConversationByPhone = async (phone, { sortByRecent = true } = {}) => {
  const canonicalPhone = normalizePhone(phone);
  if (!canonicalPhone) {
    return { canonicalPhone: '', conversation: null };
  }

  const phoneCandidates = buildPhoneLookupCandidates(canonicalPhone);
  const query = Conversation.findOne({ phoneNumber: { $in: phoneCandidates } });
  let conversation = sortByRecent
    ? await query.sort({ updatedAt: -1 })
    : await query;

  if (conversation && conversation.phoneNumber !== canonicalPhone) {
    const duplicate = await Conversation.findOne({ phoneNumber: canonicalPhone }).select('_id phoneNumber');
    if (duplicate && String(duplicate._id) !== String(conversation._id)) {
      await Message.updateMany(
        { conversationId: conversation._id },
        { $set: { conversationId: duplicate._id } },
      );
      await Conversation.deleteOne({ _id: conversation._id });
      conversation = duplicate;
    } else {
      conversation.phoneNumber = canonicalPhone;
      await conversation.save();
    }
  }

  return { canonicalPhone, conversation };
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
  if (direction === 'in' || direction === 'incoming') {
    return 'in';
  }
  if (direction === 'out' || direction === 'outgoing') {
    return 'out';
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
  const { canonicalPhone, conversation: existing } = await resolveConversationByPhone(phone);
  if (!canonicalPhone) {
    return null;
  }

  const incrementUnreadBy = Math.max(0, Number(options.incrementUnreadBy || 0));
  const update = {};
  if (previewText) {
    update.$set = { lastMessage: previewText };
  }
  if (incrementUnreadBy > 0) {
    update.$inc = { unreadCount: incrementUnreadBy };
  }

  if (existing?._id) {
    if (Object.keys(update).length === 0) {
      return existing;
    }
    return Conversation.findByIdAndUpdate(existing._id, update, { new: true });
  }

  return Conversation.findOneAndUpdate(
    { phoneNumber: canonicalPhone },
    {
      ...update,
      $setOnInsert: { phoneNumber: canonicalPhone },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    },
  );
};

const buildDirectionalEndpoints = (normalized) => {
  const phone = normalized.phone || normalized.destination || normalized.source;
  const isOutgoing = normalized.direction === 'out';

  return {
    phone,
    from: maybeNormalizeEndpoint(normalized.source) || (isOutgoing ? 'business' : phone),
    to: maybeNormalizeEndpoint(normalized.destination) || (isOutgoing ? phone : 'business'),
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
  const { conversation } = await resolveConversationByPhone(phone);
  if (!conversation?._id) {
    return null;
  }

  const statusTime = toDate(timestamp).getTime();
  const windowMs = 15 * 60 * 1000;
  const windowStart = new Date(statusTime - windowMs);
  const windowEnd = new Date(statusTime + windowMs);

  const candidatesQuery = {
    conversationId: conversation._id,
    direction: { $in: ['out', 'outgoing'] },
    timestamp: { $gte: windowStart, $lte: windowEnd },
  };
  const candidates = await Message.find(candidatesQuery).sort({ timestamp: -1 });

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
  const phone = normalizePhone(normalized.phone || endpoints.phone);

  if (normalized.messageId) {
    const existing = await Message.findOne({ messageId: normalized.messageId });
    if (existing) {
      let existingConversationId = existing.conversationId;
      if (!existingConversationId && phone) {
        const existingConversation = await findOrCreateConversation(phone, previewText, { incrementUnreadBy: 0 });
        existingConversationId = existingConversation?._id;
      }

      existing.conversationId = existingConversationId || existing.conversationId;
      existing.from = maybeNormalizeEndpoint(existing.from) || endpoints.from;
      existing.to = maybeNormalizeEndpoint(existing.to) || endpoints.to;
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
  const { canonicalPhone, conversation } = await resolveConversationByPhone(phone);
  if (!canonicalPhone || !conversation?._id) {
    return [];
  }

  const messages = await Message.find({ conversationId: conversation._id }).sort({ timestamp: 1 });
  return messages.map((item) => toMessageView(item, conversation.phoneNumber || canonicalPhone));
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
  const { canonicalPhone, conversation } = await resolveConversationByPhone(phone);
  if (!canonicalPhone || !conversation?._id) {
    return null;
  }

  return Conversation.findByIdAndUpdate(
    conversation._id,
    {
      $set: {
        unreadCount: 0,
        lastReadAt: new Date(),
        phoneNumber: canonicalPhone,
      },
    },
    { new: true },
  ).lean();
};

module.exports = {
  normalizePhone,
  buildPhoneLookupCandidates,
  resolveConversationByPhone,
  maybeNormalizeEndpoint,
  normalizeStatus,
  findOrCreateConversation,
  saveMessage,
  updateMessageStatus,
  getMessagesByPhone,
  getConversationSummaries,
  markConversationAsRead,
};
