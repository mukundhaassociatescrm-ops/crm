const mongoose = require('mongoose');

const clientSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Name is required'], trim: true },
    mobile: {
      type: String,
      required: [true, 'Mobile is required'],
      unique: true,
      trim: true,
      index: true,
    },
    alternateMobile: { type: String, default: '', trim: true, index: true },
    whatsappOptIn: { type: Boolean, default: true },
    notes: { type: String, default: '' },
    groups: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'Group',
      default: [],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Client', clientSchema);
