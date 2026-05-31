const axios = require('axios');
const { URL } = require('url');

const normalizeMediaUrl = (value) => String(value ?? '').trim();

const resolvePublicMediaUrl = (rawUrl) => {
  const trimmed = normalizeMediaUrl(rawUrl);
  if (!trimmed) {
    return '';
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  const base = normalizeMediaUrl(process.env.PUBLIC_BASE_URL).replace(/\/$/, '');
  if (!base) {
    throw new Error('PUBLIC_BASE_URL is required to resolve relative media URLs.');
  }

  const path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return `${base}${path}`;
};

const assertPublicHttpsMediaUrl = (rawUrl) => {
  const resolved = resolvePublicMediaUrl(rawUrl);
  if (!resolved) {
    throw new Error('A public image URL is required.');
  }

  let parsed;
  try {
    parsed = new URL(resolved);
  } catch {
    throw new Error('Invalid image URL.');
  }

  const isLocalHost = /^(localhost|127\.0\.0\.1)$/i.test(parsed.hostname);
  const allowHttp = process.env.NODE_ENV !== 'production' && isLocalHost;

  if (parsed.protocol !== 'https:' && !allowHttp) {
    throw new Error('Image URL must be a public HTTPS URL.');
  }

  return resolved;
};

const verifyMediaUrlReachable = async (url) => {
  try {
    const response = await axios.head(url, {
      timeout: 10000,
      maxRedirects: 5,
      validateStatus: (status) => status >= 200 && status < 400,
    });

    const contentType = String(response.headers['content-type'] || '').toLowerCase();
    if (contentType && !contentType.startsWith('image/')) {
      throw new Error('Media URL does not point to an image file.');
    }

    return true;
  } catch (error) {
    if (error?.response?.status === 405 || error?.response?.status === 501) {
      const getResponse = await axios.get(url, {
        timeout: 10000,
        maxRedirects: 5,
        responseType: 'stream',
        validateStatus: (status) => status >= 200 && status < 400,
      });
      getResponse.data?.destroy?.();
      const contentType = String(getResponse.headers['content-type'] || '').toLowerCase();
      if (contentType && !contentType.startsWith('image/')) {
        throw new Error('Media URL does not point to an image file.');
      }
      return true;
    }

    const message = error?.response?.status
      ? `Image URL is not reachable (HTTP ${error.response.status}).`
      : (error?.message || 'Image URL is not reachable.');
    throw new Error(message);
  }
};

const validateWhatsAppImageMediaUrl = async (rawUrl) => {
  const resolved = assertPublicHttpsMediaUrl(rawUrl);
  await verifyMediaUrlReachable(resolved);
  return resolved;
};

module.exports = {
  resolvePublicMediaUrl,
  assertPublicHttpsMediaUrl,
  verifyMediaUrlReachable,
  validateWhatsAppImageMediaUrl,
};
