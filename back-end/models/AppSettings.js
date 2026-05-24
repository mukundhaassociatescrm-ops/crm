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
  /** Rolling 24h cap on new WhatsApp template conversation initiations (campaign queue). */
    whatsappDailyTemplateLimit: {
      type: Number,
      default: () => {
        const fromEnv = Number.parseInt(String(process.env.WHATSAPP_CAMPAIGN_DAILY_TEMPLATE_LIMIT || ''), 10);
        return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : 200;
      },
      min: 1,
    },
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
