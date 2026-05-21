const mongoose = require('mongoose');

const smsTemplateSchema = new mongoose.Schema(
  {
    templateName: { type: String, trim: true, default: '' },
    /** CRM / DLT content template ID (lookup key for send API). */
    templateId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    /** Fast2SMS DLT Manager Message ID — sent as bulkV2 `message` (route: dlt). */
    messageId: { type: String, trim: true, default: '', index: true },
    senderId: { type: String, trim: true, default: '' },
    entityId: { type: String, trim: true, default: '' },
    entityName: { type: String, trim: true, default: '' },
    templateContent: { type: String, default: '' },
    templateType: { type: String, trim: true, default: '' },
    approvalStatus: { type: String, trim: true, default: '' },
    provider: { type: String, trim: true, default: 'fast2sms', index: true },
    syncedAt: { type: Date, default: null },
    isActive: { type: Boolean, default: false, index: true },

    /** @deprecated Excel / legacy fields — kept for fallback import compatibility. */
    dltMessageId: { type: String, trim: true, default: '' },
    contentTemplateId: { type: String, trim: true, default: '' },
    sampleContent: { type: String, default: '' },
    category: { type: String, trim: true, default: '' },
    verificationStatus: { type: Boolean, default: false },
    jioStatus: { type: String, trim: true, default: '' },
    approvalDate: { type: Date, default: null },
    validTill: { type: Date, default: null },
  },
  { timestamps: true },
);

module.exports = mongoose.model('SmsTemplate', smsTemplateSchema);
