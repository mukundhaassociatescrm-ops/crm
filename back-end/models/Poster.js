const mongoose = require('mongoose');

const POSTER_CATEGORIES = [
  'Income Tax',
  'GST',
  'Audit',
  'TDS',
  'General Announcement',
  'Other',
];

const posterSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    imageUrl: {
      type: String,
      required: true,
      trim: true,
    },
    imageFilename: {
      type: String,
      default: '',
      trim: true,
    },
    category: {
      type: String,
      enum: POSTER_CATEGORIES,
      default: 'Other',
      index: true,
    },
    shortDescription: {
      type: String,
      default: '',
      trim: true,
      maxlength: 500,
    },
    content: {
      type: String,
      default: '',
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    viewCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    /** Future: campaignId, publishedAt, qrCodeUrl, clickCount */
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true },
);

posterSchema.index({ title: 'text', shortDescription: 'text' });

module.exports = mongoose.model('Poster', posterSchema);
module.exports.POSTER_CATEGORIES = POSTER_CATEGORIES;
