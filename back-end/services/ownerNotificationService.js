const Client = require('../models/Client');
const OwnerNotificationCooldown = require('../models/OwnerNotificationCooldown');
const { sendGupshupTextMessage, normalizeDestination } = require('./gupshupApiService');
const { normalizePhone, buildPhoneLookupCandidates } = require('./chatMessageStore');
const { getAppSettingsPayload } = require('./appSettingsService');

const COOLDOWN_MS = 15 * 60 * 1000;
const PREVIEW_MAX_LEN = 120;

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

const isCooldownActive = async (customerPhone) => {
  const phone = normalizePhone(customerPhone);
  if (!phone) {
    return false;
  }

  const since = new Date(Date.now() - COOLDOWN_MS);
  const recent = await OwnerNotificationCooldown.findOne({
    customerPhone: phone,
    notifiedAt: { $gte: since },
  }).sort({ notifiedAt: -1 });

  return Boolean(recent);
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

const maybeNotifyOwnerOnIncoming = async ({
  customerPhone,
  messageText = '',
  messageType = '',
  timestamp = new Date(),
}) => {
  try {
    const settings = await getAppSettingsPayload();
    if (!settings.ownerNotificationsEnabled) {
      logSkipped('notifications_disabled');
      return;
    }

    const ownerNumber = normalizeDestination(
      settings.ownerWhatsappNumber || process.env.OWNER_WHATSAPP_NUMBER || ''
    );
    if (!ownerNumber) {
      logSkipped('owner_number_missing');
      return;
    }

    const phone = normalizePhone(customerPhone);
    if (!phone) {
      logSkipped('customer_phone_missing');
      return;
    }

    if (await isCooldownActive(phone)) {
      logSkipped('cooldown_active', { customerPhone: phone });
      return;
    }

    const clientName = await resolveClientName(phone);
    const messagePreview = buildMessagePreview(messageText, messageType);
    const timeLabel = formatTimeLabel(timestamp);

    console.log('[OWNER NOTIFICATION TRIGGER]', {
      clientName,
      phone,
      ownerNumber,
      messagePreview,
    });

    await sendGupshupTextMessage({
      to: ownerNumber,
      message: buildNotificationBody({
        clientName,
        phone,
        preview: messagePreview,
        timeLabel,
      }),
    });

    await recordCooldown(phone);
    console.log('[OWNER NOTIFICATION SENT]', { phone, ownerNumber });
  } catch (error) {
    console.error('[OWNER NOTIFICATION FAILED]', {
      message: error?.message || String(error),
      response: error?.response?.data,
    });
  }
};

module.exports = {
  maybeNotifyOwnerOnIncoming,
  COOLDOWN_MS,
};
