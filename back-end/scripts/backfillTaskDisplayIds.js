/**
 * One-time backfill for tasks missing displayId (TSK-1, TSK-2, ...).
 * Usage: node scripts/backfillTaskDisplayIds.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Task = require('../models/Task');
const { ensureTasksHaveDisplayIds } = require('../services/taskDisplayIdService');

const run = async () => {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGO_URI or MONGODB_URI is required.');
  }

  await mongoose.connect(uri);
  const tasks = await Task.find({
    $or: [{ displayId: { $exists: false } }, { displayId: null }, { displayId: '' }],
  })
    .select('_id displayId')
    .lean();

  console.log(`[backfill] tasks missing displayId: ${tasks.length}`);
  await ensureTasksHaveDisplayIds(tasks);
  console.log('[backfill] complete');
  await mongoose.disconnect();
};

run().catch((error) => {
  console.error('[backfill] failed', error);
  process.exit(1);
});
