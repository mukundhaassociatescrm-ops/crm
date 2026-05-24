const Group = require('../models/Group');
const Client = require('../models/Client');
const Conversation = require('../models/Conversation');
const { normalizeDestination } = require('./gupshupApiService');
const {
  normalizePhone,
  findLastIncomingMessage,
  buildPhoneLookupCandidates,
} = require('./chatMessageStore');
const { getRolling24hUsage } = require('./campaignSettingsService');

const SESSION_WINDOW_MS = 24 * 60 * 60 * 1000;

const startOfLocalDay = (date = new Date()) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

const resolveGroupContacts = async (groupId) => {
  const group = await Group.findById(groupId);
  if (!group) {
    return { group: null, contacts: [] };
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

  return { group, contacts };
};

const isValidWhatsAppPhone = (phone) => /^91\d{10}$/.test(String(phone || ''));

const getSessionStateForPhone = async (phoneNumber) => {
  const canonicalPhone = normalizePhone(phoneNumber);
  if (!canonicalPhone) {
    return { isActive: false, lastIncomingAt: null };
  }

  const latestIncoming = await findLastIncomingMessage(canonicalPhone);
  const lastIncomingAt = latestIncoming?.timestamp ? new Date(latestIncoming.timestamp) : null;
  const expiresAt = lastIncomingAt
    ? new Date(lastIncomingAt.getTime() + SESSION_WINDOW_MS)
    : null;
  const isActive = Boolean(lastIncomingAt && Date.now() < expiresAt.getTime());

  return { isActive, lastIncomingAt, expiresAt };
};

const hasEverEngaged = async (normalizedPhone) => {
  if (!normalizedPhone) {
    return false;
  }
  const candidates = buildPhoneLookupCandidates(normalizedPhone);
  const conversation = await Conversation.findOne({ phoneNumber: { $in: candidates } }).select('_id');
  if (conversation) {
    return true;
  }
  const incoming = await findLastIncomingMessage(normalizedPhone);
  return Boolean(incoming);
};

const analyzeGroupAudience = async (groupId, options = {}) => {
  const { group, contacts } = await resolveGroupContacts(groupId);
  if (!group) {
    return null;
  }

  const usage = await getRolling24hUsage();
  const respectLimit = options.respectSafeDailyLimit !== false;

  let whatsappValid = 0;
  let sessionActive = 0;
  let needsTemplate = 0;
  let unengaged = 0;

  const analyzed = [];

  for (const contact of contacts) {
    const normalizedPhone = normalizeDestination(contact.mobile);
    const valid = isValidWhatsAppPhone(normalizedPhone);
    if (valid) {
      whatsappValid += 1;
    }

    let session = { isActive: false };
    if (valid) {
      session = await getSessionStateForPhone(normalizedPhone);
      if (session.isActive) {
        sessionActive += 1;
      } else {
        needsTemplate += 1;
      }
    }

    const engaged = valid ? await hasEverEngaged(normalizedPhone) : false;
    if (valid && !engaged && !session.isActive) {
      unengaged += 1;
    }

    analyzed.push({
      customerName: contact.name || '',
      phone: contact.mobile || '',
      normalizedPhone,
      validWhatsApp: valid,
      sessionActive: Boolean(session.isActive),
      needsTemplate: valid && !session.isActive,
      engaged,
    });
  }

  const totalContacts = contacts.length;
  const coldPct = whatsappValid > 0 ? needsTemplate / whatsappValid : 0;
  const warnings = [];

  if (coldPct >= 0.7 && needsTemplate > 50) {
    warnings.push('High cold-user percentage — many recipients need new template conversations.');
  }
  if (usage.remaining === 0 && needsTemplate > 0 && respectLimit) {
    warnings.push('Safe daily template limit reached for the rolling 24h window.');
  }
  if (unengaged >= Math.max(20, Math.floor(whatsappValid * 0.4))) {
    warnings.push('Too many unengaged recipients — delivery quality risk.');
  }
  if (needsTemplate > usage.limit * 3) {
    warnings.push('Large template backlog — campaign will span multiple days.');
  }

  let estimatedCompletionDays = 1;
  if (respectLimit && needsTemplate > 0) {
    const day0 = usage.remaining;
    const remainingAfterDay0 = Math.max(0, needsTemplate - day0);
    estimatedCompletionDays = remainingAfterDay0 > 0
      ? 1 + Math.ceil(remainingAfterDay0 / usage.limit)
      : 1;
  } else if (needsTemplate > 0) {
    estimatedCompletionDays = 1;
  }

  return {
    groupId: group._id,
    groupName: group.name || '',
    totalContacts,
    whatsappValid,
    sessionActive,
    needsTemplate,
    dailyLimit: usage.limit,
    dailyUsed: usage.used,
    dailyRemaining: usage.remaining,
    estimatedCompletionDays,
    warnings,
    contacts: analyzed,
  };
};

const buildRecipientSchedule = (templateNeeders, usage, respectLimit) => {
  const todayStart = startOfLocalDay();
  let dayIndex = 0;
  let slotInDay = 0;
  let remainingToday = usage.remaining;

  return templateNeeders.map((contact) => {
    if (!respectLimit) {
      return {
        ...contact,
        batchDayIndex: 0,
        scheduledFor: new Date(),
        status: 'Queued',
        sendMethod: 'template',
      };
    }

    let dayLimit = dayIndex === 0 ? remainingToday : usage.limit;
    if (dayLimit <= 0 && dayIndex === 0) {
      dayIndex = 1;
      slotInDay = 0;
      dayLimit = usage.limit;
    }

    if (slotInDay >= dayLimit) {
      dayIndex += 1;
      slotInDay = 0;
      dayLimit = usage.limit;
    }

    const scheduledFor = addDays(todayStart, dayIndex);
    const status = dayIndex === 0 && slotInDay < remainingToday ? 'Queued' : 'WaitingDailyLimit';
    slotInDay += 1;

    return {
      ...contact,
      batchDayIndex: dayIndex,
      scheduledFor,
      status,
      sendMethod: 'template',
    };
  });
};

module.exports = {
  SESSION_WINDOW_MS,
  resolveGroupContacts,
  isValidWhatsAppPhone,
  getSessionStateForPhone,
  analyzeGroupAudience,
  buildRecipientSchedule,
  startOfLocalDay,
};
