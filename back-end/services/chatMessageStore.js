const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');

const INBOUND_DIRECTIONS = ['in', 'incoming'];
const OUTBOUND_DIRECTIONS = ['out', 'outgoing'];

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

/** Hide test/legacy threads from inbox list only (data stays in DB). */
const CHAT_LIST_EXCLUDED_PHONES = ['6384322139', '916384322139'];
const CHAT_LIST_MIN_UPDATED_AT = new Date('2026-05-18T00:00:00.000Z');

const buildExcludedPhoneVariants = () => {
  const variants = new Set();
  for (const phone of CHAT_LIST_EXCLUDED_PHONES) {
    for (const candidate of buildPhoneLookupCandidates(normalizePhone(phone))) {
      variants.add(candidate);
    }
  }
  return variants;
};

const EXCLUDED_CHAT_PHONE_VARIANTS = buildExcludedPhoneVariants();

const isExcludedFromChatList = (phoneNumber) => {
  const candidates = buildPhoneLookupCandidates(normalizePhone(phoneNumber));
  return candidates.some((candidate) => EXCLUDED_CHAT_PHONE_VARIANTS.has(candidate));
};

const shouldShowInChatList = (conversation) => {
  if (!conversation) {
    return false;
  }
  if (isExcludedFromChatList(conversation.phoneNumber)) {
    return false;
  }
  const updatedAt = conversation.updatedAt ? new Date(conversation.updatedAt) : null;
  if (!updatedAt || Number.isNaN(updatedAt.getTime()) || updatedAt < CHAT_LIST_MIN_UPDATED_AT) {
    return false;
  }
  return true;
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

const pickPrimaryConversation = async (canonicalPhone, conversations) => {
  if (!conversations.length) {
    return null;
  }
  if (conversations.length === 1) {
    return conversations[0];
  }

  const conversationIds = conversations.map((item) => item._id);
  const inboundStats = await Message.aggregate([
    {
      $match: {
        conversationId: { $in: conversationIds },
        direction: { $in: INBOUND_DIRECTIONS },
      },
    },
    {
      $group: {
        _id: '$conversationId',
        inboundCount: { $sum: 1 },
        latestInboundAt: { $max: '$timestamp' },
      },
    },
  ]);

  const statsByConversationId = new Map(
    inboundStats.map((item) => [String(item._id), item]),
  );

  let primary = conversations[0];
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const conversation of conversations) {
    const stats = statsByConversationId.get(String(conversation._id)) || {};
    const inboundCount = Number(stats.inboundCount || 0);
    const latestInboundAt = stats.latestInboundAt ? new Date(stats.latestInboundAt).getTime() : 0;
    const canonicalBonus = conversation.phoneNumber === canonicalPhone ? 1e12 : 0;
    const score = canonicalBonus + inboundCount * 1e9 + latestInboundAt;

    if (score > bestScore) {
      bestScore = score;
      primary = conversation;
    }
  }

  return primary;
};

const mergeDuplicateConversations = async (canonicalPhone, conversations) => {
  if (!conversations.length) {
    return null;
  }

  const primary = await pickPrimaryConversation(canonicalPhone, conversations);
  if (!primary?._id) {
    return null;
  }

  const duplicates = conversations.filter((item) => String(item._id) !== String(primary._id));
  let mergedUnread = Number(primary.unreadCount || 0);
  let mergedLastMessage = String(primary.lastMessage || '');
  let mergedLastReadAt = primary.lastReadAt || null;
  let mergedUpdatedAt = primary.updatedAt || primary.createdAt || new Date();

  for (const duplicate of duplicates) {
    await Message.updateMany(
      { conversationId: duplicate._id },
      { $set: { conversationId: primary._id } },
    );

    mergedUnread += Number(duplicate.unreadCount || 0);
    if (!mergedLastMessage && duplicate.lastMessage) {
      mergedLastMessage = String(duplicate.lastMessage);
    }
    if (duplicate.lastReadAt && (!mergedLastReadAt || new Date(duplicate.lastReadAt) > new Date(mergedLastReadAt))) {
      mergedLastReadAt = duplicate.lastReadAt;
    }
    if (duplicate.updatedAt && new Date(duplicate.updatedAt) > new Date(mergedUpdatedAt)) {
      mergedUpdatedAt = duplicate.updatedAt;
    }

    await Conversation.deleteOne({ _id: duplicate._id });
  }

  primary.phoneNumber = canonicalPhone;
  primary.unreadCount = mergedUnread;
  if (mergedLastMessage) {
    primary.lastMessage = mergedLastMessage;
  }
  if (mergedLastReadAt) {
    primary.lastReadAt = mergedLastReadAt;
  }
  primary.updatedAt = mergedUpdatedAt;
  await primary.save();

  return primary;
};

