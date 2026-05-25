const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { authorizeRole } = require('../middleware/roleMiddleware');
const { getWallets } = require('../controllers/communicationController');

const router = express.Router();

router.get('/wallets', protect, authorizeRole('admin'), getWallets);

module.exports = router;
