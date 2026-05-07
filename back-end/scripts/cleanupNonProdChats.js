require('dotenv').config();

const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const { normalizePhone } = require('../services/chatMessageStore');

async function run() {
  const keepBusinessNumber = normalizePhone(process.env.WHATSAPP_NUMBER);
  if (!keepBusinessNumber) {
    throw new Error('WHATSAPP_NUMBER is required to run cleanup.');
  }

  await connectDB();

  const deleteConversationResult = await Conversation.deleteMany({
    businessNumber: { $ne: keepBusinessNumber },
  });

  const deleteMessageResult = await Message.deleteMany({
    businessNumber: { $ne: keepBusinessNumber },
  });

  console.log('[cleanupNonProdChats] kept businessNumber=', keepBusinessNumber);
  console.log('[cleanupNonProdChats] deleted conversations=', deleteConversationResult.deletedCount);
  console.log('[cleanupNonProdChats] deleted messages=', deleteMessageResult.deletedCount);

  await mongoose.connection.close();
}

run().catch((err) => {
  console.error('[cleanupNonProdChats] failed:', err);
  process.exit(1);
});