const resolveConversationByPhone = async (phone) => {
  const canonicalPhone = normalizePhone(phone);
  if (!canonicalPhone) {
    return { canonicalPhone: '', conversation: null };
  }

  const phoneCandidates = buildPhoneLookupCandidates(canonicalPhone);
  const conversations = await Conversation.find({ phoneNumber: { $in: phoneCandidates } });
  const conversation = await mergeDuplicateConversations(canonicalPhone, conversations);

  return { canonicalPhone, conversation };
};

const findLastIncomingMessage = async (phone) => {
  const canonicalPhone = normalizePhone(phone);
  if (!canonicalPhone) {
    return null;
  }

  const phoneCandidates = buildPhoneLookupCandidates(canonicalPhone);
  const { conversation } = await resolveConversationByPhone(canonicalPhone);

  const conversationIds = new Set();
  if (conversation?._id) {
    conversationIds.add(conversation._id);
  }

  const relatedConversations = await Conversation.find({ phoneNumber: { $in: phoneCandidates } }).select('_id');
  for (const item of relatedConversations) {
    conversationIds.add(item._id);
  }

  const conversationObjectIds = Array.from(conversationIds).map((id) => (
    id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(String(id))
  ));

  if (conversationObjectIds.length) {
    const byConversation = await Message.findOne({
      conversationId: { $in: conversationObjectIds },
      direction: { $in: INBOUND_DIRECTIONS },
    }).sort({ timestamp: -1 }).select('timestamp direction createdAt messageId conversationId from to');

    if (byConversation) {
      return byConversation;
    }

    const misclassifiedInbound = await Message.findOne({
      conversationId: { $in: conversationObjectIds },
      direction: { $in: OUTBOUND_DIRECTIONS },
      from: { $in: phoneCandidates },
      text: { $nin: ['', null] },
    }).sort({ timestamp: -1 }).select('timestamp direction createdAt messageId conversationId from to');

    if (misclassifiedInbound) {
      misclassifiedInbound.direction = 'in';
      await misclassifiedInbound.save();
      return misclassifiedInbound;
    }
  }

  return Message.findOne({
    direction: { $in: INBOUND_DIRECTIONS },
    $or: [
      { from: { $in: phoneCandidates } },
      { to: { $in: phoneCandidates }, from: { $nin: ['business', ''] } },
    ],
  }).sort({ timestamp: -1 }).select('timestamp direction createdAt messageId conversationId from to');
};

const applyMessageDirection = (existing, incomingDirection) => {
  if (incomingDirection === 'in') {
    existing.direction = 'in';
    return;
  }
  if (incomingDirection === 'out' && existing.direction !== 'in') {
    existing.direction = 'out';
  }
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
    direction: { $in: OUTBOUND_DIRECTIONS },
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
      applyMessageDirection(existing, normalized.direction);
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
  const conversations = await Conversation.find({}).sort({ unreadCount: -1, updatedAt: -1 });
  const groupedByCanonical = new Map();

  for (const conversation of conversations) {
    if (!shouldShowInChatList(conversation)) {
      continue;
    }
    const canonicalPhone = normalizePhone(conversation.phoneNumber);
    if (!canonicalPhone) {
      continue;
    }
    if (!groupedByCanonical.has(canonicalPhone)) {
      groupedByCanonical.set(canonicalPhone, []);
    }
    groupedByCanonical.get(canonicalPhone).push(conversation);
  }

  for (const [canonicalPhone, group] of groupedByCanonical.entries()) {
    if (group.length > 1) {
      await mergeDuplicateConversations(canonicalPhone, group);
    } else if (group[0].phoneNumber !== canonicalPhone) {
      group[0].phoneNumber = canonicalPhone;
      await group[0].save();
    }
  }

  const mergedConversations = await Conversation.find({}).sort({ unreadCount: -1, updatedAt: -1 }).lean();
  return mergedConversations
    .filter(shouldShowInChatList)
    .map((item) => ({
    _id: normalizePhone(item.phoneNumber) || item.phoneNumber,
    phoneNumber: normalizePhone(item.phoneNumber) || item.phoneNumber,
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
  findLastIncomingMessage,
  maybeNormalizeEndpoint,
  normalizeStatus,
  findOrCreateConversation,
  saveMessage,
  updateMessageStatus,
  getMessagesByPhone,
  getConversationSummaries,
  markConversationAsRead,
};
