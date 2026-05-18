const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { sendGupshupTextMessage, sendGupshupFileMessage, sendGupshupTemplateMessage, normalizeDestination } = require('../services/gupshupApiService');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Client = require('../models/Client');
const {
  saveMessage,
  updateMessageStatus,
  getMessagesByPhone,
  getConversationSummaries,
  normalizePhone,
  buildPhoneLookupCandidates,
  resolveConversationByPhone,
  findLastIncomingMessage,
  findOrCreateConversation,
  normalizeStatus,
  markConversationAsRead,
} = require('../services/chatMessageStore');
const { emitChatUpdate } = require('../services/socketService');
const { resolveClientIdByPhone } = require('../services/activityHistoryService');
const { getApprovedTemplates, invalidateTemplateCache } = require('../services/chatTemplateService');
const { ensureUploadsDir, resolveUploadsDir } = require('../config/uploads');

const SESSION_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Gupshup may return #470 if a session send happens within seconds of the inbound webhook. */
const SESSION_ACTIVATION_WINDOW_MS = 5000;
const SESSION_ACTIVATION_DELAY_MS = 3000;
const uploadsDir = ensureUploadsDir(resolveUploadsDir(process.env));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForWhatsappSessionActivation = async (lastIncomingAt) => {
  if (!lastIncomingAt) {
    return;
  }

  const lastIncomingMs = new Date(lastIncomingAt).getTime();
  if (Number.isNaN(lastIncomingMs)) {
    return;
  }

  const ageMs = Date.now() - lastIncomingMs;
  if (ageMs >= 0 && ageMs < SESSION_ACTIVATION_WINDOW_MS) {
    console.log('[SESSION ACTIVATION DELAY]', {
      ageMs,
      delayMs: SESSION_ACTIVATION_DELAY_MS,
      lastIncomingAt,
    });
    await sleep(SESSION_ACTIVATION_DELAY_MS);
  }
};

const isChatDebugEnabled = () => String(process.env.CHAT_DEBUG || '').toLowerCase() === 'true';
const chatDebug = (...args) => {
  if (!isChatDebugEnabled()) {
    return;
  }
  console.log('[CHAT_DEBUG]', ...args);
};

const getPublicBaseUrl = () => {
  if (process.env.PUBLIC_BASE_URL) {
    return process.env.PUBLIC_BASE_URL.replace(/\/$/, '');
  }

  return 'https://api.mukundhaassociates.com';
};

const safeFileName = (name) => String(name || '').replace(/[^a-zA-Z0-9._-]/g, '_');

const resolveAttachmentFilename = (attachmentUrl, attachmentFilename, attachmentMimeType) => {
  const candidateName = String(attachmentFilename || '').trim();
  if (candidateName) {
    return candidateName;
  }

  const fromQuery = (() => {
    try {
      const parsed = new URL(String(attachmentUrl || ''));
      return String(parsed.searchParams.get('fileName') || '').trim();
    } catch (_error) {
      return '';
    }
  })();

  if (fromQuery) {
    return fromQuery;
  }

  const mime = String(attachmentMimeType || '').toLowerCase();
  const extension = mime.includes('pdf')
    ? '.pdf'
    : mime.includes('jpeg') || mime.includes('jpg')
      ? '.jpg'
      : mime.includes('png')
        ? '.png'
        : mime.includes('msword') || mime.includes('wordprocessingml')
          ? '.docx'
          : mime.includes('spreadsheetml') || mime.includes('ms-excel')
            ? '.xlsx'
            : '.bin';

  return `attachment-${Date.now()}${extension}`;
};

