const WhatsAppCampaign = require('../models/WhatsAppCampaign');
const CampaignRecipient = require('../models/CampaignRecipient');
const MessageLog = require('../models/MessageLog');
const {
  analyzeGroupAudience,
  buildRecipientSchedule,
  isValidWhatsAppPhone,
} = require('./campaignAudienceService');
const { getRolling24hUsage, getDailyTemplateLimit } = require('./campaignSettingsService');
const { recomputeCampaignStats } = require('./campaignRecipientStatusService');
const { emitCampaignUpdate } = require('./socketService');
const { processCampaignById } = require('./whatsappCampaignProcessor');
const { findTemplateById, templateRequiresImageHeader } = require('./chatTemplateService');
const {
  validateWhatsAppImageMediaUrl,
} = require('./whatsappTemplateMediaService');

const serializeCampaign = (doc) => {
  if (!doc) {
    return null;
  }
  const plain = doc.toObject ? doc.toObject() : doc;
  return {
    id: String(plain._id),
    name: plain.name,
    label: plain.label,
    groupId: String(plain.groupId),
    groupName: plain.groupName,
    templateId: plain.templateId,
    templateName: plain.templateName,
    templateBody: plain.templateBody,
    templateParams: plain.templateParams || [],
    attachmentUrl: plain.attachmentUrl || '',
    strategy: plain.strategy || {},
    scheduleMode: plain.scheduleMode,
    scheduledAt: plain.scheduledAt,
    status: plain.status,
    stats: plain.stats || {},
    dailyLimitSnapshot: plain.dailyLimitSnapshot,
    estimatedCompletionDays: plain.estimatedCompletionDays,
    warnings: plain.warnings || [],
    startedAt: plain.startedAt,
    completedAt: plain.completedAt,
    createdAt: plain.createdAt,
    updatedAt: plain.updatedAt,
  };
};

const serializeRecipient = (doc) => ({
  id: String(doc._id),
  customerName: doc.customerName,
  phone: doc.phone,
  status: doc.status,
  reason: doc.reason || '',
  failureReason: doc.failureReason || '',
  failureCode: doc.failureCode || '',
  failureCategory: doc.failureCategory || '',
  retryEligible: Boolean(doc.retryEligible),
  retryScheduledAt: doc.retryScheduledAt || null,
  retryCount: doc.retryCount ?? 0,
  permanentFailure: Boolean(doc.permanentFailure),
  scheduledAt: doc.scheduledFor,
  deliveredAt: doc.deliveredAt,
  sentAt: doc.sentAt,
  readAt: doc.readAt,
  queuedFor: doc.scheduledFor,
  whatsappMessageId: doc.whatsappMessageId || '',
  sendMethod: doc.sendMethod,
  batchDayIndex: doc.batchDayIndex,
});

const getQueueSnapshot = async (campaignId) => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);

  const [sendingToday, scheduledTomorrow, waitingQueue] = await Promise.all([
    CampaignRecipient.countDocuments({
      campaignId,
      sendMethod: 'template',
      templateInitiatedAt: { $gte: todayStart },
    }),
    CampaignRecipient.countDocuments({
      campaignId,
      status: 'WaitingDailyLimit',
      scheduledFor: { $gte: tomorrowStart, $lt: new Date(tomorrowStart.getTime() + 24 * 60 * 60 * 1000) },
    }),
    CampaignRecipient.countDocuments({
      campaignId,
      status: { $in: ['Queued', 'WaitingDailyLimit'] },
    }),
  ]);

  const usage = await getRolling24hUsage();

  return {
    sendingToday,
    scheduledTomorrow,
    waitingQueue,
    remainingCapacityToday: usage.remaining,
    dailyUsed: usage.used,
    dailyLimit: usage.limit,
  };
};

const DEFAULT_AUTOMATION = {
  sendSessionActiveImmediately: true,
  queueRemaining: true,
  priorityCustomersFirst: false,
  respectSafeDailyLimit: true,
};

