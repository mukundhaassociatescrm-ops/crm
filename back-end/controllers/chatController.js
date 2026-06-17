const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { applyCampaignDeliveryUpdate } = require('../services/campaignRecipientStatusService');
const {
  sendGupshupTextMessage,
  sendGupshupFileMessage,
  sendGupshupTemplateMessage,
  normalizeDestination,
  resolveGupshupSource,
} = require('../services/gupshupApiService');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Client = require('../models/Client');
const {
  saveMessage,
  buildTemplateDisplayText,
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
  softDeleteMessage,
  toggleMessageImportant,
} = require('../services/chatMessageStore');
const { emitChatUpdate } = require('../services/socketService');
const { resolveClientIdByPhone } = require('../services/activityHistoryService');
const { getApprovedTemplates, unwrapTemplateResult, invalidateTemplateCache, findTemplateById, templateRequiresImageHeader } = require('../services/chatTemplateService');
const { validateWhatsAppImageMediaUrl } = require('../services/whatsappTemplateMediaService');
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

const mimeIncludes = (mimeType, value) => String(mimeType || '').toLowerCase().includes(value);

const resolveExtensionFromMimeType = (mimeType) => {
  const mime = String(mimeType || '').toLowerCase();
  if (mimeIncludes(mime, 'pdf')) return '.pdf';
  if (mimeIncludes(mime, 'jpeg') || mimeIncludes(mime, 'jpg')) return '.jpg';
  if (mimeIncludes(mime, 'png')) return '.png';
  if (mimeIncludes(mime, 'audio/ogg') || mimeIncludes(mime, 'ogg') || mimeIncludes(mime, 'opus')) return '.ogg';
  if (mimeIncludes(mime, 'audio/mpeg') || mimeIncludes(mime, 'mp3')) return '.mp3';
  if (mimeIncludes(mime, 'audio/wav') || mimeIncludes(mime, 'wav')) return '.wav';
  if (mimeIncludes(mime, 'video/mp4')) return '.mp4';
  if (mimeIncludes(mime, 'video/webm')) return '.webm';
  if (mimeIncludes(mime, 'video/ogg')) return '.ogv';
  if (mimeIncludes(mime, 'video/quicktime')) return '.mov';
  if (mimeIncludes(mime, 'msword') || mimeIncludes(mime, 'wordprocessingml')) return '.docx';
  if (mimeIncludes(mime, 'spreadsheetml') || mimeIncludes(mime, 'ms-excel')) return '.xlsx';
  return '.bin';
};

const resolveMediaType = (messageType, mimeType, filename = '', fileUrl = '') => {
  const normalizedType = String(messageType || '').toLowerCase();
  const normalizedMimeType = String(mimeType || '').toLowerCase();
  const normalizedName = String(filename || '').toLowerCase();
  const normalizedUrl = String(fileUrl || '').toLowerCase();

  if (normalizedType === 'video') {
    return 'video';
  }
  if (normalizedType === 'audio') {
    return 'audio';
  }
  if (normalizedMimeType.startsWith('audio/') || /\.(ogg|mp3|wav|m4a|aac)(\?|$)/i.test(normalizedName) || /\.(ogg|mp3|wav|m4a|aac)(\?|$)/i.test(normalizedUrl)) {
    return 'audio';
  }
  if (normalizedMimeType.startsWith('video/') || /\.(mp4|webm|ogv|mov|m4v)(\?|$)/i.test(normalizedName) || /\.(mp4|webm|ogv|mov|m4v)(\?|$)/i.test(normalizedUrl)) {
    return 'video';
  }
  if (normalizedType === 'image' || normalizedMimeType.startsWith('image/')) {
    return 'image';
  }
  if (normalizedType === 'document' || normalizedType === 'file') {
    return 'document';
  }
  return normalizedType || '';
};

