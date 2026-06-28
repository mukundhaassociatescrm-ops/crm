const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema(
  {
    phoneNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    lastMessage: {
      type: String,
      default: '',
      trim: true,
    },
    unreadCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastReadAt: {
      type: Date,
      default: null,
    },
    /** Last real message activity — used for inbox sort (not read/select/UI). */
    lastMessageAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

conversationSchema.index({ updatedAt: -1, lastMessageAt: -1 });

module.exports = mongoose.model('Conversation', conversationSchema);