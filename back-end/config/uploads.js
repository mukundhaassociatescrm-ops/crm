const fs = require('fs');
const path = require('path');

const resolveUploadsDir = (env = process.env) => {
  const explicit = String(env.UPLOADS_DIR || '').trim();
  if (explicit) {
    return path.resolve(explicit);
  }

  const nodeEnv = String(env.NODE_ENV || '').toLowerCase();
  if (nodeEnv === 'production') {
    return path.resolve('/app/uploads');
  }

  // Default for local dev: project root /uploads
  return path.resolve(__dirname, '..', '..', 'uploads');
};

const ensureUploadsDir = (uploadsDir) => {
  if (!uploadsDir) {
    throw new Error('uploadsDir is required');
  }

  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  return uploadsDir;
};

module.exports = {
  resolveUploadsDir,
  ensureUploadsDir,
};

