const { sendGupshupTextMessage, normalizeDestination } = require('./gupshupApiService');
const {
  normalizePhone,
  buildPhoneLookupCandidates,
  findLastIncomingMessage,
} = require('./chatMessageStore');
const { getAppSettings, getAppSettingsPayload } = require('./appSettingsService');

const OWNER_NOTIFICATION_SESSION_WINDOW_MS = 24 * 60 * 60 * 1000;
const REMINDER_LEAD_MS = 60 * 60 * 1000;
const SCHEDULER_INTERVAL_MS = 12 * 60 * 1000;

const OWNER_SESSION_REMINDER_MESSAGE = [
  '🔔 Notification Service Reminder',
  '',
  'To continue receiving WhatsApp notifications from the CRM system, please send a message (example: "Hi") to the CRM WhatsApp number within the next hour.',
].join('\n');

let schedulerTimer = null;

const logOwnerSessionCheck = ({ ownerNumber, expiresAt, minutesRemaining, extra = {} }) => {
  console.log('[OWNER SESSION CHECK]', {
    ownerNumber,
    expiresAt,
    minutesRemaining,
    ...extra,
  });
};

const resolveConfiguredOwnerNumber = async () => {
  const settings = await getAppSettingsPayload();
  const raw = settings.ownerWhatsappNumber || process.env.OWNER_WHATSAPP_NUMBER || '';
  return normalizeDestination(raw);
};

const buildOwnerPhoneVariants = (ownerNumber) => {
  const normalized = normalizePhone(ownerNumber);
  if (!normalized) {
    return [];
  }
  return buildPhoneLookupCandidates(normalized);
};

const isSenderOwnerPhone = (senderPhone, ownerNumber) => {
  const sender = normalizePhone(senderPhone);
  const owner = normalizePhone(ownerNumber);
  if (!sender || !owner) {
    return false;
  }

  const senderVariants = new Set(buildPhoneLookupCandidates(sender));
  const ownerVariants = buildOwnerPhoneVariants(owner);
  return ownerVariants.some((variant) => senderVariants.has(variant));
};

const computeMinutesRemaining = (expiresAt) => {
  if (!expiresAt) {
    return null;
  }
  const expiresMs = new Date(expiresAt).getTime();
  if (Number.isNaN(expiresMs)) {
    return null;
  }
  return Number(((expiresMs - Date.now()) / (60 * 1000)).toFixed(2));
};

const readOwnerNotificationSessionState = (settingsDoc) => {
  const lastIncomingAt = settingsDoc?.ownerLastIncomingAt
    ? new Date(settingsDoc.ownerLastIncomingAt)
    : null;
  let expiresAt = settingsDoc?.ownerNotificationSessionExpiresAt
    ? new Date(settingsDoc.ownerNotificationSessionExpiresAt)
    : null;

  if (!expiresAt && lastIncomingAt && !Number.isNaN(lastIncomingAt.getTime())) {
    expiresAt = new Date(lastIncomingAt.getTime() + OWNER_NOTIFICATION_SESSION_WINDOW_MS);
  }

  const active = Boolean(expiresAt && Date.now() < expiresAt.getTime());
  const minutesRemaining = computeMinutesRemaining(expiresAt);

  return {
    ownerNumber: normalizeDestination(settingsDoc?.ownerWhatsappNumber || process.env.OWNER_WHATSAPP_NUMBER || ''),
    lastIncomingAt,
    expiresAt,
    active,
    minutesRemaining,
    reminderSentAt: settingsDoc?.ownerSessionReminderSentAt || null,
    reminderWindowExpiresAt: settingsDoc?.ownerSessionReminderWindowExpiresAt || null,
  };
};

const getOwnerNotificationSessionState = async () => {
  const settings = await getAppSettings();
  return readOwnerNotificationSessionState(settings);
};

const reminderAlreadySentForWindow = (settingsDoc, expiresAt) => {
  if (!settingsDoc?.ownerSessionReminderSentAt || !expiresAt) {
    return false;
  }

  const windowExpiresAt = settingsDoc.ownerSessionReminderWindowExpiresAt
    ? new Date(settingsDoc.ownerSessionReminderWindowExpiresAt).getTime()
    : null;
  const currentExpiresAt = new Date(expiresAt).getTime();

  if (Number.isNaN(currentExpiresAt)) {
    return false;
  }

  return Boolean(windowExpiresAt && windowExpiresAt === currentExpiresAt);
};

const refreshOwnerNotificationSession = async ({ senderPhone, timestamp = new Date() }) => {
  const ownerNumber = await resolveConfiguredOwnerNumber();
  if (!ownerNumber || !isSenderOwnerPhone(senderPhone, ownerNumber)) {
    return { refreshed: false };
  }

  const incomingAt = new Date(timestamp);
  const expiresAt = new Date(incomingAt.getTime() + OWNER_NOTIFICATION_SESSION_WINDOW_MS);

  const settings = await getAppSettings();
  settings.ownerLastIncomingAt = incomingAt;
  settings.ownerNotificationSessionExpiresAt = expiresAt;
  settings.ownerSessionReminderSentAt = null;
  settings.ownerSessionReminderWindowExpiresAt = null;
  await settings.save();

  console.log('[OWNER SESSION REFRESHED]', {
    ownerNumber,
    ownerLastIncomingAt: incomingAt,
    ownerNotificationSessionExpiresAt: expiresAt,
  });

  return {
    refreshed: true,
    ownerNumber,
    ownerLastIncomingAt: incomingAt,
    ownerNotificationSessionExpiresAt: expiresAt,
  };
};

