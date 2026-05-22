const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { authorizeRole } = require('../middleware/roleMiddleware');
const { sendSingleSms, sendBulkDltSms } = require('../controllers/smsController');
const {
  templateUpload,
  importSmsTemplates,
  debugFast2smsTemplates,
  debugSmsTemplates,
  listLiveSmsTemplates,
  listSmsTemplates,
  patchSmsTemplateActive,
  syncSmsTemplates,
  updateSmsTemplateMessageId,
} = require('../controllers/smsTemplateController');

const router = express.Router();

router.post('/send-single', protect, sendSingleSms);
router.post('/send', protect, sendSingleSms);
router.post('/send-bulk-dlt', protect, authorizeRole('admin'), sendBulkDltSms);
router.get('/debug-fast2sms-templates', protect, debugFast2smsTemplates);
router.get('/templates/live', protect, listLiveSmsTemplates);
router.get('/templates', protect, listSmsTemplates);
router.get('/templates/debug', protect, authorizeRole('admin'), debugSmsTemplates);
router.post('/templates/sync', protect, authorizeRole('admin'), syncSmsTemplates);
router.post('/templates/import', protect, authorizeRole('admin'), templateUpload, importSmsTemplates);
router.put('/templates/:id/message-id', protect, authorizeRole('admin'), updateSmsTemplateMessageId);
router.patch('/templates/:id/active', protect, authorizeRole('admin'), patchSmsTemplateActive);

module.exports = router;
