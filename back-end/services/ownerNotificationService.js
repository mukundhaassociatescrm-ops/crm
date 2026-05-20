const Client = require('../models/Client');
const OwnerNotificationCooldown = require('../models/OwnerNotificationCooldown');
const {
  sendGupshupTextMessage,
  sendGupshupTemplateMessage,
  normalizeDestination,
} = require('./gupshupApiService');
const {
  normalizePhone,
  buildPhoneLookupCandidates,
  findLastIncomingMessage,
} = require('./chatMessageStore');
const { getAppSettingsPayload } = require('./appSettingsService');

const COOLDOWN_MS = 15 * 60 * 1000;
const SESSION_WINDOW_MS = 24 * 60 * 60 * 1000;
const PREVIEW_MAX_LEN = 120;
const SEND_MODE_SESSION = 'session';
const SEND_MODE_TEMPLATE = 'template';

const logSkipped = (reason, extra = {}) => {
  console.log('[OWNER NOTIFICATION SKIPPED]', { reason, ...extra });
};

const formatDisplayPhone = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) {
    return '-';
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    return `+${digits.slice(0, 2)} ${digits.slice(2)}`;
  }
  return digits.startsWith('+') ? digits : `+${digits}`;
};

const formatTimeLabel = (value) => {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    return new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  }
  return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
};

const buildMessagePreview = (text, messageType = '') => {
  const trimmed = String(text || '').trim();
  if (trimmed) {
    return trimmed.length > PREVIEW_MAX_LEN ? `${trimmed.slice(0, PREVIEW_MAX_LEN)}...` : trimmed;
  }

  const type = String(messageType || '').toLowerCase();
  if (type === 'image') return '[Image]';
  if (type === 'video') return '[Video]';
  if (type === 'audio') return '[Audio]';
  if (type === 'document' || type === 'file') return '[Document]';
  if (type) return `[${type}]`;
  return '[Message]';
};

const buildNotificationBody = ({ clientName, phone, preview, timeLabel }) => {
  const quotedPreview = preview.includes('\n') ? preview : `"${preview}"`;
  return [
    '🔔 New WhatsApp Message',
    '',
    `Client: ${clientName}`,
    `Phone: ${formatDisplayPhone(phone)}`,
    '',
    'Message:',
    quotedPreview,
    '',
    `Time: ${timeLabel}`,
  ].join('\n');
};

const resolveClientName = async (customerPhone) => {
  const normalizedPhone = normalizePhone(customerPhone);
  if (!normalizedPhone) {
    return 'Unknown Client';
  }

  const candidates = buildPhoneLookupCandidates(normalizedPhone);
  const client = await Client.findOne({
    $or: [
      { mobile: { $in: candidates } },
      { alternateMobile: { $in: candidates } },
    ],
  }).select('name mobile');

  if (client?.name) {
    return String(client.name).trim();
  }

  return formatDisplayPhone(normalizedPhone);
};

const checkOwnerSession = async (ownerPhone) => {
  const canonicalOwner = normalizePhone(ownerPhone);
  if (!canonicalOwner) {
    return {
      active: false,
      expiresAt: null,
      lastIncomingAt: null,
      note: 'owner_phone_invalid',
    };
  }

  const latestIncoming = await findLastIncomingMessage(canonicalOwner);
  const lastIncomingAt = latestIncoming?.timestamp ? new Date(latestIncoming.timestamp) : null;
  const expiresAt = lastIncomingAt ? new Date(lastIncomingAt.getTime() + SESSION_WINDOW_MS) : null;
  const active = Boolean(lastIncomingAt && Date.now() < expiresAt.getTime());

  return {
    active,
    expiresAt,
    lastIncomingAt,
    lastIncomingMessageId: latestIncoming?.messageId || null,
    note: active
      ? 'owner_messaged_business_within_24h'
      : 'no_owner_inbound_to_business_in_24h_window',
  };
};

const checkCooldown = async (customerPhone) => {
  const phone = normalizePhone(customerPhone);
  if (!phone) {
    return {
      skipped: true,
      reason: 'customer_phone_missing',
      lastNotificationAt: null,
    };
  }

  const since = new Date(Date.now() - COOLDOWN_MS);
  const recent = await OwnerNotificationCooldown.findOne({
    customerPhone: phone,
    notifiedAt: { $gte: since },
  }).sort({ notifiedAt: -1 });

  if (recent) {
    return {
      skipped: true,
      reason: 'cooldown_active',
      lastNotificationAt: recent.notifiedAt,
    };
  }

  return {
    skipped: false,
    reason: 'eligible',
    lastNotificationAt: null,
  };
};