const mirrorIncomingAttachmentUrl = async (attachmentUrl, attachmentFilename, attachmentMimeType) => {
  const normalizedUrl = String(attachmentUrl || '').trim();
  if (!normalizedUrl) {
    return { fileUrl: '', filename: attachmentFilename || '' };
  }

  if (/\/uploads\//i.test(normalizedUrl)) {
    return {
      fileUrl: normalizedUrl,
      filename: String(attachmentFilename || '').trim(),
    };
  }

  try {
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const resolvedName = resolveAttachmentFilename(normalizedUrl, attachmentFilename, attachmentMimeType);
    const ext = path.extname(resolvedName || '') || '';
    const base = path.basename(resolvedName || 'attachment', ext);
    const storedName = `${Date.now()}-${safeFileName(base)}${safeFileName(ext)}`;
    const destinationPath = path.join(uploadsDir, storedName);

    const response = await axios.get(normalizedUrl, {
      responseType: 'stream',
      timeout: 30000,
      maxRedirects: 5,
      validateStatus: (status) => status >= 200 && status < 300,
    });

    await new Promise((resolve, reject) => {
      const writer = fs.createWriteStream(destinationPath);
      response.data.pipe(writer);
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    const baseUrl = getPublicBaseUrl();
    return {
      fileUrl: `${baseUrl}/uploads/${encodeURIComponent(storedName)}`,
      filename: resolvedName,
    };
  } catch (_error) {
    return {
      fileUrl: normalizedUrl,
      filename: String(attachmentFilename || '').trim(),
    };
  }
};

const isSessionActiveForPhone = async (phoneNumber) => {
  const state = await getSessionStateForPhone(phoneNumber);
  return state.isActive;
};

const safeLoadTemplates = async (language = '') => {
  try {
    return await getApprovedTemplates({ language });
  } catch (_error) {
    return [];
  }
};

const ensureChatParticipant = async (phoneNumber, { ensureConversation = false } = {}) => {
  const normalizedPhone = normalizePhone(phoneNumber);
  if (!normalizedPhone) {
    return;
  }

  try {
    const { findOrCreateClientByMobile } = require('./clientController');
    await findOrCreateClientByMobile(normalizedPhone);
  } catch (error) {
    console.warn('[ensureChatParticipant] Could not auto-create client for phone:', normalizedPhone, error?.message || error);
  }

  if (!ensureConversation) {
    return;
  }

  try {
    await findOrCreateConversation(normalizedPhone, '', { incrementUnreadBy: 0 });
  } catch (error) {
    console.warn('[ensureChatParticipant] Could not ensure conversation for phone:', normalizedPhone, error?.message || error);
  }
};

const getSessionStateForPhone = async (phoneNumber) => {
  const normalizedPhone = normalizePhone(phoneNumber);
  const phoneCandidates = buildPhoneLookupCandidates(normalizedPhone);
  const now = new Date();
  const { canonicalPhone, conversation } = await resolveConversationByPhone(phoneNumber);

  if (!canonicalPhone) {
    console.log('[SESSION CHECK DEBUG]', {
      phone: phoneNumber,
      normalizedPhone,
      phoneCandidates,
      conversationFound: false,
      lastIncoming: null,
      reason: 'empty_phone',
    });
    return {
      isActive: false,
      lastIncomingAt: null,
      expiresAt: null,
    };
  }

  if (!conversation?._id) {
    console.log('[SESSION CHECK DEBUG]', {
      phone: phoneNumber,
      normalizedPhone: canonicalPhone,
      phoneCandidates,
      conversationFound: false,
      lastIncoming: null,
      reason: 'no_conversation',
      now,
    });
    return {
      isActive: false,
      lastIncomingAt: null,
      expiresAt: null,
    };
  }

  const latestIncoming = await findLastIncomingMessage(canonicalPhone);

  const lastIncomingAt = latestIncoming?.timestamp ? new Date(latestIncoming.timestamp) : null;
  const diffHours = lastIncomingAt
    ? (now.getTime() - lastIncomingAt.getTime()) / (1000 * 60 * 60)
    : null;
  const expiresAt = lastIncomingAt
    ? new Date(lastIncomingAt.getTime() + SESSION_WINDOW_MS)
    : null;
  const isActive = Boolean(lastIncomingAt && Date.now() < expiresAt.getTime());

  console.log('[SESSION CHECK DEBUG]', {
    phone: phoneNumber,
    normalizedPhone: canonicalPhone,
    phoneCandidates,
    conversationId: String(conversation._id),
    conversationPhone: conversation.phoneNumber,
    lastIncoming: latestIncoming
      ? {
        messageId: latestIncoming.messageId,
        direction: latestIncoming.direction,
        timestamp: latestIncoming.timestamp,
        createdAt: latestIncoming.createdAt,
      }
      : null,
    direction: latestIncoming?.direction,
    createdAt: latestIncoming?.createdAt,
    now,
    diffHours: diffHours !== null ? Number(diffHours.toFixed(2)) : null,
    within24h: diffHours !== null ? diffHours < 24 : false,
    isActive,
    expiresAt,
  });

  if (!latestIncoming?.timestamp) {
    return {
      isActive: false,
      lastIncomingAt: null,
      expiresAt: null,
    };
  }

  return {
    isActive,
    lastIncomingAt,
    expiresAt,
  };
};

const sendSessionExpiredResponse = async (res, phoneNumber, options = {}) => {
  const session = await getSessionStateForPhone(phoneNumber);
  const templates = await safeLoadTemplates(options.language);

  return res.status(403).json({
    success: false,
    code: 'WHATSAPP_SESSION_EXPIRED',
    message: 'The 24-hour WhatsApp session has expired. Send a template message to start the conversation.',
    data: {
      phone: normalizePhone(phoneNumber),
      nextAction: 'select_template',
      session: {
        isActive: session.isActive,
        lastIncomingAt: session.lastIncomingAt,
        expiresAt: session.expiresAt,
      },
      templates,
    },
  });
};

// POST /api/chat/start
// Returns WhatsApp session state and available templates for chat initiation.
exports.startChatSession = async (req, res, next) => {
  try {
    const { to, phone, language } = req.body || {};
    const targetPhone = to || phone;
    if (!targetPhone) {
      return res.status(400).json({ success: false, message: 'to is required.' });
    }

    const normalizedPhone = normalizePhone(targetPhone);
    const session = await getSessionStateForPhone(normalizedPhone);
    const templates = await safeLoadTemplates(language);

    return res.status(200).json({
      success: true,
      data: {
        phone: normalizedPhone,
        nextAction: session.isActive ? 'open_chat' : 'select_template',
        session: {
          isActive: session.isActive,
          lastIncomingAt: session.lastIncomingAt,
          expiresAt: session.expiresAt,
        },
        templates,
      },
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/chat/session-status?phone=...
// Returns WhatsApp 24-hour session window state for a phone number (source of truth for UI).
exports.getChatSessionStatus = async (req, res, next) => {
  try {
    const phone = String(req.query?.phone || req.query?.to || '').trim();
    if (!phone) {
      return res.status(400).json({ success: false, message: 'phone query parameter is required.' });
    }

    const normalizedPhone = normalizePhone(phone);
    const session = await getSessionStateForPhone(normalizedPhone);

    const payload = {
      active: session.isActive,
      lastIncomingAt: session.lastIncomingAt,
      expiresAt: session.expiresAt,
      phone: normalizedPhone,
    };

    console.log('[SESSION STATUS RESPONSE]', payload);

    return res.status(200).json({
      success: true,
      data: payload,
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/chat/templates
// Fetches approved WhatsApp templates from provider with cache support.
exports.getChatTemplates = async (req, res, next) => {
  try {
    const language = String(req.query?.language || '').trim();
    const forceRefresh = String(req.query?.refresh || '').toLowerCase() === 'true';
    let templates;
    if (forceRefresh) {
      try {
        templates = await getApprovedTemplates({ language, forceRefresh: true });
      } catch (error) {
        console.warn('[getChatTemplates] Provider refresh failed, returning safe fallback list:', error?.message || error);
        templates = await safeLoadTemplates(language);
      }
    } else {
      templates = await safeLoadTemplates(language);
    }

    return res.status(200).json({
      success: true,
      data: templates,
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/chat/send
// Sends a WhatsApp message through Gupshup and stores a local outgoing record.
exports.sendChatMessage = async (req, res, next) => {
  try {
    console.log('[API REQUEST BODY]', req.body);
    console.log('[SESSION REQUEST BODY]', req.body);

    const { to, message, text } = req.body || {};
    const messageText = String(text || message || '').trim();

    if (!to || !messageText) {
      console.log('[API VALIDATION FAILED]', { reason: 'missing_to_or_text', to, messageText });
      return res.status(400).json({ success: false, message: 'to and text are required.' });
    }

    await ensureChatParticipant(to);

    const normalizedTo = normalizePhone(to);
    const sessionState = await getSessionStateForPhone(to);
    const hasActiveSession = sessionState.isActive;
    console.log('[SESSION CHECK RESULT]', {
      to,
      normalizedPhone: normalizedTo,
      outgoingDestination: normalizeDestination(to),
      hasActiveSession,
      lastIncomingAt: sessionState.lastIncomingAt,
      expiresAt: sessionState.expiresAt,
    });
    console.log('[SESSION CHECK]', {
      to,
      normalizedPhone: normalizedTo,
      outgoingDestination: normalizeDestination(to),
      hasActiveSession,
      lastIncomingAt: sessionState.lastIncomingAt,
      expiresAt: sessionState.expiresAt,
    });

    if (!hasActiveSession) {
      console.log('[API SESSION BLOCKED]', { to, normalizedTo });
      return sendSessionExpiredResponse(res, to, { language: req.body?.language });
    }

    await waitForWhatsappSessionActivation(sessionState.lastIncomingAt);

    console.log('[API CALLING GUPSHUP]', { to, normalizedTo, messageText });
    const result = await sendGupshupTextMessage({ to, message: messageText });
    console.log('[API GUPSHUP OK]', { messageId: result?.messageId, providerResponse: result?.providerResponse });
    const messageId = result.messageId || `local-${Date.now()}`;

    await saveMessage({
      messageId,
      phone: normalizedTo,
      text: messageText,
      type: 'text',
      direction: 'out',
      status: 'sent',
      timestamp: new Date(),
      destination: normalizedTo,
      source: normalizePhone(process.env.GUPSHUP_SOURCE || '916384322139'),
    });

    emitChatUpdate({
      eventType: 'outgoing',
      phone: normalizePhone(to),
      messageId,
      status: 'sent',
      text: messageText,
    });

    const successPayload = {
      success: true,
      data: {
        messageId,
        type: 'text',
      },
    };
    console.log('[API RESPONSE]', successPayload);
    return res.status(200).json(successPayload);
  } catch (error) {
    console.log('[API ERROR]', {
      message: error?.message,
      status: error?.response?.status,
      data: error?.response?.data,
    });
    next(error);
  }
};

// POST /api/chat/send-file
// Sends a WhatsApp file through Gupshup and stores a local outgoing record.
exports.sendChatFile = async (req, res, next) => {
  try {
    const { to, fileUrl, filename, mimeType } = req.body || {};

    if (!to || !fileUrl || !filename) {
      return res.status(400).json({
        success: false,
        message: 'to, fileUrl and filename are required.',
      });
    }

    await ensureChatParticipant(to);

    const normalizedFileUrl = String(fileUrl || '').trim();
    const isSecureUrl = /^https:\/\//i.test(normalizedFileUrl);
    const isLocalDevUrl = /^http:\/\/(localhost|127\.0\.0\.1)/i.test(normalizedFileUrl);
    if (!isSecureUrl && !isLocalDevUrl) {
      return res.status(400).json({
        success: false,
        message: 'fileUrl must be publicly accessible via HTTPS.',
      });
    }

    const sessionState = await getSessionStateForPhone(to);
    if (!sessionState.isActive) {
      return sendSessionExpiredResponse(res, to, { language: req.body?.language });
    }

    await waitForWhatsappSessionActivation(sessionState.lastIncomingAt);

    const result = await sendGupshupFileMessage({
      to,
      fileUrl: normalizedFileUrl,
      filename,
      mimeType: mimeType || '',
    });
    const messageId = result.messageId || `local-file-${Date.now()}`;
    const normalizedTo = normalizePhone(to);

    await saveMessage({
      messageId,
      phone: normalizedTo,
      text: filename,
      type: 'file',
      fileUrl: normalizedFileUrl,
      filename,
      mimeType: mimeType || '',
      direction: 'out',
      status: 'sent',
      timestamp: new Date(),
      destination: normalizedTo,
      source: normalizePhone(process.env.GUPSHUP_SOURCE || '916384322139'),
    });

    emitChatUpdate({
      eventType: 'outgoing',
      phone: normalizePhone(to),
      messageId,
      status: 'sent',
    });

    return res.status(200).json({
      success: true,
      data: {
        messageId,
      },
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/chat/send-template
// Sends a WhatsApp template message through Gupshup and stores a local outgoing record.
exports.sendChatTemplate = async (req, res, next) => {
  try {
    const to = String(req.body?.to || req.body?.phone || '').trim();
    const templateId = String(req.body?.templateId || '').trim();
    const normalizedTo = normalizeDestination(to);

    if (!to) {
      return res.status(400).json({
        success: false,
        message: 'Recipient is required',
      });
    }

    if (!templateId) {
      return res.status(400).json({
        success: false,
        message: 'Template ID required',
      });
    }

    if (!Array.isArray(req.body?.params)) {
      return res.status(400).json({
        success: false,
        message: 'Params must be array',
      });
    }

    const templateParams = req.body.params.map((value) => String(value ?? ''));

    const expectedRaw = req.body?.expectedParamCount ?? req.body?.variableCount;
    const expectedParamCount = Number.parseInt(String(expectedRaw ?? ''), 10);
    if (Number.isFinite(expectedParamCount) && expectedParamCount > 0) {
      if (templateParams.length !== expectedParamCount) {
        return res.status(400).json({
          success: false,
          message: `Template requires ${expectedParamCount} parameter(s)`,
        });
      }
      const allFilled = templateParams.every((p) => String(p).trim() !== '');
      if (!allFilled) {
        return res.status(400).json({
          success: false,
          message: 'Template parameters required',
        });
      }
    }

    console.log('[TEMPLATE REQUEST]', {
      templateId,
      params: templateParams,
    });

    if (!/^91\d{10}$/.test(normalizedTo)) {
      return res.status(400).json({
        success: false,
        message: 'Recipient must be a valid WhatsApp number in 91XXXXXXXXXX format.',
      });
    }

    await ensureChatParticipant(normalizedTo);

    console.log('[TEMPLATE SEND CONFIRM]', {
      type: 'template',
      templateId,
    });

    const result = await sendGupshupTemplateMessage({
      to: normalizedTo,
      templateId,
      params: templateParams,
    });

    const messageId = result.messageId || `local-template-${Date.now()}`;
    console.log(`[sendChatTemplate] Template "${templateId}" sent to ${normalizedTo}, messageId=${messageId}.`);

    const summaryText = `Template: ${templateId}`;
    await saveMessage({
      messageId,
      phone: normalizedTo,
      text: summaryText,
      type: 'text',
      direction: 'out',
      status: 'sent',
      timestamp: new Date(),
      destination: normalizedTo,
      source: normalizePhone(process.env.GUPSHUP_SOURCE || '916384322139'),
    });

    emitChatUpdate({
      eventType: 'outgoing',
      phone: normalizePhone(normalizedTo),
      messageId,
      status: 'sent',
    });

    return res.status(200).json({
      success: true,
      data: {
        messageId,
        type: 'template',
        templateId,
        status: 'sent',
      },
    });
  } catch (error) {
    console.error('[TEMPLATE ERROR]', error?.response?.data || error?.message || error);
    return res.status(400).json({
      success: false,
      message: error?.response?.data?.message || error?.message || 'Failed to send template message.',
    });
  }
};

// POST /api/chat/templates/refresh
// Invalidates the in-memory template cache and returns a fresh list from the provider.
exports.refreshChatTemplates = async (req, res, next) => {
  try {
    invalidateTemplateCache();
    console.log('[refreshChatTemplates] Template cache invalidated, fetching fresh list.');
    let templates = [];
    let usedFallback = false;
    try {
      templates = await getApprovedTemplates({ forceRefresh: true });
    } catch (error) {
      usedFallback = true;
      console.warn('[refreshChatTemplates] Provider refresh failed, returning fallback list:', error?.message || error);
      templates = await safeLoadTemplates();
    }

    return res.status(200).json({
      success: true,
      message: usedFallback
        ? 'Template cache refresh failed at provider; returned fallback template list.'
        : 'Template cache refreshed.',
      data: templates,
    });
  } catch (error) {
    console.error('[refreshChatTemplates] Failed to refresh template cache:', error?.message || error);
    next(error);
  }
};

// POST /webhook/gupshup helper
// Normalizes and stores incoming/status events from Gupshup webhook payload.
exports.processGupshupWebhook = async (body) => {
  const payload = body?.payload || {};
  const nestedPayload = payload?.payload || {};
  const sender = payload?.sender || {};
  const context = payload?.context || {};
  const eventType = String(body?.type || '').toLowerCase();
  const businessSource = normalizePhone(process.env.GUPSHUP_SOURCE || '916384322139');
  const payloadType = String(payload.type || nestedPayload.type || '').toLowerCase();
  const mediaPayloadTypes = new Set(['image', 'file', 'document', 'video', 'audio', 'sticker']);
  const rawStatus = payload.status || nestedPayload.status || payload.eventType || nestedPayload.eventType || payloadType;
  const hasExplicitStatus = ['sent', 'submitted', 'enqueued', 'queued', 'delivered', 'read', 'failed'].includes(String(rawStatus || '').toLowerCase());

  const payloadImage = payload.image || nestedPayload.image || {};
  const payloadDocument = payload.document || nestedPayload.document || {};
  const payloadMedia = payload.media || nestedPayload.media || {};
  const payloadFile = payload.file || nestedPayload.file || {};

  const messageId =
    payload.id ||
    payload.messageId ||
    payload.gsId ||
    payload.message_id ||
    nestedPayload.id ||
    nestedPayload.messageId ||
    nestedPayload.gsId ||
    nestedPayload.message_id ||
    '';
  const destination = normalizePhone(
    payload.destination ||
      payload.to ||
      nestedPayload.destination ||
      nestedPayload.to ||
      context.destination ||
      context.to ||
      context.phone
  );
  const source = normalizePhone(
    payload.source ||
      payload.from ||
      nestedPayload.source ||
      nestedPayload.from ||
      sender.phone ||
      sender.id ||
      context.source ||
      context.from
  );
  const status = normalizeStatus(rawStatus, 'sent');
  const normalizedPayloadType = String(payloadType || '').toLowerCase();
  const isMediaType = Boolean(normalizedPayloadType && normalizedPayloadType !== 'text');
  const text =
    payload.text ||
    payload.body ||
    payload.message ||
    nestedPayload.text ||
    nestedPayload.body ||
    nestedPayload.message ||
    nestedPayload.caption ||
    '';
  const attachmentUrlCandidate =
    payload.url ||
    payload.link ||
    payload.originalUrl ||
    nestedPayload.url ||
    nestedPayload.link ||
    nestedPayload.originalUrl ||
    payloadImage.url ||
    payloadImage.link ||
    payloadImage.originalUrl ||
    payloadImage.previewUrl ||
    payloadDocument.url ||
    payloadDocument.link ||
    payloadDocument.originalUrl ||
    payloadDocument.previewUrl ||
    payloadMedia.url ||
    payloadMedia.link ||
    payloadMedia.originalUrl ||
    payloadMedia.previewUrl ||
    payloadFile.url ||
    payloadFile.link ||
    payloadFile.originalUrl ||
    payloadFile.previewUrl ||
    payload?.file?.link ||
    payload?.file?.url ||
    nestedPayload?.image?.url ||
    nestedPayload?.image?.link ||
    nestedPayload?.image?.originalUrl ||
    nestedPayload?.image?.previewUrl ||
    nestedPayload?.document?.url ||
    nestedPayload?.document?.link ||
    nestedPayload?.document?.originalUrl ||
    nestedPayload?.document?.previewUrl ||
    nestedPayload?.media?.url ||
    nestedPayload?.media?.link ||
    nestedPayload?.media?.originalUrl ||
    nestedPayload?.media?.previewUrl ||
    nestedPayload?.file?.link ||
    nestedPayload?.file?.url ||
    '';
  let attachmentFilename =
    payload.filename ||
    payloadImage.filename ||
    payloadDocument.filename ||
    payloadMedia.filename ||
    payloadFile.filename ||
    payloadImage.caption ||
    payloadDocument.caption ||
    nestedPayload.filename ||
    nestedPayload?.image?.filename ||
    nestedPayload?.document?.filename ||
    nestedPayload?.media?.filename ||
    nestedPayload?.file?.filename ||
    '';
  const attachmentMimeType =
    payload.mimeType ||
    payload.mimetype ||
    payloadImage.mimeType ||
    payloadImage.mimetype ||
    payloadImage.contentType ||
    payloadDocument.mimeType ||
    payloadDocument.mimetype ||
    payloadDocument.contentType ||
    payloadMedia.mimeType ||
    payloadMedia.mimetype ||
    payloadMedia.contentType ||
    payloadFile.mimeType ||
    payloadFile.mimetype ||
    payloadFile.contentType ||
    nestedPayload.mimeType ||
    nestedPayload.mimetype ||
    nestedPayload?.image?.mimeType ||
    nestedPayload?.image?.mimetype ||
    nestedPayload?.image?.contentType ||
    nestedPayload?.document?.mimeType ||
    nestedPayload?.document?.mimetype ||
    nestedPayload?.document?.contentType ||
    nestedPayload?.media?.mimeType ||
    nestedPayload?.media?.mimetype ||
    nestedPayload?.media?.contentType ||
    nestedPayload?.file?.mimeType ||
    nestedPayload?.file?.mimetype ||
    '';
  const hasStructuredMediaUrl = Boolean(
    payloadImage.url || payloadImage.link || payloadImage.originalUrl || payloadImage.previewUrl ||
    payloadDocument.url || payloadDocument.link || payloadDocument.originalUrl || payloadDocument.previewUrl ||
    payloadMedia.url || payloadMedia.link || payloadMedia.originalUrl || payloadMedia.previewUrl ||
    payloadFile.url || payloadFile.link || payloadFile.originalUrl || payloadFile.previewUrl ||
    nestedPayload?.image?.url || nestedPayload?.image?.link || nestedPayload?.image?.originalUrl || nestedPayload?.image?.previewUrl ||
    nestedPayload?.document?.url || nestedPayload?.document?.link || nestedPayload?.document?.originalUrl || nestedPayload?.document?.previewUrl ||
    nestedPayload?.media?.url || nestedPayload?.media?.link || nestedPayload?.media?.originalUrl || nestedPayload?.media?.previewUrl ||
    nestedPayload?.file?.url || nestedPayload?.file?.link
  );
  const hasMediaHints = mediaPayloadTypes.has(payloadType)
    || Boolean(attachmentFilename)
    || Boolean(attachmentMimeType)
    || hasStructuredMediaUrl;
  const attachmentUrl = hasMediaHints ? attachmentUrlCandidate : '';

  // Derive messageType early so we can fall back mimeType for images
  const messageType = String(
    payload.type || nestedPayload.type || (attachmentUrl ? 'file' : 'text')
  ).toLowerCase();
  const resolvedMimeType = attachmentMimeType || (messageType === 'image' ? 'image/jpeg' : '');
  const isKnownMediaType = mediaPayloadTypes.has(messageType);
  const hasAttachmentPayload = Boolean(isKnownMediaType || attachmentUrl);
  const persistedFilename = hasAttachmentPayload ? attachmentFilename : '';
  const persistedMimeType = hasAttachmentPayload ? resolvedMimeType : '';
  const displayText = text || attachmentFilename || (isMediaType ? normalizedPayloadType : '');
  const reason = payload.reason || nestedPayload.reason || '';
  const eventTimestamp = payload.timestamp || nestedPayload.timestamp || new Date();
  const isFromBusiness = Boolean(
    businessSource &&
      ((source && source === businessSource) || (destination && destination !== businessSource && source === businessSource))
  );
  const phone = isFromBusiness ? destination : (source || destination);

  const isStatusUpdate = Boolean(payload.status || nestedPayload.status || hasExplicitStatus);
  const isIncomingEvent = eventType.includes('message') || (!isStatusUpdate && (Boolean(displayText) || isMediaType || Boolean(attachmentUrl)));

  if (isStatusUpdate) {
    chatDebug('gupshup:status received', {
      eventType,
      rawStatus,
      normalizedStatus: status,
      messageId: messageId || '(missing)',
      phone,
      source,
      destination,
    });
    const updated = await updateMessageStatus({
      messageId,
      status,
      destination,
      source,
      timestamp: eventTimestamp,
      reason,
      phone,
    });

    chatDebug('gupshup:status persisted', {
      messageId: messageId || '(missing)',
      status,
      phone,
      updated: Boolean(updated),
      updatedMessageId: updated?.messageId,
    });

    emitChatUpdate({
      eventType: 'status',
      phone,
      messageId,
      status,
      source,
      destination,
    });

    chatDebug('gupshup:status socket emitted', {
      eventType: 'status',
      phone,
      messageId,
      status,
    });
    return updated;
  }

  if (isIncomingEvent) {
    // Ignore non-status events that have no text and no usable phone fields.
    if (!String(text || '').trim() && !source && !destination) {
      return null;
    }

    let persistedAttachmentUrl = attachmentUrl;
    if (attachmentUrl) {
      const mirrored = await mirrorIncomingAttachmentUrl(attachmentUrl, attachmentFilename, attachmentMimeType);
      persistedAttachmentUrl = mirrored.fileUrl || attachmentUrl;
      if (!attachmentFilename && mirrored.filename) {
        attachmentFilename = mirrored.filename;
      }
    }

    const inboundDirection = isFromBusiness ? 'out' : 'in';
    const normalizedCustomerPhone = normalizePhone(phone);

    const saved = await saveMessage({
      messageId: messageId || `incoming-${Date.now()}`,
      phone: normalizedCustomerPhone,
      text: displayText,
      type: isKnownMediaType || attachmentUrl ? 'file' : 'text',
      fileUrl: persistedAttachmentUrl,
      filename: persistedFilename,
      mimeType: persistedMimeType,
      direction: inboundDirection,
      status: 'sent',
      timestamp: eventTimestamp,
      source,
      destination,
    });

    console.log('[INCOMING MESSAGE SAVED]', {
      phone: normalizedCustomerPhone,
      rawPhone: phone,
      source,
      destination,
      businessSource,
      isFromBusiness,
      direction: saved?.direction || inboundDirection,
      createdAt: saved?.timestamp || eventTimestamp,
      messageId: saved?.messageId || messageId,
    });

    chatDebug('gupshup:incoming saved', {
      phone,
      messageId: saved?.messageId,
      stored: Boolean(saved),
      status: saved?.status,
      direction: saved?.direction,
    });

    // Auto-create client record for unknown inbound senders
    let resolvedClientId = null;
    if (!isFromBusiness && normalizedCustomerPhone) {
      try {
        const { findOrCreateClientByMobile } = require('./clientController');
        const client = await findOrCreateClientByMobile(normalizedCustomerPhone);
        resolvedClientId = client?._id || null;
      } catch (_) {
        // Non-critical – never block message save
      }
    }

    emitChatUpdate({
      eventType: isFromBusiness ? 'outgoing' : 'incoming',
      phone: normalizedCustomerPhone,
      messageId: saved.messageId,
      status: 'sent',
      text,
      source,
      destination,
    });

    return saved;
  }

  return null;
};

// GET /api/chat/:phone
// Returns all message records for a phone number sorted by timestamp.
exports.getChatByPhone = async (req, res, next) => {
  try {
    const phone = req.params.phone;
    if (!phone) {
      return res.status(400).json({ success: false, message: 'phone is required.' });
    }

    const messages = (await getMessagesByPhone(phone)).map((item) => ({
      phone: item.phone,
      text: item.text,
      type: item.type || 'text',
      fileUrl: item.fileUrl || '',
      filename: item.filename || '',
      mimeType: item.mimeType || '',
      direction: item.direction,
      status: item.status,
      timestamp: item.timestamp,
      messageId: item.messageId,
    }));

    return res.status(200).json({
      success: true,
      data: messages,
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/chat/conversations
// Returns chat conversation summaries for sidebar listing.
exports.getChatConversations = async (req, res, next) => {
  try {
    const rawConversations = await getConversationSummaries();
    const phoneKeys = [...new Set(rawConversations.map((item) => normalizePhone(item.phoneNumber)).filter(Boolean))];

    const lookupValues = [...new Set(phoneKeys.flatMap((phone) => {
      const withCountryCode = phone.startsWith('91') ? phone : `91${phone}`;
      return [phone, withCountryCode, `+${phone}`, `+${withCountryCode}`];
    }))];

    const clients = lookupValues.length
      ? await Client.find({
          $or: [
            { mobile: { $in: lookupValues } },
            { alternateMobile: { $in: lookupValues } },
          ],
        }).select('name mobile alternateMobile')
      : [];

    const nameByPhone = new Map();
    clients.forEach((client) => {
      const normalizedMobile = normalizePhone(client.mobile || '');
      const normalizedAlternate = normalizePhone(client.alternateMobile || '');

      if (normalizedMobile && !nameByPhone.has(normalizedMobile)) {
        nameByPhone.set(normalizedMobile, client.name);
      }
      if (normalizedAlternate && !nameByPhone.has(normalizedAlternate)) {
        nameByPhone.set(normalizedAlternate, client.name);
      }
    });

    const conversations = rawConversations.map((item) => {
      const normalizedPhone = normalizePhone(item.phoneNumber);
      const matchedName = nameByPhone.get(normalizedPhone) || '';

      return {
        ...item,
        clientName: matchedName,
        unreadCount: Number(item.unreadCount || 0),
        updatedAt: new Date(item.updatedAt).toISOString(),
      };
    });

    return res.status(200).json({
      success: true,
      data: conversations,
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/chat/:phone/read
// Marks a conversation as read and resets unread count.
exports.markConversationRead = async (req, res, next) => {
  try {
    const phone = req.params.phone;
    if (!phone) {
      return res.status(400).json({ success: false, message: 'phone is required.' });
    }

    const updatedConversation = await markConversationAsRead(phone);

    emitChatUpdate({
      eventType: 'read',
      phone: normalizePhone(phone),
      status: 'read',
    });

    return res.status(200).json({
      success: true,
      data: {
        phoneNumber: updatedConversation?.phoneNumber || normalizePhone(phone),
        unreadCount: Number(updatedConversation?.unreadCount || 0),
        lastReadAt: updatedConversation?.lastReadAt || null,
      },
    });
  } catch (error) {
    next(error);
  }
};
