const multer = require('multer');
const SmsTemplate = require('../models/SmsTemplate');
const {
  IMPORT_ACCEPTED_EXTENSIONS,
  IMPORT_ACCEPTED_MIME_TYPES,
  importSmsTemplatesFromFile,
} = require('../services/smsTemplateImportService');
const { syncSmsTemplatesFromFast2Sms } = require('../services/smsTemplateSyncService');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const originalName = String(file.originalname || '').toLowerCase();
    const extension = originalName.includes('.') ? originalName.slice(originalName.lastIndexOf('.')) : '';
    const mimeType = String(file.mimetype || '').toLowerCase();

    if (IMPORT_ACCEPTED_EXTENSIONS.has(extension) || IMPORT_ACCEPTED_MIME_TYPES.has(mimeType)) {
      cb(null, true);
      return;
    }

    cb(new Error('Only XLS and XLSX files are allowed'));
  },
});

exports.templateUpload = upload.single('file');

exports.syncSmsTemplates = async (req, res, next) => {
  try {
    const summary = await syncSmsTemplatesFromFast2Sms();
    return res.status(200).json({
      success: true,
      message: 'Templates synced successfully',
      synced: summary.synced,
      created: summary.created,
      updated: summary.updated,
      skipped: summary.skipped,
      errors: summary.errors,
      parsed: summary.parsed,
    });
  } catch (error) {
    return next(error);
  }
};

exports.importSmsTemplates = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No import file provided.' });
    }

    const summary = await importSmsTemplatesFromFile(req.file);
    return res.status(200).json({
      success: true,
      message: 'SMS templates imported successfully (Excel fallback).',
      data: summary,
    });
  } catch (error) {
    return next(error);
  }
};

exports.listSmsTemplates = async (req, res, next) => {
  try {
    const search = String(req.query.search || '').trim();
    const activeOnly = String(req.query.activeOnly || 'false').toLowerCase() === 'true';
    const includeInactive = String(req.query.includeInactive || 'false').toLowerCase() === 'true';
    const page = Math.max(1, Number.parseInt(String(req.query.page || '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit || '50'), 10) || 50));
    const skip = (page - 1) * limit;

    const query = {};
    if (activeOnly) {
      query.isActive = true;
    } else if (!includeInactive) {
      query.isActive = true;
    }

    if (search) {
      const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      query.$or = [
        { templateId: regex },
        { messageId: regex },
        { dltMessageId: regex },
        { contentTemplateId: regex },
        { entityId: regex },
        { entityName: regex },
        { templateName: regex },
        { templateContent: regex },
        { sampleContent: regex },
        { senderId: regex },
        { category: regex },
        { provider: regex },
        { approvalStatus: regex },
      ];
    }

    const [templates, total] = await Promise.all([
      SmsTemplate.find(query)
        .sort({ templateName: 1, templateId: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      SmsTemplate.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      data: templates,
      meta: {
        count: templates.length,
        total,
        page,
        limit,
        pages: Math.ceil(total / limit) || 1,
        activeOnly: activeOnly || (!includeInactive && !search),
      },
    });
  } catch (error) {
    return next(error);
  }
};

exports.updateSmsTemplateMessageId = async (req, res, next) => {
  try {
    const template = await SmsTemplate.findById(req.params.id);
    if (!template) {
      return res.status(404).json({ success: false, message: 'SMS template not found.' });
    }

    const messageId = String(req.body?.messageId || '').trim();
    if (!messageId) {
      return res.status(400).json({
        success: false,
        message: 'messageId is required and cannot be empty.',
      });
    }

    template.messageId = messageId;
    template.dltMessageId = messageId;
    await template.save();

    console.log('[SMS TEMPLATE MESSAGE ID UPDATED]', {
      templateId: template.templateId,
      templateName: template.templateName,
      messageId: template.messageId,
      mongoId: String(template._id),
    });

    return res.status(200).json({
      success: true,
      message: 'Message ID updated successfully.',
      data: template,
    });
  } catch (error) {
    return next(error);
  }
};

exports.patchSmsTemplateActive = async (req, res, next) => {
  try {
    const template = await SmsTemplate.findById(req.params.id);
    if (!template) {
      return res.status(404).json({ success: false, message: 'SMS template not found.' });
    }

    if (typeof req.body?.isActive === 'boolean') {
      template.isActive = req.body.isActive;
      await template.save();
    }

    return res.status(200).json({ success: true, data: template });
  } catch (error) {
    return next(error);
  }
};
