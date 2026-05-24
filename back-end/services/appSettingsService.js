const AppSettings = require('../models/AppSettings');

const DEFAULT_BANK_DETAILS = {
  bankName: 'State Bank of India, Coimbatore Nagar Branch',
  accountNumber: '44344893154',
  ifsc: 'SBIN0008608',
};

const resolveDefaultDailyTemplateLimit = () => {
  const fromEnv = Number.parseInt(String(process.env.WHATSAPP_CAMPAIGN_DAILY_TEMPLATE_LIMIT || ''), 10);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : 200;
};

const DEFAULT_SETTINGS = {
  ownerNotificationsEnabled: String(process.env.OWNER_NOTIFICATIONS_ENABLED || '').toLowerCase() === 'true',
  ownerWhatsappNumber: String(process.env.OWNER_WHATSAPP_NUMBER || '').trim(),
  whatsappDailyTemplateLimit: resolveDefaultDailyTemplateLimit(),
  bankDetails: DEFAULT_BANK_DETAILS,
};

const normalizeBankDetails = (bankDetails = {}) => ({
  bankName: String(bankDetails.bankName || DEFAULT_BANK_DETAILS.bankName).trim(),
  accountNumber: String(bankDetails.accountNumber || DEFAULT_BANK_DETAILS.accountNumber).trim(),
  ifsc: String(bankDetails.ifsc || DEFAULT_BANK_DETAILS.ifsc).trim().toUpperCase(),
});

const serializeSettings = (doc) => ({
  ownerNotificationsEnabled: Boolean(doc?.ownerNotificationsEnabled),
  ownerWhatsappNumber: String(doc?.ownerWhatsappNumber || '').trim(),
  whatsappDailyTemplateLimit: Number(doc?.whatsappDailyTemplateLimit) > 0
    ? Number(doc.whatsappDailyTemplateLimit)
    : DEFAULT_SETTINGS.whatsappDailyTemplateLimit,
  bankDetails: normalizeBankDetails(doc?.bankDetails || DEFAULT_BANK_DETAILS),
});

const getAppSettings = async () => {
  let settings = await AppSettings.findOne().sort({ updatedAt: -1 });
  if (!settings) {
    settings = await AppSettings.create({
      ownerNotificationsEnabled: DEFAULT_SETTINGS.ownerNotificationsEnabled,
      ownerWhatsappNumber: DEFAULT_SETTINGS.ownerWhatsappNumber,
      whatsappDailyTemplateLimit: DEFAULT_SETTINGS.whatsappDailyTemplateLimit,
      bankDetails: DEFAULT_SETTINGS.bankDetails,
    });
  }

  return settings;
};

const getAppSettingsPayload = async () => serializeSettings(await getAppSettings());

const updateAppSettings = async (partial = {}, userId = null) => {
  const settings = await getAppSettings();

  if (typeof partial.ownerNotificationsEnabled === 'boolean') {
    settings.ownerNotificationsEnabled = partial.ownerNotificationsEnabled;
  }

  if (partial.ownerWhatsappNumber !== undefined) {
    settings.ownerWhatsappNumber = String(partial.ownerWhatsappNumber || '').trim();
  }

  if (partial.whatsappDailyTemplateLimit !== undefined) {
    const parsed = Number.parseInt(String(partial.whatsappDailyTemplateLimit), 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      settings.whatsappDailyTemplateLimit = parsed;
    }
  }

  if (partial.bankDetails !== undefined) {
    settings.bankDetails = normalizeBankDetails(partial.bankDetails);
  }

  if (userId) {
    settings.updatedBy = userId;
  }

  await settings.save();
  return serializeSettings(settings);
};

module.exports = {
  DEFAULT_BANK_DETAILS,
  getAppSettings,
  getAppSettingsPayload,
  updateAppSettings,
  serializeSettings,
};
