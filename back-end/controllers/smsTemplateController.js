const multer = require('multer');
const SmsTemplate = require('../models/SmsTemplate');
const {
  IMPORT_ACCEPTED_EXTENSIONS,
  IMPORT_ACCEPTED_MIME_TYPES,
  importSmsTemplatesFromFile,
} = require('../services/smsTemplateImportService');

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

exports.importSmsTemplates = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No import file provided.' });
    }

    const summary = await importSmsTemplatesFromFile(req.file);
    return res.status(200).json({
      success: true,
      message: 'SMS templates imported successfully.',
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
        { templateName: regex },
        { templateContent: regex },
        { sampleContent: regex },
        { senderId: regex },
        { category: regex },
      ];
    }

    const templates = await SmsTemplate.find(query)
      .sort({ templateName: 1, templateId: 1 })
      .lean();

    return res.status(200).json({
      success: true,
      data: templates,
      meta: {
        count: templates.length,
        activeOnly: activeOnly || (!includeInactive && !search),
      },
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
