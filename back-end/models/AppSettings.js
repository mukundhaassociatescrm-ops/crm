const mongoose = require('mongoose');

const bankDetailsSchema = new mongoose.Schema(
  {
    bankName: { type: String, trim: true, default: '' },
    accountNumber: { type: String, trim: true, default: '' },
    ifsc: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const appSettingsSchema = new mongoose.Schema(
  {
    ownerNotificationsEnabled: { type: Boolean, default: false },
    ownerWhatsappNumber: { type: String, trim: true, default: '' },
    /** Owner ↔ CRM WhatsApp session (separate from customer chat sessions). */
    ownerLastIncomingAt: { type: Date, default: null },
    ownerNotificationSessionExpiresAt: { type: Date, default: null },
    ownerSessionReminderSentAt: { type: Date, default: null },
    ownerSessionReminderWindowExpiresAt: { type: Date, default: null },
    bankDetails: {
      type: bankDetailsSchema,
      default: () => ({
        bankName: 'State Bank of India, Coimbatore Nagar Branch',
        accountNumber: '44344893154',
        ifsc: 'SBIN0008608',
      }),
    },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AppSettings', appSettingsSchema);
