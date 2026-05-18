/**
 * One-time migration: normalize Conversation.phoneNumber and Message from/to to 91XXXXXXXXXX.
 *
 * Usage (from back-end folder):
 *   node scripts/migrate-phone-numbers.js
 *
 * Requires MONGO_URI or MONGODB_URI in environment / .env
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const { normalizePhone } = require('../services/chatMessageStore');

const isPhoneLike = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 10;
};

const maybeNormalizeEndpoint = (value) => {
  const raw = String(value || '').trim();
  if (!raw || raw === 'business') {
    return raw;
  }
  if (!isPhoneLike(raw)) {
    return raw;
  }
  return normalizePhone(raw) || raw;
};

const run = async () => {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error('MONGO_URI or MONGODB_URI is required.');
  }

  await mongoose.connect(mongoUri);
  console.log('[migrate-phone-numbers] Connected to MongoDB');

  const conversations = await Conversation.find({}).lean();
  let conversationsUpdated = 0;
  let conversationsMerged = 0;
  let conversationsSkipped = 0;

  for (const conv of conversations) {
    const canonical = normalizePhone(conv.phoneNumber);
    if (!canonical) {
      conversationsSkipped += 1;
      continue;
    }

    if (canonical === conv.phoneNumber) {
      conversationsSkipped += 1;
      continue;
    }

    const duplicate = await Conversation.findOne({ phoneNumber: canonical }).select('_id').lean();
    if (duplicate && String(duplicate._id) !== String(conv._id)) {
      const moveResult = await Message.updateMany(
        { conversationId: conv._id },
        { $set: { conversationId: duplicate._id } },
      );
      await Conversation.deleteOne({ _id: conv._id });
      conversationsMerged += 1;
      console.log('[migrate-phone-numbers] merged conversation', {
        from: conv.phoneNumber,
        to: canonical,
        messagesMoved: moveResult.modifiedCount,
      });
      continue;
    }

    await Conversation.updateOne({ _id: conv._id }, { $set: { phoneNumber: canonical } });
    conversationsUpdated += 1;
    console.log('[migrate-phone-numbers] updated conversation', {
      from: conv.phoneNumber,
      to: canonical,
    });
  }

  const messages = await Message.find({}).select('_id from to').lean();
  let messagesUpdated = 0;

  for (const msg of messages) {
    const from = maybeNormalizeEndpoint(msg.from);
    const to = maybeNormalizeEndpoint(msg.to);
    if (from === msg.from && to === msg.to) {
      continue;
    }
    await Message.updateOne({ _id: msg._id }, { $set: { from, to } });
    messagesUpdated += 1;
  }

  console.log('[migrate-phone-numbers] Done', {
    conversationsTotal: conversations.length,
    conversationsUpdated,
    conversationsMerged,
    conversationsSkipped,
    messagesUpdated,
  });

  await mongoose.disconnect();
};

run().catch((error) => {
  console.error('[migrate-phone-numbers] Failed:', error);
  process.exit(1);
});
