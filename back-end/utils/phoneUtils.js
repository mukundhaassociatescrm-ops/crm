/**
 * Format a raw phone number to +91XXXXXXXXXX.
 * Accepts: 10-digit, 91XXXXXXXXXX, +91XXXXXXXXXX.
 * Returns null if it cannot be normalised.
 */
const formatMobile = (raw) => {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 10) {
    return `+91${digits}`;
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    return `+${digits}`;
  }
  if (digits.length === 13 && String(raw).startsWith('+91')) {
    return `+91${digits.slice(2)}`;
  }
  return null;
};

const normalizePhoneDigits = (raw) => String(raw || '').replace(/\D/g, '');

module.exports = {
  formatMobile,
  normalizePhoneDigits,
};
