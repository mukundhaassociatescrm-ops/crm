require('dotenv').config();

const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Conversation = require('../models/Conversation');

async function run() {
  await connectDB();

  const collection = Conversation.collection;
  const indexes = await collection.indexes();
  const phoneUniqueIndexes = indexes.filter((idx) => {
    const keys = idx.key || {};
    return idx.unique && keys.phoneNumber === 1 && Object.keys(keys).length === 1;
  });

  for (const idx of phoneUniqueIndexes) {
    console.log('[migrateConversationIndexes] dropping index', idx.name);
    await collection.dropIndex(idx.name);
  }

  console.log('[migrateConversationIndexes] ensuring compound unique index businessNumber+phoneNumber');
  await collection.createIndex({ businessNumber: 1, phoneNumber: 1 }, { unique: true, name: 'businessNumber_1_phoneNumber_1' });

  console.log('[migrateConversationIndexes] done');
  await mongoose.connection.close();
}

run().catch((err) => {
  console.error('[migrateConversationIndexes] failed:', err);
  process.exit(1);
});

