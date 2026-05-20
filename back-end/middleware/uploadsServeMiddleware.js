const fs = require('fs');
const path = require('path');

const isTruthyDownloadQuery = (value) => {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
};

const resolveSafeUploadPath = (uploadsDir, requestPath) => {
  const decoded = decodeURIComponent(String(requestPath || ''));
  const normalized = path.normalize(decoded).replace(/^(\.\.(\/|\\|$))+/, '');
  const relativePath = normalized.replace(/^[/\\]+/, '');

  if (!relativePath || relativePath.includes('..')) {
    return null;
  }

  const absolutePath = path.resolve(uploadsDir, relativePath);
  const uploadsRoot = path.resolve(uploadsDir);

  if (!absolutePath.startsWith(uploadsRoot)) {
    return null;
  }

  return { absolutePath, relativePath };
};

const createUploadsServeMiddleware = (uploadsDir) => (req, res, next) => {
  const resolved = resolveSafeUploadPath(uploadsDir, req.path);
  if (!resolved) {
    return res.status(400).json({ success: false, message: 'Invalid upload path.' });
  }

  const { absolutePath, relativePath } = resolved;

  let stats;
  try {
    stats = fs.statSync(absolutePath);
  } catch {
    return next();
  }

  if (!stats.isFile()) {
    return next();
  }

  const downloadQuery = req.query.download;
  const forceDownload = isTruthyDownloadQuery(downloadQuery);
  const fileName = path.basename(absolutePath);
  const contentDisposition = forceDownload ? 'attachment' : 'inline';

  console.log('[FILE REQUEST]', {
    path: relativePath,
    downloadQuery: downloadQuery ?? null,
    contentDisposition,
  });

  if (forceDownload) {
    return res.download(absolutePath, fileName);
  }

  return res.sendFile(absolutePath, {
    headers: {
      'Content-Disposition': `inline; filename="${fileName}"`,
    },
  }, (error) => {
    if (error) {
      next(error);
    }
  });
};

module.exports = {
  createUploadsServeMiddleware,
  isTruthyDownloadQuery,
};