const createCampaign = async (payload, userId) => {
  const {
    groupId,
    label = '',
    templateId,
    templateName = '',
    templateBody = '',
    params = [],
    attachmentUrl = '',
    attachmentFilename = '',
    attachmentMimeType = '',
    posterId = null,
  } = payload;

  if (!groupId || !templateId) {
    throw new Error('groupId and templateId are required.');
  }

  const templateMeta = await findTemplateById(templateId);
  const requiresImage = templateRequiresImageHeader(templateMeta);
  let resolvedAttachmentUrl = '';

  if (requiresImage && !String(attachmentUrl || '').trim()) {
    throw new Error('This template requires an image.');
  }

  if (String(attachmentUrl || '').trim()) {
    resolvedAttachmentUrl = await validateWhatsAppImageMediaUrl(attachmentUrl);
  } else if (requiresImage) {
    throw new Error('This template requires an image.');
  }

  const analysis = await analyzeGroupAudience(groupId, {
    respectSafeDailyLimit: true,
  });
  if (!analysis) {
    throw new Error('Group not found.');
  }

  const usage = await getRolling24hUsage();
  const respectLimit = true;
  const contacts = analysis.contacts;

  const campaignName = String(label || '').trim()
    || `WhatsApp campaign · ${analysis.groupName || templateName || templateId}`;

  const log = await MessageLog.create({
    groupId,
    message: `WhatsApp template ${templateId}`,
    channel: 'whatsapp',
    attachmentUrl: resolvedAttachmentUrl || undefined,
    sentBy: userId,
    totalRecipients: analysis.totalContacts,
    sentCount: 0,
    successCount: 0,
    failedCount: 0,
    status: 'Processing',
  });

  const campaign = await WhatsAppCampaign.create({
    name: campaignName,
    label: String(label || '').trim(),
    groupId,
    groupName: analysis.groupName,
    templateId: String(templateId),
    templateName,
    templateBody,
    templateParams: params.map((v) => String(v ?? '')),
    attachmentUrl: resolvedAttachmentUrl,
    attachmentFilename,
    attachmentMimeType,
    posterId: posterId || undefined,
    strategy: { ...DEFAULT_AUTOMATION },
    scheduleMode: 'now',
    scheduledAt: null,
    status: 'processing',
    stats: {
      total: analysis.totalContacts,
      whatsappValid: analysis.whatsappValid,
      sessionActive: analysis.sessionActive,
      needsTemplate: analysis.needsTemplate,
      queued: 0,
    },
    dailyLimitSnapshot: usage.limit,
    estimatedCompletionDays: analysis.estimatedCompletionDays,
    warnings: analysis.warnings,
    messageLogId: log._id,
    startedAt: new Date(),
    createdBy: userId,
  });

  const recipients = [];
  const sessionQueue = [];
  const templateNeeders = [];

  for (const contact of contacts) {
    if (!contact.validWhatsApp) {
      recipients.push({
        campaignId: campaign._id,
        customerName: contact.customerName,
        phone: contact.phone,
        normalizedPhone: contact.normalizedPhone,
        status: 'Skipped',
        reason: 'Invalid WhatsApp number',
        sendMethod: 'template',
      });
      continue;
    }

    if (contact.sessionActive && DEFAULT_AUTOMATION.sendSessionActiveImmediately) {
      sessionQueue.push({
        campaignId: campaign._id,
        customerName: contact.customerName,
        phone: contact.phone,
        normalizedPhone: contact.normalizedPhone,
        status: 'Queued',
        sendMethod: 'session',
        scheduledFor: new Date(),
        queuedAt: new Date(),
      });
      continue;
    }

    templateNeeders.push({
      customerName: contact.customerName,
      phone: contact.phone,
      normalizedPhone: contact.normalizedPhone,
    });
  }

  const scheduledTemplate = buildRecipientSchedule(templateNeeders, usage, respectLimit);
  for (const row of scheduledTemplate) {
    recipients.push({
      campaignId: campaign._id,
      customerName: row.customerName,
      phone: row.phone,
      normalizedPhone: row.normalizedPhone,
      status: row.status,
      sendMethod: 'template',
      batchDayIndex: row.batchDayIndex,
      scheduledFor: row.scheduledFor,
      queuedAt: row.status === 'Queued' ? new Date() : null,
      reason: row.status === 'WaitingDailyLimit' ? 'Scheduled for next daily batch' : '',
    });
  }

  recipients.push(...sessionQueue);

  if (recipients.length) {
    await CampaignRecipient.insertMany(recipients, { ordered: false });
  }

  await recomputeCampaignStats(campaign._id);

  setImmediate(() => {
    processCampaignById(campaign._id).catch((error) => {
      console.error('[CAMPAIGN PROCESS ERROR]', campaign._id, error?.message || error);
    });
  });

  emitCampaignUpdate({
    eventType: 'campaign-created',
    campaignId: String(campaign._id),
    status: campaign.status,
  });

  const refreshed = await WhatsAppCampaign.findById(campaign._id);
  return {
    campaign: serializeCampaign(refreshed),
    analysis,
    queue: await getQueueSnapshot(campaign._id),
  };
};

