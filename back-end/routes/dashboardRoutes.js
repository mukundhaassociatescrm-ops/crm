const express = require('express');
const router = express.Router();
const { getOverview } = require('../controllers/dashboardController');
const { protect } = require('../middleware/authMiddleware');
const { authorizeRole } = require('../middleware/roleMiddleware');

router.get('/overview', protect, authorizeRole('admin'), getOverview);

module.exports = router;
