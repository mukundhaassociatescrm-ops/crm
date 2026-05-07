const mongoose = require('mongoose');

const messageLogSchema = new mongoose.Schema(
  {
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
    message: { type: String, required: true },
    channel: { type: String, enum: ['sms', 'whatsapp'], default: 'whatsapp' },
    attachmentUrl: { type: String },
    sentBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    totalRecipients: { type: Number, default: 0 },
    sentCount: { type: Number, default: 0 },
    successCount: { type: Number, default: 0 },
    failedCount: { type: Number, default: 0 },
    status: { type: String, enum: ['Processing', 'Completed', 'Partial', 'Failed'], default: 'Processing' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('MessageLog', messageLogSchema);
