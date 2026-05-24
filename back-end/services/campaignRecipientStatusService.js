const CampaignRecipient = require('../models/CampaignRecipient');
const WhatsAppCampaign = require('../models/WhatsAppCampaign');
const { emitCampaignUpdate } = require('./socketService');

const STATUS_PRIORITY = {
  Queued: 1,
  WaitingDailyLimit: 1,
  Sending: 2,
  SessionSent: 3,
  Delivered: 4,
  Read: 5,
  Failed: 3,
  Skipped: 0,
};

const mapWebhookStatusToRecipient = (status) => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'read') {
    return 'Read';
  }
  if (normalized === 'delivered') {
    return 'Delivered';
  }
  if (normalized === 'failed' || normalized === 'rejected') {
    return 'Failed';
  }
  if (normalized === 'sent') {
    return 'Delivered';
  }
  return null;
};

const recomputeCampaignStats = async (campaignId) => {
  const rows = await CampaignRecipient.aggregate([
    { $match: { campaignId } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

  const countByStatus = rows.reduce((acc, row) => {
    acc[row._id] = row.count;
    return acc;
  }, {});

  const stats = {
    total: Object.values(countByStatus).reduce((sum, n) => sum + n, 0),
    delivered: (countByStatus.Delivered || 0) + (countByStatus.Read || 0),
    queued: (countByStatus.Queued || 0),
    sending: countByStatus.Sending || 0,
    failed: countByStatus.Failed || 0,
    read: countByStatus.Read || 0,
    skipped: countByStatus.Skipped || 0,
    sessionSent: countByStatus.SessionSent || 0,
    waitingDailyLimit: countByStatus.WaitingDailyLimit || 0,
  };

  const campaign = await WhatsAppCampaign.findById(campaignId);
  if (!campaign) {
    return null;
  }

  const previous = campaign.stats?.toObject?.() || campaign.stats || {};
  campaign.stats = {
    ...previous,
    ...stats,
    whatsappValid: previous.whatsappValid ?? stats.total,
    sessionActive: previous.sessionActive ?? 0,
    needsTemplate: previous.needsTemplate ?? 0,
  };

  const pending = stats.queued + stats.sending + stats.waitingDailyLimit;
  if (pending === 0 && ['processing', 'queued'].includes(campaign.status)) {
    campaign.status = stats.failed > 0 && stats.delivered === 0 ? 'failed' : 'completed';
    campaign.completedAt = new Date();
  }

  await campaign.save();
  return campaign;
};

const applyCampaignDeliveryUpdate = async ({ messageId, status, reason, timestamp }) => {
  const normalizedMessageId = String(messageId || '').trim();
  if (!normalizedMessageId) {
    return null;
  }

  const recipient = await CampaignRecipient.findOne({ whatsappMessageId: normalizedMessageId });
  if (!recipient) {
    return null;
  }

  const mapped = mapWebhookStatusToRecipient(status);
  if (!mapped) {
    return null;
  }

  const currentPriority = STATUS_PRIORITY[recipient.status] || 0;
  const incomingPriority = STATUS_PRIORITY[mapped] || 0;
  if (incomingPriority < currentPriority) {
    return recipient;
  }

  recipient.status = mapped;
  if (reason) {
    recipient.failureReason = String(reason);
  }
  if (mapped === 'Delivered' || mapped === 'Read') {
    recipient.deliveredAt = recipient.deliveredAt || new Date(timestamp || Date.now());
  }
  if (mapped === 'Read') {
    recipient.readAt = new Date(timestamp || Date.now());
  }
  if (mapped === 'Failed') {
    recipient.reason = recipient.failureReason || 'Delivery failed';
  }

  await recipient.save();
  const campaign = await recomputeCampaignStats(recipient.campaignId);

  emitCampaignUpdate({
    eventType: 'recipient-status',
    campaignId: String(recipient.campaignId),
    recipientId: String(recipient._id),
    status: recipient.status,
    phone: recipient.normalizedPhone,
    messageId: normalizedMessageId,
  });

  return { recipient, campaign };
};

module.exports = {
  mapWebhookStatusToRecipient,
  recomputeCampaignStats,
  applyCampaignDeliveryUpdate,
};