const recordCooldown = async (customerPhone) => {
  const phone = normalizePhone(customerPhone);
  if (!phone) {
    return;
  }

  await OwnerNotificationCooldown.create({
    customerPhone: phone,
    notifiedAt: new Date(),
  });
};

const resolveSendMode = (_settings, ownerSession) => {
  const templateId = String(process.env.OWNER_NOTIFICATION_TEMPLATE_ID || '').trim();

  if (templateId) {
    return {
      mode: SEND_MODE_TEMPLATE,
      templateId,
      reason: 'template_id_configured',
    };
  }

  if (!ownerSession.active) {
    return {
      mode: SEND_MODE_SESSION,
      templateId: '',
      reason: 'session_mode_default_but_owner_session_inactive',
      sessionInactive: true,
    };
  }

  return {
    mode: SEND_MODE_SESSION,
    templateId: '',
    reason: 'owner_session_active',
    sessionInactive: false,
  };
};

const buildTemplateParams = ({ clientName, phone, preview, timeLabel }) => {
  return [
    String(clientName || 'Customer').slice(0, 200),
    String(formatDisplayPhone(phone) || '-').slice(0, 50),
    String(preview || '[Message]').slice(0, 200),
    String(timeLabel || '').slice(0, 50),
  ];
};

const sendOwnerNotification = async ({ to, message, sendMode, templateId, templateParams }) => {
  const destination = normalizeDestination(to);
  const sendType = sendMode === SEND_MODE_TEMPLATE ? 'template' : 'session_text';

  console.log('[OWNER NOTIFICATION API REQUEST]', {
    endpoint:
      sendMode === SEND_MODE_TEMPLATE
        ? process.env.GUPSHUP_TEMPLATE_SEND_URL || 'https://api.gupshup.io/wa/api/v1/template/msg'
        : process.env.GUPSHUP_SEND_URL || 'https://api.gupshup.io/wa/api/v1/msg',
    destination,
    sendType,
    sendMode,
    templateId: templateId || undefined,
    messageLength: message?.length || 0,
    templateParamCount: templateParams?.length || 0,
  });

  try {
    let result;
    if (sendMode === SEND_MODE_TEMPLATE && templateId) {
      result = await sendGupshupTemplateMessage({
        to: destination,
        templateId,
        params: templateParams,
      });
    } else {
      result = await sendGupshupTextMessage({
        to: destination,
        message,
      });
    }

    const providerResponse = result?.providerResponse;
    const providerStatus = String(providerResponse?.status || providerResponse?.message || '').toLowerCase();
    const success = providerStatus
      ? ['success', 'submitted', 'queued', 'accepted'].some((token) => providerStatus.includes(token))
        || Boolean(result?.messageId)
      : Boolean(result?.messageId);

    console.log('[OWNER NOTIFICATION API RESPONSE]', {
      success,
      response: providerResponse,
      messageId: result?.messageId || '',
    });

    if (!success && !result?.messageId) {
      console.log('[OWNER NOTIFICATION ERROR]', {
        message: 'Provider response did not indicate success',
        status: providerResponse?.status || 'unknown',
        responseData: providerResponse,
      });
    }

    return result;
  } catch (error) {
    console.log('[OWNER NOTIFICATION ERROR]', {
      message: error?.message || String(error),
      status: error?.response?.status || null,
      responseData: error?.response?.data || null,
    });
    throw error;
  }
};

