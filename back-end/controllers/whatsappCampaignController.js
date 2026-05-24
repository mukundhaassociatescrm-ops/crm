const {
  createCampaign,
  listCampaigns,
  getCampaignDetail,
  getCampaignRecipients,
  pauseCampaign,
  resumeCampaign,
  retryFailedRecipients,
} = require('../services/whatsappCampaignService');
const { analyzeGroupAudience } = require('../services/campaignAudienceService');
const { getRolling24hUsage, updateDailyTemplateLimit } = require('../services/campaignSettingsService');
const { getAppSettingsPayload } = require('../services/appSettingsService');

exports.getCampaignSettings = async (req, res, next) => {
  try {
    const settings = await getAppSettingsPayload();
    const usage = await getRolling24hUsage();
    res.json({
      success: true,
      data: {
        whatsappDailyTemplateLimit: settings.whatsappDailyTemplateLimit,
        usage,
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.updateCampaignSettings = async (req, res, next) => {
  try {
    const limit = req.body?.whatsappDailyTemplateLimit;
    const updated = await updateDailyTemplateLimit(limit, req.user?._id);
    const usage = await getRolling24hUsage();
    res.json({
      success: true,
      data: {
        whatsappDailyTemplateLimit: updated.whatsappDailyTemplateLimit,
        usage,
      },
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message || 'Invalid settings.' });
  }
};

exports.analyzeAudience = async (req, res, next) => {
  try {
    const groupId = req.params.groupId || req.query.groupId;
    if (!groupId) {
      return res.status(400).json({ success: false, message: 'groupId is required.' });
    }
    const respectSafeDailyLimit = req.query.respectSafeDailyLimit !== 'false';
    const analysis = await analyzeGroupAudience(groupId, { respectSafeDailyLimit });
    if (!analysis) {
      return res.status(404).json({ success: false, message: 'Group not found.' });
    }
    res.json({ success: true, data: analysis });
  } catch (error) {
    next(error);
  }
};

exports.createCampaign = async (req, res, next) => {
  try {
    const result = await createCampaign(req.body, req.user?._id);
    res.status(202).json({
      success: true,
      message: 'Campaign created and queued.',
      data: result,
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message || 'Failed to create campaign.' });
  }
};

exports.listCampaigns = async (req, res, next) => {
  try {
    const limit = Number.parseInt(String(req.query.limit || '30'), 10);
    const skip = Number.parseInt(String(req.query.skip || '0'), 10);
    const search = String(req.query.search || '').trim();
    const status = String(req.query.status || '').trim();
    const result = await listCampaigns({ limit, skip, search, status });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

exports.getCampaign = async (req, res, next) => {
  try {
    const detail = await getCampaignDetail(req.params.id);
    if (!detail) {
      return res.status(404).json({ success: false, message: 'Campaign not found.' });
    }
    res.json({ success: true, data: detail });
  } catch (error) {
    next(error);
  }
};

exports.getCampaignRecipients = async (req, res, next) => {
  try {
    const limit = Number.parseInt(String(req.query.limit || '100'), 10);
    const skip = Number.parseInt(String(req.query.skip || '0'), 10);
    const status = req.query.status ? String(req.query.status) : '';
    const search = String(req.query.search || '').trim();
    const result = await getCampaignRecipients(req.params.id, { status, search, limit, skip });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

exports.pauseCampaign = async (req, res, next) => {
  try {
    const campaign = await pauseCampaign(req.params.id);
    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campaign not found.' });
    }
    res.json({ success: true, data: campaign });
  } catch (error) {
    next(error);
  }
};

exports.resumeCampaign = async (req, res, next) => {
  try {
    const campaign = await resumeCampaign(req.params.id);
    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campaign not found.' });
    }
    res.json({ success: true, data: campaign });
  } catch (error) {
    next(error);
  }
};

exports.retryFailed = async (req, res, next) => {
  try {
    const campaign = await retryFailedRecipients(req.params.id);
    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campaign not found.' });
    }
    res.json({ success: true, data: campaign });
  } catch (error) {
    next(error);
  }
};
