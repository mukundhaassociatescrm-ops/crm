const path = require('path');
const multer = require('multer');
const { ensureUploadsDir, resolveUploadsDir } = require('../config/uploads');

const uploadsDir = ensureUploadsDir(resolveUploadsDir(process.env));

const allowedMimeTypes = new Set([
  'application/pdf',
  'application/msword',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'video/mp4',
  'video/webm',
  'video/ogg',
  'video/quicktime',
  'text/plain',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const safeFileName = (name) => String(name || '').replace(/[^a-zA-Z0-9._-]/g, '_');

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '') || '';
    const base = path.basename(file.originalname || 'attachment', ext);
    cb(null, `${Date.now()}-${safeFileName(base)}${safeFileName(ext)}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 15 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    if (!allowedMimeTypes.has(String(file.mimetype || '').toLowerCase())) {
      return cb(new Error('Unsupported file type. Allowed: pdf, doc, docx, xls, xlsx, jpg, png, mp4, webm, ogg, mov, txt.'));
    }

    return cb(null, true);
  },
});

const getPublicBaseUrl = (req) => {
  if (process.env.PUBLIC_BASE_URL) {
    return process.env.PUBLIC_BASE_URL.replace(/\/$/, '');
  }

  const host = req.get('host') || `localhost:${process.env.PORT || 3000}`;
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const isLocalHost = /localhost|127\.0\.0\.1/.test(host);
  const protocol = forwardedProto || (isLocalHost ? 'http' : 'https');

  return `${protocol}://${host}`;
};

exports.uploadFileMiddleware = upload.single('file');

exports.uploadFile = (req, res) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({
      success: false,
      message: 'file is required in multipart/form-data.',
    });
  }

  const baseUrl = getPublicBaseUrl(req);
  const publicUrl = `${baseUrl}/uploads/${encodeURIComponent(file.filename)}`;

  return res.status(200).json({
    success: true,
    data: {
      url: publicUrl,
      filename: file.originalname,
      mimeType: file.mimetype,
    },
  });
};
