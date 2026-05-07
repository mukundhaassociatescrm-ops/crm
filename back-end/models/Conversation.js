const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema(
  {
    businessNumber: {
      type: String,
      default: '',
      trim: true,
      index: true,
    },
    phoneNumber: {
      type: String,
      required: true,
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
  },
  { timestamps: true }
);

// Support multiple WhatsApp business numbers:
// One customer phone can have multiple conversations, keyed by businessNumber + phoneNumber.
conversationSchema.index({ businessNumber: 1, phoneNumber: 1 }, { unique: true });

module.exports = mongoose.model('Conversation', conversationSchema);