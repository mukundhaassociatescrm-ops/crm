const mongoose = require('mongoose');

const RECIPIENT_STATUSES = [
  'Queued',
  'Sending',
  'Delivered',
  'Read',
  'Failed',
  'Skipped',
  'SessionSent',
  'WaitingDailyLimit',
];

const campaignRecipientSchema = new mongoose.Schema(
  {
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'WhatsAppCampaign', required: true, index: true },
    customerName: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    normalizedPhone: { type: String, trim: true, default: '', index: true },
    status: {
      type: String,
      enum: RECIPIENT_STATUSES,
      default: 'Queued',
      index: true,
    },
    reason: { type: String, trim: true, default: '' },
    failureReason: { type: String, trim: true, default: '' },
    whatsappMessageId: { type: String, trim: true, default: '', index: true },
    sendMethod: { type: String, enum: ['template', 'session'], default: 'template' },
    batchDayIndex: { type: Number, default: 0 },
    scheduledFor: { type: Date, default: null, index: true },
    queuedAt: { type: Date, default: null },
    sentAt: { type: Date, default: null },
    templateInitiatedAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

campaignRecipientSchema.index({ campaignId: 1, status: 1 });
campaignRecipientSchema.index({ sendMethod: 1, templateInitiatedAt: 1 });

module.exports = mongoose.model('CampaignRecipient', campaignRecipientSchema);
module.exports.RECIPIENT_STATUSES = RECIPIENT_STATUSES;
