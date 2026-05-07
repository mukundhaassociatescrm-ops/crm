const getFetch = async () => {
  if (typeof global.fetch === 'function') {
    return global.fetch.bind(global);
  }

  const { default: fetch } = await import('node-fetch');
  return fetch;
};

const normalizePhoneNumber = (value) => String(value || '').replace(/^whatsapp:/i, '').trim();

const normalizeTo91Digits = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) {
    return null;
  }
  if (digits.length === 10) {
    return `91${digits}`;
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits;
  }
  return null;
};

const normalizeToE164 = (value) => {
  const digits91 = normalizeTo91Digits(value);
  if (!digits91) {
    return null;
  }
  return `+${digits91}`;
};

const isWhatsAppDebugEnabled = () => String(process.env.WHATSAPP_DEBUG || '').toLowerCase() === 'true';
const waDebug = (...args) => {
  if (isWhatsAppDebugEnabled()) {
    console.log('[WA DEBUG]', ...args);
  }
};

const getWhatsAppProvider = () => {
  if (process.env.WHATSAPP_PROVIDER) {
    return process.env.WHATSAPP_PROVIDER.toLowerCase();
  }

  if (process.env.GUPSHUP_API_KEY || process.env.GUPSHUP_APIKEY) {
    return 'gupshup';
  }

  if (process.env.META_WHATSAPP_TOKEN && process.env.META_PHONE_NUMBER_ID) {
    return 'meta';
  }

  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_FROM) {
    return 'twilio';
  }

  throw new Error('WhatsApp provider is not configured. Set Gupshup, Meta, or Twilio environment variables.');
};

const sendViaGupshup = async (to, message) => {
  const fetch = await getFetch();
  const apiKey = process.env.GUPSHUP_API_KEY || process.env.GUPSHUP_APIKEY;
  if (!apiKey) {
    throw new Error('GUPSHUP_API_KEY is not configured.');
  }

  const source = String(process.env.WHATSAPP_NUMBER || process.env.GUPSHUP_SOURCE || '').replace(/\D/g, '');
  if (!source) {
    throw new Error('WHATSAPP_NUMBER is not configured.');
  }

  const appName = String(process.env.GUPSHUP_APP_NAME || process.env.GUPSHUP_SRC_NAME || '').trim();
  if (!appName) {
    throw new Error('GUPSHUP_APP_NAME is not configured.');
  }

  const destination = normalizeTo91Digits(to);
  if (!destination) {
    throw new Error('A valid destination phone number is required.');
  }

  const cleanMessage = String(message || '').trim();
  if (!cleanMessage) {
    throw new Error('Message text is required.');
  }

  const url = String(process.env.GUPSHUP_SEND_URL || 'https://api.gupshup.io/wa/api/v1/msg').trim();
  const form = new URLSearchParams();
  form.append('channel', 'whatsapp');
  form.append('source', source);
  form.append('destination', destination);
  form.append('src.name', appName);
  form.append('message', JSON.stringify({ type: 'text', text: cleanMessage }));

  waDebug('gupshup:request', {
    url,
    channel: 'whatsapp',
    source,
    destination,
    srcName: appName,
    messageLength: cleanMessage.length,
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: apiKey,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });

  let payload = null;
  let rawText = '';
  try {
    payload = await response.json();
  } catch {
    try {
      rawText = await response.text();
    } catch {
      rawText = '';
    }
    payload = rawText ? { raw: rawText } : null;
  }

  waDebug('gupshup:response', { ok: response.ok, status: response.status, payload });

  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || rawText || 'Gupshup WhatsApp API request failed.');
  }

  return {
    provider: 'gupshup',
    success: true,
    messageId: payload?.messageId || payload?.id || payload?.message_id || payload?.data?.messageId,
    raw: payload,
  };
};

const sendViaMeta = async (to, message) => {
  const fetch = await getFetch();
  const url = `https://graph.facebook.com/v22.0/${process.env.META_PHONE_NUMBER_ID}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body: message },
  };

  waDebug('meta:request', { to, url, body });
  const response = await fetch(
    url,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.META_WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  waDebug('meta:response', { ok: response.ok, status: response.status, payload });
  if (!response.ok) {
    throw new Error(payload?.error?.message || payload?.message || 'Meta WhatsApp API request failed.');
  }

  return {
    provider: 'meta',
    success: true,
    messageId: payload?.messages?.[0]?.id,
    raw: payload,
  };
};

const sendViaTwilio = async (to, message) => {
  const fetch = await getFetch();
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;
  const body = new URLSearchParams({
    To: `whatsapp:${to}`,
    From: `whatsapp:${normalizePhoneNumber(from)}`,
    Body: message,
  });

  waDebug('twilio:request', { to, from: normalizePhoneNumber(from) });
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    }
  );

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  waDebug('twilio:response', { ok: response.ok, status: response.status, payload });
  if (!response.ok) {
    throw new Error(payload?.message || 'Twilio WhatsApp API request failed.');
  }

  return {
    provider: 'twilio',
    success: true,
    messageId: payload?.sid,
    raw: payload,
  };
};

async function sendMessage(to, message) {
  const provider = getWhatsAppProvider();
  const rawTo = normalizePhoneNumber(to);

  // Meta expects digits with country code (no "+"). Twilio expects E.164.
  const normalizedTo = provider === 'twilio'
    ? normalizeToE164(rawTo)
    : normalizeTo91Digits(rawTo);

  if (!normalizedTo) {
    throw new Error('A valid destination phone number is required.');
  }

  if (!message || !String(message).trim()) {
    throw new Error('Message text is required.');
  }

  waDebug('sendMessage:normalize', { provider, rawTo, normalizedTo });
  if (provider === 'gupshup') {
    return sendViaGupshup(normalizedTo, String(message).trim());
  }

  if (provider === 'meta') {
    return sendViaMeta(normalizedTo, String(message).trim());
  }

  if (provider === 'twilio') {
    return sendViaTwilio(normalizedTo, String(message).trim());
  }

  throw new Error(`Unsupported WhatsApp provider: ${provider}`);
}

async function sendWhatsAppMessage(phone, message) {
  const provider = (() => {
    try {
      return getWhatsAppProvider();
    } catch {
      return null;
    }
  })();

  try {
    const result = await sendMessage(phone, message);
    return { success: true, messageId: result.messageId, provider: result.provider, raw: result.raw };
  } catch (error) {
    return {
      success: false,
      provider,
      error: error?.message || String(error),
    };
  }
}

module.exports = { sendMessage, sendWhatsAppMessage };
