const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { ensureUploadsDir, resolveUploadsDir } = require('../config/uploads');

const uploadsRoot = ensureUploadsDir(resolveUploadsDir(process.env));
const postersDir = path.join(uploadsRoot, 'posters');

if (!fs.existsSync(postersDir)) {
  fs.mkdirSync(postersDir, { recursive: true });
}

const safeFileName = (name) => String(name || '').replace(/[^a-zA-Z0-9._-]/g, '_');

const allowedMimeTypes = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, postersDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    const base = path.basename(file.originalname || 'poster', ext);
    cb(null, `${Date.now()}-${safeFileName(base)}${safeFileName(ext)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!allowedMimeTypes.has(String(file.mimetype || '').toLowerCase())) {
      return cb(new Error('Poster image must be JPG, PNG, or WEBP.'));
    }
    return cb(null, true);
  },
});

module.exports = {
  posterImageUploadMiddleware: upload.single('image'),
  postersDir,
};
