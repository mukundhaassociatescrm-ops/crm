/**
 * Production / staging verification helper for WhatsApp Campaigns.
 * Usage: node scripts/verifyWhatsAppCampaigns.js [campaignId]
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const WhatsAppCampaign = require('../models/WhatsAppCampaign');
const CampaignRecipient = require('../models/CampaignRecipient');
const { getRolling24hUsage, getDailyTemplateLimit } = require('../services/campaignSettingsService');

const campaignId = process.argv[2];

const run = async () => {
  await connectDB();

  const usage = await getRolling24hUsage();
  const limit = await getDailyTemplateLimit();
  console.log('\n=== SAFE DAILY LIMIT ===');
  console.log(JSON.stringify({ configuredLimit: limit, rolling24h: usage }, null, 2));

  const campaignCount = await WhatsAppCampaign.countDocuments();
  const recipientCount = await CampaignRecipient.countDocuments();
  console.log('\n=== COLLECTION COUNTS ===');
  console.log({ whatsappCampaigns: campaignCount, campaignRecipients: recipientCount });

  const latest = await WhatsAppCampaign.findOne().sort({ createdAt: -1 }).lean();
  if (latest) {
    console.log('\n=== LATEST CAMPAIGN ===');
    console.log(JSON.stringify({
      id: latest._id,
      name: latest.name,
      status: latest.status,
      stats: latest.stats,
      dailyLimitSnapshot: latest.dailyLimitSnapshot,
      startedAt: latest.startedAt,
      createdAt: latest.createdAt,
    }, null, 2));
  }

  const targetId = campaignId || latest?._id;
  if (!targetId) {
    console.log('\nNo campaigns in DB yet.');
    process.exit(0);
  }

  const statusAgg = await CampaignRecipient.aggregate([
    { $match: { campaignId: new mongoose.Types.ObjectId(String(targetId)) } },
    { $group: { _id: '$status', count: { $sum: 1 }, sendMethod: { $first: '$sendMethod' } } },
    { $sort: { count: -1 } },
  ]);
  console.log(`\n=== RECIPIENT STATUS BREAKDOWN (${targetId}) ===`);
  console.table(statusAgg.map((r) => ({ status: r._id, count: r.count })));

  const sample = await CampaignRecipient.find({ campaignId: targetId })
    .sort({ createdAt: 1 })
    .limit(5)
    .select('customerName phone status sendMethod scheduledFor templateInitiatedAt whatsappMessageId failureReason')
    .lean();
  console.log('\n=== SAMPLE RECIPIENTS (first 5) ===');
  console.log(JSON.stringify(sample, null, 2));

  const dupes = await CampaignRecipient.aggregate([
    { $match: { campaignId: new mongoose.Types.ObjectId(String(targetId)) } },
    { $group: { _id: '$normalizedPhone', count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $limit: 10 },
  ]);
  console.log('\n=== DUPLICATE PHONES IN CAMPAIGN ===');
  console.log(dupes.length ? dupes : 'none');

  process.exit(0);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