const handleOwnerInboundMessage = async ({ senderPhone, timestamp = new Date() }) => {
  const ownerNumber = await resolveConfiguredOwnerNumber();
  if (!isSenderOwnerPhone(senderPhone, ownerNumber)) {
    return { isOwner: false };
  }

  await refreshOwnerNotificationSession({ senderPhone, timestamp });
  return { isOwner: true };
};

const maybeSendOwnerSessionReminder = async () => {
  const settings = await getAppSettings();
  const payload = await getAppSettingsPayload();

  if (!payload.ownerNotificationsEnabled) {
    return { sent: false, reason: 'notifications_disabled' };
  }

  const ownerNumber = await resolveConfiguredOwnerNumber();
  if (!ownerNumber) {
    return { sent: false, reason: 'owner_number_missing' };
  }

  const session = readOwnerNotificationSessionState(settings);
  logOwnerSessionCheck({
    ownerNumber,
    expiresAt: session.expiresAt,
    minutesRemaining: session.minutesRemaining,
    source: 'scheduler',
    active: session.active,
  });

  if (!session.expiresAt || !session.active) {
    return { sent: false, reason: 'session_inactive_or_missing' };
  }

  const minutesRemaining = session.minutesRemaining;
  if (minutesRemaining === null || minutesRemaining > REMINDER_LEAD_MS / (60 * 1000)) {
    return { sent: false, reason: 'outside_reminder_window', minutesRemaining };
  }

  if (minutesRemaining <= 0) {
    return { sent: false, reason: 'session_already_expired', minutesRemaining };
  }

  if (reminderAlreadySentForWindow(settings, session.expiresAt)) {
    return { sent: false, reason: 'reminder_already_sent_for_window', minutesRemaining };
  }

  try {
    await sendGupshupTextMessage({
      to: ownerNumber,
      message: OWNER_SESSION_REMINDER_MESSAGE,
    });

    settings.ownerSessionReminderSentAt = new Date();
    settings.ownerSessionReminderWindowExpiresAt = session.expiresAt;
    await settings.save();

    console.log('[OWNER SESSION REMINDER SENT]', {
      ownerNumber,
      expiresAt: session.expiresAt,
      minutesRemaining,
      ownerSessionReminderSentAt: settings.ownerSessionReminderSentAt,
    });

    return { sent: true, minutesRemaining };
  } catch (error) {
    console.log('[OWNER SESSION REMINDER ERROR]', {
      ownerNumber,
      message: error?.message || String(error),
      status: error?.response?.status || null,
      responseData: error?.response?.data || null,
    });
    return { sent: false, reason: 'send_failed', error: error?.message || String(error) };
  }
};

const runOwnerSessionReminderTick = async () => {
  try {
    await maybeSendOwnerSessionReminder();
  } catch (error) {
    console.log('[OWNER SESSION REMINDER TICK ERROR]', {
      message: error?.message || String(error),
    });
  }
};

const bootstrapOwnerNotificationSessionIfMissing = async () => {
  const settings = await getAppSettings();
  if (settings.ownerLastIncomingAt) {
    return;
  }

  const ownerNumber = await resolveConfiguredOwnerNumber();
  if (!ownerNumber) {
    return;
  }

  const latestIncoming = await findLastIncomingMessage(normalizePhone(ownerNumber));
  if (!latestIncoming?.timestamp) {
    return;
  }

  await refreshOwnerNotificationSession({
    senderPhone: ownerNumber,
    timestamp: latestIncoming.timestamp,
  });

  console.log('[OWNER SESSION BOOTSTRAP]', {
    ownerNumber,
    ownerLastIncomingAt: latestIncoming.timestamp,
    source: 'last_owner_inbound_message',
  });
};

const initializeOwnerSessionReminderScheduler = () => {
  if (schedulerTimer) {
    return schedulerTimer;
  }

  void bootstrapOwnerNotificationSessionIfMissing();
  void runOwnerSessionReminderTick();

  schedulerTimer = setInterval(() => {
    void runOwnerSessionReminderTick();
  }, SCHEDULER_INTERVAL_MS);

  console.log('[OWNER SESSION REMINDER SCHEDULER]', {
    intervalMinutes: SCHEDULER_INTERVAL_MS / (60 * 1000),
    reminderLeadMinutes: REMINDER_LEAD_MS / (60 * 1000),
  });

  return schedulerTimer;
};

const stopOwnerSessionReminderScheduler = () => {
  if (!schedulerTimer) {
    return;
  }
  clearInterval(schedulerTimer);
  schedulerTimer = null;
};

module.exports = {
  OWNER_NOTIFICATION_SESSION_WINDOW_MS,
  REMINDER_LEAD_MS,
  SCHEDULER_INTERVAL_MS,
  OWNER_SESSION_REMINDER_MESSAGE,
  resolveConfiguredOwnerNumber,
  isSenderOwnerPhone,
  getOwnerNotificationSessionState,
  refreshOwnerNotificationSession,
  handleOwnerInboundMessage,
  maybeSendOwnerSessionReminder,
  initializeOwnerSessionReminderScheduler,
  stopOwnerSessionReminderScheduler,
  logOwnerSessionCheck,
};
