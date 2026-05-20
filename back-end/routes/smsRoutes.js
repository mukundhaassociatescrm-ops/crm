const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { authorizeRole } = require('../middleware/roleMiddleware');
const { sendSingleSms } = require('../controllers/smsController');
const {
  templateUpload,
  importSmsTemplates,
  listSmsTemplates,
  patchSmsTemplateActive,
} = require('../controllers/smsTemplateController');

const router = express.Router();

router.post('/send-single', protect, sendSingleSms);
router.post('/send', protect, sendSingleSms);
router.get('/templates', protect, listSmsTemplates);
router.post('/templates/import', protect, authorizeRole('admin'), templateUpload, importSmsTemplates);
router.patch('/templates/:id/active', protect, authorizeRole('admin'), patchSmsTemplateActive);

module.exports = router;