const resolveAttachmentFilename = (attachmentUrl, attachmentFilename, attachmentMimeType) => {
  const candidateName = String(attachmentFilename || '').trim();
  if (candidateName) {
    const candidateExtension = path.extname(candidateName);
    if (candidateExtension) {
      return candidateName;
    }
    return `${candidateName}${resolveExtensionFromMimeType(attachmentMimeType)}`;
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

  const fromPath = (() => {
    try {
      const parsed = new URL(String(attachmentUrl || ''));
      const basename = path.basename(decodeURIComponent(parsed.pathname || ''));
      return path.extname(basename) ? basename : '';
    } catch (_error) {
      return '';
    }
  })();

  if (fromPath) {
    return fromPath;
  }

  const extension = resolveExtensionFromMimeType(attachmentMimeType);

  return `attachment-${Date.now()}${extension}`;
};

const mirrorIncomingAttachmentUrl = async (attachmentUrl, attachmentFilename, attachmentMimeType) => {
  const normalizedUrl = String(attachmentUrl || '').trim();
  if (!normalizedUrl) {
    return { fileUrl: '', filename: attachmentFilename || '', mimeType: attachmentMimeType || '' };
  }

  if (/\/uploads\//i.test(normalizedUrl)) {
    return {
      fileUrl: normalizedUrl,
      filename: String(attachmentFilename || '').trim(),
      mimeType: attachmentMimeType || '',
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
      mimeType: attachmentMimeType || response.headers?.['content-type'] || '',
    };
  } catch (_error) {
    return {
      fileUrl: normalizedUrl,
      filename: String(attachmentFilename || '').trim(),
      mimeType: attachmentMimeType || '',
    };
  }
};

const isSessionActiveForPhone = async (phoneNumber) => {
  const state = await getSessionStateForPhone(phoneNumber);
  return state.isActive;
};

const safeLoadTemplates = async (language = '') => {
  try {
    return unwrapTemplateResult(await getApprovedTemplates({ language })).templates;
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

    console.log('[CHAT TEMPLATE API HIT] controller', {
      language: language || 'all',
      forceRefresh,
    });

    const templateResult = unwrapTemplateResult(
      await getApprovedTemplates({ language, forceRefresh }),
    );

    const responsePayload = {
      success: true,
      data: templateResult.templates,
      meta: {
        source: templateResult.source,
      },
    };

    console.log('[FINAL TEMPLATE RESPONSE TO UI]', {
      success: responsePayload.success,
      source: responsePayload.meta.source,
      templateCount: responsePayload.data.length,
      templateNames: responsePayload.data.map((item) => item.name || item.id),
    });

    return res.status(200).json(responsePayload);
  } catch (error) {
    console.log('[TEMPLATE FETCH ERROR]', {
      message: error?.message,
      status: error?.response?.status,
      responseData: error?.response?.data,
    });
    console.log('[FALLBACK TEMPLATE USED]', {
      mode: 'controller_catch',
      source: 'FALLBACK',
      templateCount: 0,
    });

    const fallbackPayload = {
      success: true,
      data: [],
      meta: { source: 'FALLBACK' },
    };

    console.log('[FINAL TEMPLATE RESPONSE TO UI]', {
      success: fallbackPayload.success,
      source: fallbackPayload.meta.source,
      templateCount: 0,
    });

    return res.status(200).json(fallbackPayload);
  }
};

// POST /api/chat/send
// Sends a WhatsApp message through Gupshup and stores a local outgoing record.
exports.sendChatMessage = async (req, res, next) => {
  try {
    console.log('--- API REQUEST START ---');
    console.log('[API REQUEST BODY]', req.body);

    const { to, message, text } = req.body || {};
    const messageText = String(text || message || '').trim();

    if (!to || !messageText) {
      console.log('[API VALIDATION FAILED]', { reason: 'missing_to_or_text', to, messageText });
      return res.status(400).json({ success: false, message: 'to and text are required.' });
    }

    await ensureChatParticipant(to);

    const normalizedTo = normalizePhone(to);
    console.log('[API NORMALIZED]', { to, normalizedTo });

    const sessionState = await getSessionStateForPhone(to);
    const hasActiveSession = sessionState.isActive;
    console.log('[SESSION CHECK RESULT]', {
      hasActiveSession,
      lastIncoming: sessionState.lastIncomingAt,
      expiresAt: sessionState.expiresAt,
    });

    if (!hasActiveSession) {
      console.log('[API SESSION BLOCKED]', {
        to,
        normalizedTo,
        reason: 'No active session',
      });
      return sendSessionExpiredResponse(res, to, { language: req.body?.language });
    }

    await waitForWhatsappSessionActivation(sessionState.lastIncomingAt);

    console.log('[API CALLING GUPSHUP]', {
      to: normalizedTo,
      text: messageText,
    });
    const result = await sendGupshupTextMessage({ to, message: messageText });
    console.log('[API GUPSHUP OK]', result);
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
      source: resolveGupshupSource(),
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
    console.log('[API ERROR]', error?.response?.data || error.message);
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
    const mediaType = resolveMediaType('file', mimeType || '', filename, normalizedFileUrl);

    await saveMessage({
      messageId,
      phone: normalizedTo,
      text: filename,
      type: 'file',
      fileUrl: normalizedFileUrl,
      filename,
      mimeType: mimeType || '',
      mediaType,
      mediaUrl: normalizedFileUrl,
      direction: 'out',
      status: 'sent',
      timestamp: new Date(),
      destination: normalizedTo,
      source: resolveGupshupSource(),
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
    const templateName = String(req.body?.templateName || '').trim();
    const templateBody = String(req.body?.templateBody || '').trim();
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
    const rawMediaUrl = String(
      req.body?.mediaUrl
      || req.body?.attachmentUrl
      || req.body?.imageUrl
      || '',
    ).trim();

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
      templateName,
      templateBody: templateBody ? `${templateBody.slice(0, 80)}...` : '',
      params: templateParams,
      mediaUrl: rawMediaUrl || null,
    });

    const templateMeta = await findTemplateById(templateId);
    const requiresImage = templateRequiresImageHeader(templateMeta);
    if (requiresImage && !rawMediaUrl) {
      return res.status(400).json({
        success: false,
        message: 'This template requires an image.',
      });
    }

    let validatedMediaUrl = '';
    if (rawMediaUrl) {
      validatedMediaUrl = await validateWhatsAppImageMediaUrl(rawMediaUrl);
    }

    if (!/^91\d{10}$/.test(normalizedTo)) {
      return res.status(400).json({
        success: false,
        message: 'Recipient must be a valid WhatsApp number in 91XXXXXXXXXX format.',
      });
    }

    await ensureChatParticipant(normalizedTo);

    console.log('TEMPLATE SEND START');
    console.log('[TEMPLATE SEND CONFIRM]', {
      type: 'template',
      templateId,
      destination: normalizedTo,
      paramCount: templateParams.length,
    });

    const result = await sendGupshupTemplateMessage({
      to: normalizedTo,
      templateId,
      templateName,
      params: templateParams,
      mediaUrl: validatedMediaUrl,
    });

    const messageId = result.messageId || `local-template-${Date.now()}`;
    const providerStatus = result.providerStatus || 'submitted';

    console.log('PROVIDER ACCEPTED', {
      messageId,
      providerStatus,
      providerResponse: result.providerResponse,
    });

    const displayText = buildTemplateDisplayText({
      templateBody,
      templateName,
      templateId,
      params: templateParams,
    });

    let persistenceWarning = '';
    try {
      await saveMessage({
        messageId,
        phone: normalizedTo,
        text: displayText,
        type: 'text',
        direction: 'out',
        status: 'sent',
        timestamp: new Date(),
        destination: normalizedTo,
        source: resolveGupshupSource(),
        templateId,
        templateName,
        templateBody,
        templateParams,
      });
      console.log('DB SAVE SUCCESS', { messageId, phone: normalizedTo });
    } catch (persistError) {
      persistenceWarning = persistError?.message || String(persistError);
      console.error('[TEMPLATE PERSIST ERROR]', {
        messageId,
        phone: normalizedTo,
        message: persistenceWarning,
      });
    }

    try {
      emitChatUpdate({
        eventType: 'outgoing',
        phone: normalizePhone(normalizedTo),
        messageId,
        status: 'sent',
      });
      console.log('SOCKET EMIT SUCCESS', { messageId, eventType: 'outgoing' });
    } catch (socketError) {
      const socketMessage = socketError?.message || String(socketError);
      persistenceWarning = persistenceWarning
        ? `${persistenceWarning}; socket: ${socketMessage}`
        : `socket: ${socketMessage}`;
      console.error('[TEMPLATE SOCKET ERROR]', { messageId, message: socketMessage });
    }

    console.log('FINAL MESSAGE STATUS', {
      messageId,
      uiStatus: 'submitted',
      providerStatus,
      persistenceWarning: persistenceWarning || null,
    });

    return res.status(200).json({
      success: true,
      data: {
        messageId,
        type: 'template',
        templateId,
        status: 'submitted',
        providerStatus,
      },
      ...(persistenceWarning ? { persistenceWarning } : {}),
    });
  } catch (error) {
    console.error('[TEMPLATE SEND FAILED]', {
      httpStatus: error?.response?.status || null,
      message: error?.response?.data?.message || error?.message || String(error),
      body: error?.response?.data || null,
    });
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
      templates = unwrapTemplateResult(await getApprovedTemplates({ forceRefresh: true })).templates;
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

const extractGupshupFailureDetails = (body) => {
  const payload = body?.payload || {};
  const nestedPayload = payload?.payload || {};

  const reason = String(
    payload.reason
    || nestedPayload.reason
    || payload.error
    || nestedPayload.error
    || payload.message
    || nestedPayload.message
    || payload.description
    || nestedPayload.description
    || '',
  ).trim();

  const failureCode = String(
    payload.code
    || nestedPayload.code
    || payload.errorCode
    || nestedPayload.errorCode
    || payload.statusCode
    || nestedPayload.statusCode
    || body?.code
    || '',
  ).trim();

  return {
    reason,
    failureCode,
    providerResponse: {
      type: body?.type || null,
      status: payload.status || nestedPayload.status || null,
      reason: reason || null,
      code: failureCode || null,
      payload,
      nestedPayload: Object.keys(nestedPayload).length ? nestedPayload : null,
    },
    webhookPayload: body,
  };
};

// POST /webhook/gupshup helper
// Normalizes and stores incoming/status events from Gupshup webhook payload.
exports.processGupshupWebhook = async (body) => {
  console.log('[WEBHOOK EVENT]', { type: body?.type });

  const payload = body?.payload || {};
  const nestedPayload = payload?.payload || {};
  const sender = payload?.sender || {};
  const context = payload?.context || {};
  const eventType = String(body?.type || '').toLowerCase();
  let businessSource = '';
  try {
    businessSource = resolveGupshupSource();
  } catch (error) {
    console.error('[WEBHOOK] GUPSHUP_SOURCE not configured:', error?.message || error);
    return null;
  }
  const payloadType = String(payload.type || nestedPayload.type || '').toLowerCase();
  const mediaPayloadTypes = new Set(['image', 'file', 'document', 'video', 'audio', 'sticker']);
  const rawStatus = payload.status || nestedPayload.status || payload.eventType || nestedPayload.eventType || payloadType;
  const hasExplicitStatus = ['sent', 'submitted', 'enqueued', 'queued', 'delivered', 'read', 'failed'].includes(String(rawStatus || '').toLowerCase());

  const payloadImage = payload.image || nestedPayload.image || {};
  const payloadAudio = payload.audio || nestedPayload.audio || {};
  const payloadVideo = payload.video || nestedPayload.video || {};
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
    payloadAudio.url ||
    payloadAudio.link ||
    payloadAudio.originalUrl ||
    payloadAudio.previewUrl ||
    payloadVideo.url ||
    payloadVideo.link ||
    payloadVideo.originalUrl ||
    payloadVideo.previewUrl ||
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
    nestedPayload?.audio?.url ||
    nestedPayload?.audio?.link ||
    nestedPayload?.audio?.originalUrl ||
    nestedPayload?.audio?.previewUrl ||
    nestedPayload?.video?.url ||
    nestedPayload?.video?.link ||
    nestedPayload?.video?.originalUrl ||
    nestedPayload?.video?.previewUrl ||
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
    payload.fileName ||
    payload.name ||
    payloadImage.filename ||
    payloadImage.fileName ||
    payloadAudio.filename ||
    payloadAudio.fileName ||
    payloadVideo.filename ||
    payloadVideo.fileName ||
    payloadVideo.name ||
    payloadDocument.filename ||
    payloadDocument.fileName ||
    payloadMedia.filename ||
    payloadMedia.fileName ||
    payloadFile.filename ||
    payloadFile.fileName ||
    payloadImage.caption ||
    payloadAudio.caption ||
    payloadVideo.caption ||
    payloadDocument.caption ||
    nestedPayload.filename ||
    nestedPayload.fileName ||
    nestedPayload.name ||
    nestedPayload?.image?.filename ||
    nestedPayload?.image?.fileName ||
    nestedPayload?.audio?.filename ||
    nestedPayload?.audio?.fileName ||
    nestedPayload?.video?.filename ||
    nestedPayload?.video?.fileName ||
    nestedPayload?.video?.name ||
    nestedPayload?.document?.filename ||
    nestedPayload?.document?.fileName ||
    nestedPayload?.media?.filename ||
    nestedPayload?.media?.fileName ||
    nestedPayload?.file?.filename ||
    nestedPayload?.file?.fileName ||
    '';
  const attachmentMimeType =
    payload.mimeType ||
    payload.mimetype ||
    payloadImage.mimeType ||
    payloadImage.mimetype ||
    payloadImage.contentType ||
    payloadAudio.mimeType ||
    payloadAudio.mimetype ||
    payloadAudio.contentType ||
    payloadVideo.mimeType ||
    payloadVideo.mimetype ||
    payloadVideo.contentType ||
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
    nestedPayload?.audio?.mimeType ||
    nestedPayload?.audio?.mimetype ||
    nestedPayload?.audio?.contentType ||
    nestedPayload?.video?.mimeType ||
    nestedPayload?.video?.mimetype ||
    nestedPayload?.video?.contentType ||
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
    payloadAudio.url || payloadAudio.link || payloadAudio.originalUrl || payloadAudio.previewUrl ||
    payloadVideo.url || payloadVideo.link || payloadVideo.originalUrl || payloadVideo.previewUrl ||
    payloadDocument.url || payloadDocument.link || payloadDocument.originalUrl || payloadDocument.previewUrl ||
    payloadMedia.url || payloadMedia.link || payloadMedia.originalUrl || payloadMedia.previewUrl ||
    payloadFile.url || payloadFile.link || payloadFile.originalUrl || payloadFile.previewUrl ||
    nestedPayload?.image?.url || nestedPayload?.image?.link || nestedPayload?.image?.originalUrl || nestedPayload?.image?.previewUrl ||
    nestedPayload?.audio?.url || nestedPayload?.audio?.link || nestedPayload?.audio?.originalUrl || nestedPayload?.audio?.previewUrl ||
    nestedPayload?.video?.url || nestedPayload?.video?.link || nestedPayload?.video?.originalUrl || nestedPayload?.video?.previewUrl ||
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
  const resolvedMimeType = attachmentMimeType
    || (messageType === 'image' ? 'image/jpeg' : '')
    || (messageType === 'audio' ? 'audio/ogg' : '')
    || (messageType === 'video' ? 'video/mp4' : '');
  const isKnownMediaType = mediaPayloadTypes.has(messageType);
  const hasAttachmentPayload = Boolean(isKnownMediaType || attachmentUrl);
  let persistedFilename = hasAttachmentPayload ? attachmentFilename : '';
  let persistedMimeType = hasAttachmentPayload ? resolvedMimeType : '';
  let persistedMediaType = hasAttachmentPayload ? resolveMediaType(messageType, persistedMimeType, persistedFilename, attachmentUrl) : '';
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
    const failureDetails = String(status).toLowerCase() === 'failed'
      ? extractGupshupFailureDetails(body)
      : null;

    console.log('--- WEBHOOK STATUS ---');
    console.log('[WEBHOOK STATUS RAW]', body);
    console.log('[STATUS PARSED]', {
      messageId,
      status,
      reason: failureDetails?.reason || reason,
      failureCode: failureDetails?.failureCode || null,
      phone,
      source,
      destination,
    });

    if (failureDetails) {
      const existingForLog = messageId
        ? await Message.findOne({ messageId: String(messageId).trim() }).select('templateId templateName').lean()
        : null;

      console.log('[GUPSHUP TEMPLATE DELIVERY FAILED]', {
        messageId: messageId || null,
        phone: phone || destination || source || null,
        templateId: existingForLog?.templateId || null,
        templateName: existingForLog?.templateName || null,
        failureReason: failureDetails.reason || reason || null,
        failureCode: failureDetails.failureCode || null,
        providerResponse: failureDetails.providerResponse,
        webhookPayload: failureDetails.webhookPayload,
      });
    }

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
      reason: failureDetails?.reason || reason,
      phone,
      failureCode: failureDetails?.failureCode || '',
      providerResponse: failureDetails?.providerResponse || null,
      webhookPayload: failureDetails?.webhookPayload || null,
    });

    if (messageId) {
      applyCampaignDeliveryUpdate({
        messageId,
        status,
        reason: failureDetails?.reason || reason,
        failureCode: failureDetails?.failureCode || '',
        webhookPayload: failureDetails?.webhookPayload || null,
        timestamp: eventTimestamp,
      }).catch((campaignError) => {
        console.warn('[CAMPAIGN WEBHOOK UPDATE]', campaignError?.message || campaignError);
      });
    }

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
    console.log('--- WEBHOOK INCOMING ---');
    console.log('[WEBHOOK INCOMING RAW]', body);

    if (hasAttachmentPayload) {
      console.log('[MEDIA MESSAGE RECEIVED]', {
        type: messageType,
        mimeType: persistedMimeType,
        url: attachmentUrl,
        fileName: persistedFilename,
      });
    }

    // Ignore non-status events that have no text and no usable phone fields.
    if (!String(text || '').trim() && !source && !destination) {
      return null;
    }

    let persistedAttachmentUrl = attachmentUrl;
    let videoMessageLogged = false;
    if (attachmentUrl) {
      const mirrored = await mirrorIncomingAttachmentUrl(attachmentUrl, attachmentFilename, persistedMimeType);
      persistedAttachmentUrl = mirrored.fileUrl || attachmentUrl;
      if (!attachmentFilename && mirrored.filename) {
        attachmentFilename = mirrored.filename;
      }
      persistedFilename = attachmentFilename || mirrored.filename || persistedFilename;
      persistedMimeType = mirrored.mimeType || persistedMimeType;
      persistedMediaType = resolveMediaType(messageType, persistedMimeType, persistedFilename, persistedAttachmentUrl);
      if (persistedMediaType === 'video') {
        console.log('[VIDEO MESSAGE RECEIVED]', {
          mimeType: persistedMimeType,
          mediaType: persistedMediaType,
          fileName: persistedFilename,
          mediaUrl: persistedAttachmentUrl,
        });
        videoMessageLogged = true;
      }
    }

    if (persistedMediaType === 'video' && !videoMessageLogged) {
      console.log('[VIDEO MESSAGE RECEIVED]', {
        mimeType: persistedMimeType,
        mediaType: persistedMediaType,
        fileName: persistedFilename,
        mediaUrl: persistedAttachmentUrl,
      });
    }

    const inboundDirection = isFromBusiness ? 'out' : 'in';
    const normalizedCustomerPhone = normalizePhone(phone);
    const resolvedMessageId = messageId || `incoming-${Date.now()}`;
    let isNewIncoming = true;
    if (messageId) {
      const existingInbound = await Message.findOne({ messageId });
      if (existingInbound) {
        isNewIncoming = false;
      }
    }

    console.log('[INCOMING PARSED]', {
      phone: normalizedCustomerPhone,
      direction: inboundDirection,
      messageId: resolvedMessageId,
      isNewIncoming,
    });

    const saved = await saveMessage({
      messageId: resolvedMessageId,
      phone: normalizedCustomerPhone,
      text: displayText,
      type: isKnownMediaType || attachmentUrl ? 'file' : 'text',
      fileUrl: persistedAttachmentUrl,
      filename: persistedFilename,
      mimeType: persistedMimeType,
      mediaType: persistedMediaType,
      mediaUrl: persistedAttachmentUrl,
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

    if (isNewIncoming && inboundDirection === 'in' && !isFromBusiness && normalizedCustomerPhone) {
      const { handleOwnerInboundMessage } = require('../services/ownerNotificationSessionService');
      const { maybeNotifyOwnerOnIncoming } = require('../services/ownerNotificationService');
      void handleOwnerInboundMessage({
        senderPhone: normalizedCustomerPhone,
        timestamp: eventTimestamp,
      });
      void maybeNotifyOwnerOnIncoming({
        customerPhone: normalizedCustomerPhone,
        messageText: displayText,
        messageType: persistedMediaType || messageType,
        timestamp: eventTimestamp,
      });
    }

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

    const limit = Math.min(Math.max(Number.parseInt(String(req.query.limit || '50'), 10) || 50, 1), 100);
    const before = String(req.query.before || '').trim() || undefined;
    const page = await getMessagesByPhone(phone, { limit, before });
    const messages = (page.messages || []).map((item) => ({
      phone: item.phone,
      text: item.text,
      type: item.type || 'text',
      fileUrl: item.fileUrl || '',
      filename: item.filename || '',
      mimeType: item.mimeType || '',
      mediaType: item.mediaType || '',
      mediaUrl: item.mediaUrl || item.fileUrl || '',
      direction: item.direction,
      status: item.status,
      timestamp: item.timestamp,
      messageId: item.messageId,
      templateId: item.templateId || '',
      templateName: item.templateName || '',
      templateBody: item.templateBody || '',
      deleted: Boolean(item.deleted),
      deletedAt: item.deletedAt || null,
      important: Boolean(item.important),
      linkedTask: item.linkedTask || null,
    }));

    return res.status(200).json({
      success: true,
      data: messages,
      hasMore: Boolean(page.hasMore),
      oldestTimestamp: page.oldestTimestamp || null,
    });
  } catch (error) {
    next(error);
  }
};

// PATCH /api/chat/messages/:messageId/delete
exports.softDeleteChatMessage = async (req, res, next) => {
  try {
    const restore = String(req.body?.restore || req.query?.restore || '').toLowerCase() === 'true';
    const result = await softDeleteMessage({
      messageId: req.params.messageId,
      user: req.user,
      restore,
    });

    if (!result.ok) {
      return res.status(result.status || 400).json({ success: false, message: result.message });
    }

    return res.status(200).json({ success: true, data: result.data });
  } catch (error) {
    next(error);
  }
};

// PATCH /api/chat/messages/:messageId/important
exports.toggleChatMessageImportant = async (req, res, next) => {
  try {
    const result = await toggleMessageImportant({
      messageId: req.params.messageId,
      important: req.body?.important,
    });

    if (!result.ok) {
      return res.status(result.status || 400).json({ success: false, message: result.message });
    }

    return res.status(200).json({ success: true, data: result.data });
  } catch (error) {
    next(error);
  }
};

// GET /api/chat/conversations
// Returns chat conversation summaries for sidebar listing.
exports.getChatConversations = async (req, res, next) => {
  try {
    const search = String(req.query.search || '').trim();
    const rawConversations = await getConversationSummaries({ search });
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

      const lastMessageAt = item.lastMessageAt || item.updatedAt;
      return {
        ...item,
        clientName: matchedName,
        unreadCount: Number(item.unreadCount || 0),
        lastMessageAt: lastMessageAt ? new Date(lastMessageAt).toISOString() : null,
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