const maybeNotifyOwnerOnIncoming = async ({
  customerPhone,
  messageText = '',
  messageType = '',
  timestamp = new Date(),
}) => {
  const phone = normalizePhone(customerPhone);
  const messagePreview = buildMessagePreview(messageText, messageType);
  let clientName = 'Unknown Client';

  try {
    clientName = await resolveClientName(phone);

    console.log('[OWNER NOTIFICATION WEBHOOK RECEIVED]', {
      customerPhone: phone,
      customerName: clientName,
      messagePreview,
      messageType: messageType || 'text',
    });

    const settings = await getAppSettingsPayload();
    const rawOwnerNumber =
      settings.ownerWhatsappNumber || process.env.OWNER_WHATSAPP_NUMBER || '';
    const ownerNumber = normalizeDestination(rawOwnerNumber);

    console.log('[OWNER NOTIFICATION SETTINGS]', {
      enabled: settings.ownerNotificationsEnabled,
      ownerNumber: ownerNumber || '(empty)',
      cooldownEnabled: settings.ownerNotificationsEnabled,
      cooldownMinutes: COOLDOWN_MS / 60000,
      templateIdConfigured: Boolean(process.env.OWNER_NOTIFICATION_TEMPLATE_ID),
    });

    console.log('[OWNER NUMBER NORMALIZED]', {
      raw: rawOwnerNumber,
      normalized: ownerNumber,
    });

    if (!settings.ownerNotificationsEnabled) {
      logSkipped('notifications_disabled');
      return;
    }

    if (!ownerNumber) {
      logSkipped('owner_number_missing', { raw: rawOwnerNumber });
      return;
    }

    if (!phone) {
      logSkipped('customer_phone_missing');
      return;
    }

    const cooldown = await checkCooldown(phone);
    console.log('[OWNER NOTIFICATION COOLDOWN CHECK]', {
      customerPhone: phone,
      skipped: cooldown.skipped,
      reason: cooldown.reason,
      lastNotificationAt: cooldown.lastNotificationAt,
    });

    if (cooldown.skipped) {
      logSkipped(cooldown.reason, {
        customerPhone: phone,
        lastNotificationAt: cooldown.lastNotificationAt,
      });
      return;
    }

    const ownerSession = await checkOwnerSession(ownerNumber);
    console.log('[OWNER SESSION CHECK]', {
      active: ownerSession.active,
      expiresAt: ownerSession.expiresAt,
      lastIncomingAt: ownerSession.lastIncomingAt,
      lastIncomingMessageId: ownerSession.lastIncomingMessageId,
      note: ownerSession.note,
    });

    const sendPlan = resolveSendMode(settings, ownerSession);
    console.log('[OWNER NOTIFICATION SEND MODE]', {
      mode: sendPlan.mode,
      reason: sendPlan.reason,
      templateId: sendPlan.templateId || undefined,
      sessionInactive: sendPlan.sessionInactive ?? !ownerSession.active,
    });

    if (sendPlan.mode === SEND_MODE_SESSION && sendPlan.sessionInactive) {
      console.log('[OWNER NOTIFICATION RECOMMENDATION]', {
        recommendation:
          'Owner WhatsApp session is not active. Session (/msg) alerts often fail with Gupshup error #470. Configure OWNER_NOTIFICATION_TEMPLATE_ID with an approved template and matching params.',
        ownerNumber,
        ownerSessionActive: ownerSession.active,
        envTemplateId: process.env.OWNER_NOTIFICATION_TEMPLATE_ID || null,
      });
    }

    const timeLabel = formatTimeLabel(timestamp);
    const notificationMessage = buildNotificationBody({
      clientName,
      phone,
      preview: messagePreview,
      timeLabel,
    });
    const templateParams = buildTemplateParams({
      clientName,
      phone,
      preview: messagePreview,
      timeLabel,
    });

    console.log('[OWNER NOTIFICATION PAYLOAD]', {
      to: ownerNumber,
      message: notificationMessage,
      sendType: sendPlan.mode === SEND_MODE_TEMPLATE ? 'template' : 'session',
    });

    console.log('[OWNER NOTIFICATION TRIGGER]', {
      clientName,
      phone,
      ownerNumber,
      messagePreview,
      sendMode: sendPlan.mode,
    });

    await sendOwnerNotification({
      to: ownerNumber,
      message: notificationMessage,
      sendMode: sendPlan.mode,
      templateId: sendPlan.templateId,
      templateParams,
    });

    await recordCooldown(phone);
    console.log('[OWNER NOTIFICATION SENT]', {
      phone,
      ownerNumber,
      sendMode: sendPlan.mode,
    });
  } catch (error) {
    console.log('[OWNER NOTIFICATION ERROR]', {
      message: error?.message || String(error),
      status: error?.response?.status || null,
      responseData: error?.response?.data || null,
      customerPhone: phone,
      customerName: clientName,
    });
  }
};

module.exports = {
  maybeNotifyOwnerOnIncoming,
  COOLDOWN_MS,
  SEND_MODE_SESSION,
  SEND_MODE_TEMPLATE,
};
