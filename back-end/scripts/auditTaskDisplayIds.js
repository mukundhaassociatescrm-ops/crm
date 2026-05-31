/**
 * Audit task displayId coverage in MongoDB.
 * Usage: node scripts/auditTaskDisplayIds.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Task = require('../models/Task');
const { isValidTaskDisplayId } = require('../services/taskDisplayIdService');

const run = async () => {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGO_URI or MONGODB_URI is required.');
  }

  await mongoose.connect(uri);

  const total = await Task.countDocuments({});
  const withValid = await Task.countDocuments({ displayId: { $regex: /^TSK-\d+$/i } });
  const missing = await Task.countDocuments({
    $or: [{ displayId: { $exists: false } }, { displayId: null }, { displayId: '' }],
  });
  const invalid = total - withValid - missing;

  const sample = await Task.findOne({ displayId: { $regex: /^TSK-\d+$/i } })
    .select('_id displayId title status')
    .lean();

  console.log(JSON.stringify({
    total,
    withValidDisplayId: withValid,
    missingDisplayId: missing,
    invalidDisplayId: invalid,
    sampleTaskWithDisplayId: sample,
  }, null, 2));

  await mongoose.disconnect();
};

run().catch((error) => {
  console.error('[audit] failed', error.message);
  process.exit(1);
});
