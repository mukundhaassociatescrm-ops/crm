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

router.get('/settings', protect, authorizeRole('admin', 'user'), getCampaignSettings);
router.put('/settings', protect, authorizeRole('admin'), updateCampaignSettings);
router.get('/analyze/:groupId', protect, authorizeRole('admin', 'user'), analyzeAudience);
router.post('/', protect, authorizeRole('admin', 'user'), createCampaign);
router.get('/', protect, authorizeRole('admin', 'user'), listCampaigns);
router.get('/:id/recipients', protect, authorizeRole('admin', 'user'), getCampaignRecipients);
router.get('/:id', protect, authorizeRole('admin', 'user'), getCampaign);
router.post('/:id/pause', protect, authorizeRole('admin', 'user'), pauseCampaign);
router.post('/:id/resume', protect, authorizeRole('admin', 'user'), resumeCampaign);
router.post('/:id/retry-failed', protect, authorizeRole('admin', 'user'), retryFailed);

module.exports = router;