const listCampaigns = async ({ limit = 30, skip = 0, search = '', status = '' } = {}) => {
  const filter = {};
  const term = String(search || '').trim();
  if (term) {
    filter.$or = [
      { name: { $regex: term, $options: 'i' } },
      { label: { $regex: term, $options: 'i' } },
      { templateName: { $regex: term, $options: 'i' } },
      { templateId: { $regex: term, $options: 'i' } },
      { groupName: { $regex: term, $options: 'i' } },
    ];
  }
  if (status) {
    filter.status = String(status);
  }

  const [rows, total] = await Promise.all([
    WhatsAppCampaign.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    WhatsAppCampaign.countDocuments(filter),
  ]);

  return {
    campaigns: rows.map(serializeCampaign),
    total,
    limit,
    skip,
  };
};

const getCampaignDetail = async (campaignId) => {
  const campaign = await WhatsAppCampaign.findById(campaignId);
  if (!campaign) {
    return null;
  }
  const queue = await getQueueSnapshot(campaignId);
  const usage = await getRolling24hUsage();
  return {
    campaign: serializeCampaign(campaign),
    queue,
    usage,
  };
};

const getCampaignRecipients = async (campaignId, { status, search, limit = 100, skip = 0 } = {}) => {
  const query = { campaignId };
  if (status) {
    query.status = status === 'Waiting Queue' ? 'WaitingDailyLimit' : status;
  }
  const term = String(search || '').trim();
  if (term) {
    query.$or = [
      { customerName: { $regex: term, $options: 'i' } },
      { phone: { $regex: term, $options: 'i' } },
      { normalizedPhone: { $regex: term, $options: 'i' } },
    ];
  }
  const [rows, total] = await Promise.all([
    CampaignRecipient.find(query).sort({ createdAt: 1 }).skip(skip).limit(limit),
    CampaignRecipient.countDocuments(query),
  ]);
  return {
    recipients: rows.map(serializeRecipient),
    total,
    limit,
    skip,
  };
};

const pauseCampaign = async (campaignId) => {
  const campaign = await WhatsAppCampaign.findByIdAndUpdate(
    campaignId,
    { status: 'paused' },
    { new: true }
  );
  return serializeCampaign(campaign);
};

const resumeCampaign = async (campaignId) => {
  const campaign = await WhatsAppCampaign.findByIdAndUpdate(
    campaignId,
    { status: 'processing', startedAt: new Date() },
    { new: true }
  );
  if (campaign) {
    setImmediate(() => {
      processCampaignById(campaign._id).catch((error) => {
        console.error('[CAMPAIGN RESUME ERROR]', campaign._id, error?.message || error);
      });
    });
  }
  return serializeCampaign(campaign);
};

const retryFailedRecipients = async (campaignId) => {
  await CampaignRecipient.updateMany(
    { campaignId, status: 'Failed', normalizedPhone: { $ne: '' } },
    {
      $set: {
        status: 'Queued',
        failureReason: '',
        reason: 'Retry queued',
        scheduledFor: new Date(),
        queuedAt: new Date(),
      },
    }
  );
  const campaign = await WhatsAppCampaign.findByIdAndUpdate(
    campaignId,
    { status: 'processing', completedAt: null },
    { new: true }
  );
  if (campaign) {
    await processCampaignById(campaign._id);
  }
  return serializeCampaign(campaign);
};

module.exports = {
  serializeCampaign,
  serializeRecipient,
  getQueueSnapshot,
  createCampaign,
  listCampaigns,
  getCampaignDetail,
  getCampaignRecipients,
  pauseCampaign,
  resumeCampaign,
  retryFailedRecipients,
  getDailyTemplateLimit,
};
