const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { sendSingleSms } = require('../controllers/smsController');

const router = express.Router();

router.post('/send', protect, sendSingleSms);

module.exports = router;

