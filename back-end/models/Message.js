const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    messageId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true,
    },
    from: {
      type: String,
      required: true,
      trim: true,
    },
    to: {
      type: String,
      required: true,
      trim: true,
    },
    text: {
      type: String,
      default: '',
    },
    type: {
      type: String,
      default: 'text',
      trim: true,
    },
    fileUrl: {
      type: String,
      default: '',
      trim: true,
    },
    filename: {
      type: String,
      default: '',
      trim: true,
    },
    mimeType: {
      type: String,
      default: '',
      trim: true,
    },
    mediaType: {
      type: String,
      default: '',
      trim: true,
    },
    mediaUrl: {
      type: String,
      default: '',
      trim: true,
    },
    direction: {
      type: String,
      enum: ['incoming', 'outgoing', 'in', 'out'],
      required: true,
    },
    status: {
      type: String,
      enum: ['sent', 'delivered', 'read', 'failed'],
      default: 'sent',
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    replyTo: {
      type: String,
      trim: true,
      default: undefined,
    },
    templateId: {
      type: String,
      default: '',
      trim: true,
    },
    templateName: {
      type: String,
      default: '',
      trim: true,
    },
    templateBody: {
      type: String,
      default: '',
    },
    /** Populated when Gupshup/Meta webhook reports status=failed. */
    failureReason: {
      type: String,
      default: '',
      trim: true,
    },
    failureCode: {
      type: String,
      default: '',
      trim: true,
    },
    failureProviderResponse: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    failureWebhookPayload: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    linkedTaskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
      default: null,
    },
    important: {
      type: Boolean,
      default: false,
    },
    deleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

messageSchema.index({ conversationId: 1, timestamp: -1 });
messageSchema.index({ conversationId: 1, direction: 1, timestamp: -1 });

module.exports = mongoose.model('Message', messageSchema);