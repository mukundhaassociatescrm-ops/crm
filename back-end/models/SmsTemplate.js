const mongoose = require('mongoose');

const smsTemplateSchema = new mongoose.Schema(
  {
    templateId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
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
