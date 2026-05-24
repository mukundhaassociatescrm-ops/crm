const WhatsAppCampaign = require('../models/WhatsAppCampaign');
const CampaignRecipient = require('../models/CampaignRecipient');
const {
  sendGupshupTemplateMessage,
  sendGupshupTextMessage,
  resolveGupshupSource,
} = require('./gupshupApiService');
const {
  saveMessage,
  buildTemplateDisplayText,
  normalizePhone,
} = require('./chatMessageStore');
const { getRolling24hUsage } = require('./campaignSettingsService');
const { recomputeCampaignStats } = require('./campaignRecipientStatusService');
const { emitCampaignUpdate } = require('./socketService');

const PER_MESSAGE_DELAY_MS = 300;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const promoteDueWaitingRecipients = async (campaignId) => {
  const now = new Date();
  await CampaignRecipient.updateMany(
    {
      campaignId,
      status: 'WaitingDailyLimit',
      scheduledFor: { $lte: now },
    },
    {
      $set: {
        status: 'Queued',
        queuedAt: now,
        reason: '',
      },
    }
  );
};

const renderCampaignText = (campaign) => buildTemplateDisplayText({
  templateBody: campaign.templateBody,
  templateName: campaign.templateName,
  templateId: campaign.templateId,
  params: campaign.templateParams || [],
});

const sendSessionRecipient = async (campaign, recipient) => {
  const text = renderCampaignText(campaign);
  recipient.status = 'Sending';
  await recipient.save();

  const result = await sendGupshupTextMessage({
    to: recipient.normalizedPhone,
    message: text,
  });

  const messageId = result.messageId || `campaign-session-${Date.now()}`;
  recipient.whatsappMessageId = messageId;
  recipient.sentAt = new Date();
  recipient.status = 'SessionSent';
  recipient.reason = 'Sent within active 24h session';
  await recipient.save();

  try {
    await saveMessage({
      messageId,
      phone: recipient.normalizedPhone,
      text,
      type: 'text',
      direction: 'out',
      status: 'sent',
      timestamp: new Date(),
      destination: recipient.normalizedPhone,
      source: resolveGupshupSource(),
      templateId: campaign.templateId,
      templateName: campaign.templateName,
      templateBody: campaign.templateBody,
      templateParams: campaign.templateParams,
    });
  } catch (persistError) {
    console.warn('[CAMPAIGN SESSION PERSIST]', persistError?.message || persistError);
  }

  return true;
};

const sendTemplateRecipient = async (campaign, recipient) => {
  const usage = await getRolling24hUsage();
  if (campaign.strategy?.respectSafeDailyLimit !== false && usage.remaining <= 0) {
    return false;
  }

  recipient.status = 'Sending';
  recipient.templateInitiatedAt = new Date();
  await recipient.save();

  const result = await sendGupshupTemplateMessage({
    to: recipient.normalizedPhone,
    templateId: campaign.templateId,
    params: campaign.templateParams || [],
  });

  if (!result?.accepted) {
    throw new Error('Provider did not accept the template message.');
  }

  const messageId = result.messageId || `campaign-template-${Date.now()}`;
  const displayText = renderCampaignText(campaign);

  recipient.whatsappMessageId = messageId;
  recipient.sentAt = new Date();
  recipient.status = 'Sending';
  recipient.reason = '';
  await recipient.save();

  try {
    await saveMessage({
      messageId,
      phone: recipient.normalizedPhone,
      text: displayText,
      type: 'text',
      direction: 'out',
      status: 'sent',
      timestamp: new Date(),
      destination: recipient.normalizedPhone,
      source: resolveGupshupSource(),
      templateId: campaign.templateId,
      templateName: campaign.templateName,
      templateBody: campaign.templateBody,
      templateParams: campaign.templateParams,
    });
  } catch (persistError) {
    console.warn('[CAMPAIGN TEMPLATE PERSIST]', persistError?.message || persistError);
  }

  return true;
};

