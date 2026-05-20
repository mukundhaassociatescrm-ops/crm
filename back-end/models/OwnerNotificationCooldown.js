const mongoose = require('mongoose');

const ownerNotificationCooldownSchema = new mongoose.Schema(
  {
    customerPhone: { type: String, required: true, trim: true, index: true },
    notifiedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false }
);

ownerNotificationCooldownSchema.index({ customerPhone: 1, notifiedAt: -1 });

module.exports = mongoose.model('OwnerNotificationCooldown', ownerNotificationCooldownSchema);
