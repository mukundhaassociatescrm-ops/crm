const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    phone: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const groupSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Group name is required'], trim: true },
    contacts: {
      type: [contactSchema],
      default: [],
      validate: {
        validator: function (v) {
          return v.length <= 10000;
        },
        message: 'Group contacts cannot exceed 10000',
      },
    },
    clients: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'Client',
      default: [],
      validate: {
        validator: function (v) {
          return v.length <= 10000;
        },
        message: 'Group clients cannot exceed 10000',
      },
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Group', groupSchema);
