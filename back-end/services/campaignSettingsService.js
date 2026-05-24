const CampaignRecipient = require('../models/CampaignRecipient');
const { getAppSettingsPayload, updateAppSettings } = require('./appSettingsService');

const TEMPLATE_USAGE_STATUSES = ['Sending', 'Delivered', 'Read', 'Failed'];

const getDailyTemplateLimit = async () => {
  const settings = await getAppSettingsPayload();
  return Number(settings.whatsappDailyTemplateLimit) || 200;
};

const countTemplateInitiationsInWindow = async (windowStart) => {
  return CampaignRecipient.countDocuments({
    sendMethod: 'template',
    templateInitiatedAt: { $gte: windowStart },
    status: { $in: TEMPLATE_USAGE_STATUSES },
  });
};

const getRolling24hUsage = async () => {
  const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const used = await countTemplateInitiationsInWindow(windowStart);
  const limit = await getDailyTemplateLimit();
  return {
    limit,
    used,
    remaining: Math.max(0, limit - used),
    windowStart,
    windowEnd: new Date(),
  };
};

const updateDailyTemplateLimit = async (limit, userId = null) => {
  const parsed = Number.parseInt(String(limit), 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error('Daily template limit must be a positive number.');
  }
  return updateAppSettings({ whatsappDailyTemplateLimit: parsed }, userId);
};

module.exports = {
  TEMPLATE_USAGE_STATUSES,
  getDailyTemplateLimit,
  countTemplateInitiationsInWindow,
  getRolling24hUsage,
  updateDailyTemplateLimit,
};
