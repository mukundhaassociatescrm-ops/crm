const AppSettings = require('../models/AppSettings');

const DEFAULT_BANK_DETAILS = {
  bankName: 'State Bank of India, Coimbatore Nagar Branch',
  accountNumber: '44344893154',
  ifsc: 'SBIN0008608',
};

const DEFAULT_UPI_PAYMENT_DETAILS = {
  upiQrImage: '',
  upiId: '',
  upiMobileNumber: '',
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
  upiPaymentDetails: DEFAULT_UPI_PAYMENT_DETAILS,
};

const normalizeBankDetails = (bankDetails = {}) => ({
  bankName: String(bankDetails.bankName || DEFAULT_BANK_DETAILS.bankName).trim(),
  accountNumber: String(bankDetails.accountNumber || DEFAULT_BANK_DETAILS.accountNumber).trim(),
  ifsc: String(bankDetails.ifsc || DEFAULT_BANK_DETAILS.ifsc).trim().toUpperCase(),
});

const normalizeUpiMobileNumber = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) {
    return '';
  }
  // Keep last 10 digits when country code is included (e.g. 91XXXXXXXXXX).
  if (digits.length > 10) {
    return digits.slice(-10);
  }
  return digits;
};

const normalizeUpiPaymentDetails = (upiPaymentDetails = {}) => {
  const upiId = String(upiPaymentDetails.upiId || '').trim().slice(0, 100);
  const upiQrImage = String(upiPaymentDetails.upiQrImage || '').trim();
  const upiMobileNumber = normalizeUpiMobileNumber(upiPaymentDetails.upiMobileNumber);

  return {
    upiQrImage,
    upiId,
    upiMobileNumber: upiMobileNumber.length === 10 || upiMobileNumber.length === 0 ? upiMobileNumber : '',
  };
};

const toPlainObject = (value) => {
  if (!value) {
    return null;
  }
  if (typeof value.toObject === 'function') {
    return value.toObject();
  }
  return value;
};

const serializeSettings = (doc) => ({
  ownerNotificationsEnabled: Boolean(doc?.ownerNotificationsEnabled),
  ownerWhatsappNumber: String(doc?.ownerWhatsappNumber || '').trim(),
  whatsappDailyTemplateLimit: Number(doc?.whatsappDailyTemplateLimit) > 0
    ? Number(doc.whatsappDailyTemplateLimit)
    : DEFAULT_SETTINGS.whatsappDailyTemplateLimit,
  bankDetails: normalizeBankDetails(toPlainObject(doc?.bankDetails) || DEFAULT_BANK_DETAILS),
  upiPaymentDetails: normalizeUpiPaymentDetails(
    toPlainObject(doc?.upiPaymentDetails) || DEFAULT_UPI_PAYMENT_DETAILS
  ),
});

const getAppSettings = async () => {
  let settings = await AppSettings.findOne().sort({ updatedAt: -1 });
  if (!settings) {
    settings = await AppSettings.create({
      ownerNotificationsEnabled: DEFAULT_SETTINGS.ownerNotificationsEnabled,
      ownerWhatsappNumber: DEFAULT_SETTINGS.ownerWhatsappNumber,
      whatsappDailyTemplateLimit: DEFAULT_SETTINGS.whatsappDailyTemplateLimit,
      bankDetails: DEFAULT_SETTINGS.bankDetails,
      upiPaymentDetails: DEFAULT_SETTINGS.upiPaymentDetails,
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
    settings.set('bankDetails', normalizeBankDetails(partial.bankDetails));
    settings.markModified('bankDetails');
  }

  if (partial.upiPaymentDetails !== undefined) {
    settings.set('upiPaymentDetails', normalizeUpiPaymentDetails(partial.upiPaymentDetails));
    settings.markModified('upiPaymentDetails');
  }

  if (userId) {
    settings.updatedBy = userId;
  }

  await settings.save();
  return serializeSettings(settings);
};

module.exports = {
  DEFAULT_BANK_DETAILS,
  DEFAULT_UPI_PAYMENT_DETAILS,
  getAppSettings,
  getAppSettingsPayload,
  updateAppSettings,
  serializeSettings,
};
