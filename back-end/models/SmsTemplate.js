const mongoose = require('mongoose');

const smsTemplateSchema = new mongoose.Schema(
  {
    /** CRM lookup key (usually DLT Content Template ID from Excel TEMPLATE_ID). */
    templateId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    /** Fast2SMS DLT Manager Message ID — sent as bulkV2 `message` (route: dlt). */
    dltMessageId: { type: String, trim: true, default: '', index: true },
    /** DLT registry Content Template ID (Excel TEMPLATE_ID). */
    contentTemplateId: { type: String, trim: true, default: '' },
    /** DLT Principal Entity ID (Excel ENTITY_ID), optional on API. */
    entityId: { type: String, trim: true, default: '' },
    templateName: { type: String, trim: true, default: '' },
    templateContent: { type: String, default: '' },
    sampleContent: { type: String, default: '' },
    senderId: { type: String, trim: true, default: '' },
    category: { type: String, trim: true, default: '' },
    templateType: { type: String, trim: true, default: '' },
    verificationStatus: { type: Boolean, default: false },
    jioStatus: { type: String, trim: true, default: '' },
    approvalDate: { type: Date, default: null },
    validTill: { type: Date, default: null },
    isActive: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

module.exports = mongoose.model('SmsTemplate', smsTemplateSchema);
