const getFetch = async () => {
  if (typeof global.fetch === 'function') {
    return global.fetch.bind(global);
  }

  const { default: fetch } = await import('node-fetch');
  return fetch;
};

const normalizeIndianMobile = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) {
    return null;
  }

  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2);
  }

  if (digits.length === 10) {
    return digits;
  }

  return null;
};

async function sendFast2SmsBulk({ message, numbers }) {
  const apiKey = process.env.FAST2SMS_API_KEY;
  if (!apiKey) {
    throw new Error('FAST2SMS_API_KEY is not configured.');
  }

  const cleanMessage = String(message || '').trim();
  if (!cleanMessage) {
    throw new Error('Message text is required for SMS.');
  }

  const normalizedNumbers = Array.from(
    new Set((numbers || []).map(normalizeIndianMobile).filter(Boolean))
  );

  if (!normalizedNumbers.length) {
    throw new Error('No valid mobile numbers available for SMS delivery.');
  }

  const fetch = await getFetch();
  const response = await fetch('https://www.fast2sms.com/dev/bulkV2', {
    method: 'POST',
    headers: {
      authorization: apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      route: 'q',
      message: cleanMessage,
      language: 'english',
      flash: 0,
      numbers: normalizedNumbers.join(','),
    }),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const messageFromApi = payload?.message || payload?.error || 'Fast2SMS request failed.';
    throw new Error(Array.isArray(messageFromApi) ? messageFromApi.join(', ') : String(messageFromApi));
  }

  if (payload && payload.return === false) {
    const apiMessage = payload.message || 'Fast2SMS rejected the request.';
    throw new Error(Array.isArray(apiMessage) ? apiMessage.join(', ') : String(apiMessage));
  }

  return {
    success: true,
    acceptedCount: normalizedNumbers.length,
    raw: payload,
  };
}

async function sendSMS(phone, message) {
  const normalizedPhone = normalizeIndianMobile(phone);
  if (!normalizedPhone) {
    throw new Error('A valid Indian mobile number is required.');
  }

  const cleanMessage = String(message || '').trim();
  if (!cleanMessage) {
    throw new Error('Message text is required for SMS.');
  }

  if (cleanMessage.length > 1000) {
    throw new Error('Message is too long. Maximum allowed length is 1000 characters.');
  }

  const providerResponse = await sendFast2SmsBulk({ message: cleanMessage, numbers: [normalizedPhone] });

  return {
    success: true,
    phone: normalizedPhone,
    providerResponse,
  };
}

module.exports = {
  sendFast2SmsBulk,
  sendSMS,
  normalizeIndianMobile,
};
