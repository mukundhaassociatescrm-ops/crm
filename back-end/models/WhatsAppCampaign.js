const mongoose = require('mongoose');

const campaignStrategySchema = new mongoose.Schema(
  {
    sendSessionActiveImmediately: { type: Boolean, default: true },
    queueRemaining: { type: Boolean, default: true },
    priorityCustomersFirst: { type: Boolean, default: false },
    respectSafeDailyLimit: { type: Boolean, default: true },
  },
  { _id: false }
);

const campaignStatsSchema = new mongoose.Schema(
  {
    total: { type: Number, default: 0 },
    whatsappValid: { type: Number, default: 0 },
    sessionActive: { type: Number, default: 0 },
    needsTemplate: { type: Number, default: 0 },
    delivered: { type: Number, default: 0 },
    queued: { type: Number, default: 0 },
    sending: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    read: { type: Number, default: 0 },
    skipped: { type: Number, default: 0 },
    sessionSent: { type: Number, default: 0 },
    waitingDailyLimit: { type: Number, default: 0 },
  },
  { _id: false }
);

const whatsAppCampaignSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, required: true },
    label: { type: String, trim: true, default: '' },
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
    groupName: { type: String, trim: true, default: '' },
    templateId: { type: String, trim: true, required: true },
    templateName: { type: String, trim: true, default: '' },
    templateBody: { type: String, trim: true, default: '' },
    templateParams: { type: [String], default: [] },
    attachmentUrl: { type: String, trim: true, default: '' },
    attachmentFilename: { type: String, trim: true, default: '' },
    attachmentMimeType: { type: String, trim: true, default: '' },
    posterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Poster', default: null },
    strategy: { type: campaignStrategySchema, default: () => ({}) },
    scheduleMode: { type: String, enum: ['now', 'scheduled'], default: 'now' },
    scheduledAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ['draft', 'queued', 'processing', 'paused', 'completed', 'failed', 'cancelled'],
      default: 'queued',
    },
    stats: { type: campaignStatsSchema, default: () => ({}) },
    dailyLimitSnapshot: { type: Number, default: 200 },
    estimatedCompletionDays: { type: Number, default: 1 },
    warnings: { type: [String], default: [] },
    messageLogId: { type: mongoose.Schema.Types.ObjectId, ref: 'MessageLog', default: null },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

whatsAppCampaignSchema.index({ status: 1, scheduledAt: 1 });
whatsAppCampaignSchema.index({ createdAt: -1 });

module.exports = mongoose.model('WhatsAppCampaign', whatsAppCampaignSchema);
