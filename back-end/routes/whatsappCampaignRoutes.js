const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { authorizeRole } = require('../middleware/roleMiddleware');
const {
  getCampaignSettings,
  updateCampaignSettings,
  analyzeAudience,
  createCampaign,
  listCampaigns,
  getCampaign,
  getCampaignRecipients,
  pauseCampaign,
  resumeCampaign,
  retryFailed,
} = require('../controllers/whatsappCampaignController');

const router = express.Router();

router.get('/settings', protect, authorizeRole('admin'), getCampaignSettings);
router.put('/settings', protect, authorizeRole('admin'), updateCampaignSettings);
router.get('/analyze/:groupId', protect, authorizeRole('admin'), analyzeAudience);
router.post('/', protect, authorizeRole('admin'), createCampaign);
router.get('/', protect, authorizeRole('admin'), listCampaigns);
router.get('/:id/recipients', protect, authorizeRole('admin'), getCampaignRecipients);
router.get('/:id', protect, authorizeRole('admin'), getCampaign);
router.post('/:id/pause', protect, authorizeRole('admin'), pauseCampaign);
router.post('/:id/resume', protect, authorizeRole('admin'), resumeCampaign);
router.post('/:id/retry-failed', protect, authorizeRole('admin'), retryFailed);

module.exports = router;