const processCampaignById = async (campaignId) => {
  const campaign = await WhatsAppCampaign.findById(campaignId);
  if (!campaign || ['paused', 'cancelled', 'completed'].includes(campaign.status)) {
    return;
  }

  if (campaign.scheduleMode === 'scheduled' && campaign.scheduledAt && campaign.scheduledAt > new Date()) {
    return;
  }

  if (campaign.status === 'queued') {
    campaign.status = 'processing';
    campaign.startedAt = campaign.startedAt || new Date();
    await campaign.save();
  }

  await promoteDueWaitingRecipients(campaignId);

  const sessionBatch = await CampaignRecipient.find({
    campaignId,
    sendMethod: 'session',
    status: 'Queued',
  }).limit(50);

  for (const recipient of sessionBatch) {
    try {
      await sendSessionRecipient(campaign, recipient);
      emitCampaignUpdate({
        eventType: 'recipient-status',
        campaignId: String(campaignId),
        recipientId: String(recipient._id),
        status: recipient.status,
        phone: normalizePhone(recipient.normalizedPhone),
      });
    } catch (error) {
      recipient.status = 'Failed';
      recipient.failureReason = error?.message || String(error);
      recipient.reason = recipient.failureReason;
      await recipient.save();
    }
    await delay(PER_MESSAGE_DELAY_MS);
  }

  let usage = await getRolling24hUsage();
  while (usage.remaining > 0 || campaign.strategy?.respectSafeDailyLimit === false) {
    usage = await getRolling24hUsage();
    if (campaign.strategy?.respectSafeDailyLimit !== false && usage.remaining <= 0) {
      break;
    }

    const templateRecipient = await CampaignRecipient.findOne({
      campaignId,
      sendMethod: 'template',
      status: 'Queued',
      scheduledFor: { $lte: new Date() },
    }).sort({ batchDayIndex: 1, createdAt: 1 });

    if (!templateRecipient) {
      break;
    }

    try {
      const sent = await sendTemplateRecipient(campaign, templateRecipient);
      if (!sent) {
        break;
      }
      emitCampaignUpdate({
        eventType: 'recipient-status',
        campaignId: String(campaignId),
        recipientId: String(templateRecipient._id),
        status: templateRecipient.status,
        phone: normalizePhone(templateRecipient.normalizedPhone),
      });
    } catch (error) {
      templateRecipient.status = 'Failed';
      templateRecipient.failureReason = error?.message || String(error);
      templateRecipient.reason = templateRecipient.failureReason;
      await templateRecipient.save();
    }

    await delay(PER_MESSAGE_DELAY_MS);
    usage = await getRolling24hUsage();
    if (campaign.strategy?.respectSafeDailyLimit !== false && usage.remaining <= 0) {
      break;
    }
  }

  const updated = await recomputeCampaignStats(campaignId);
  if (updated) {
    emitCampaignUpdate({
      eventType: 'campaign-stats',
      campaignId: String(campaignId),
      status: updated.status,
      stats: updated.stats,
    });
  }
};

const processActiveCampaigns = async () => {
  const campaigns = await WhatsAppCampaign.find({
    status: { $in: ['queued', 'processing'] },
  }).select('_id');

  for (const row of campaigns) {
    try {
      await processCampaignById(row._id);
    } catch (error) {
      console.error('[CAMPAIGN WORKER]', row._id, error?.message || error);
    }
  }
};

let workerTimer = null;

const initializeCampaignProcessor = () => {
  if (workerTimer) {
    return;
  }
  workerTimer = setInterval(() => {
    processActiveCampaigns().catch((error) => {
      console.error('[CAMPAIGN WORKER TICK]', error?.message || error);
    });
  }, 60 * 1000);

  processActiveCampaigns().catch((error) => {
    console.error('[CAMPAIGN WORKER START]', error?.message || error);
  });

  console.log('[CAMPAIGN WORKER] initialized (60s interval)');
};

const stopCampaignProcessor = () => {
  if (workerTimer) {
    clearInterval(workerTimer);
    workerTimer = null;
  }
};

module.exports = {
  processCampaignById,
  processActiveCampaigns,
  initializeCampaignProcessor,
  stopCampaignProcessor,
};
