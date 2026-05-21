const getFetch = async () => {
  if (typeof global.fetch === 'function') {
    return global.fetch.bind(global);
  }

  const { default: fetch } = await import('node-fetch');
  return fetch;
};

const DLT_MANAGER_BASE_URL = 'https://www.fast2sms.com/dev/dlt_manager';

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

const unwrapDltManagerRecords = (body) => {
  if (!body) {
    return [];
  }

  if (Array.isArray(body)) {
    return body;
  }

  const candidates = [
    body.data,
    body.records,
    body.templates,
    body.senders,
    body.result,
    body.list,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
    if (candidate && typeof candidate === 'object') {
      const nested = Object.values(candidate).find((value) => Array.isArray(value));
      if (nested) {
        return nested;
      }
    }
  }

  return [];
};

async function fetchDltManager(type) {
  const apiKey = process.env.FAST2SMS_API_KEY;
  if (!apiKey) {
    throw new Error('FAST2SMS_API_KEY is not configured.');
  }

  const normalizedType = String(type || '').trim().toLowerCase();
  if (!['template', 'sender'].includes(normalizedType)) {
    throw new Error("DLT Manager type must be 'template' or 'sender'.");
  }

  const url = new URL(DLT_MANAGER_BASE_URL);
  url.searchParams.set('authorization', apiKey);
  url.searchParams.set('type', normalizedType);

  const fetch = await getFetch();
  const response = await fetch(url.toString(), { method: 'GET' });

  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const messageFromApi = body?.message || body?.error || `Fast2SMS DLT Manager (${normalizedType}) request failed.`;
    throw new Error(Array.isArray(messageFromApi) ? messageFromApi.join(', ') : String(messageFromApi));
  }

  if (body && (body.return === false || body.return === 'false' || body.status === false)) {
    const apiMessage = body.message || 'Fast2SMS DLT Manager rejected the request.';
    throw new Error(Array.isArray(apiMessage) ? apiMessage.join(', ') : String(apiMessage));
  }

  const records = unwrapDltManagerRecords(body);
  console.log('[FAST2SMS TEMPLATE RESPONSE]', {
    type: normalizedType,
    recordCount: records.length,
    keys: body && typeof body === 'object' ? Object.keys(body) : [],
  });

  return records;
}

async function fetchDltTemplates() {
  return fetchDltManager('template');
}

async function fetchDltSenders() {
  return fetchDltManager('sender');
}

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

async function postFast2SmsPayload(payload) {
  const apiKey = process.env.FAST2SMS_API_KEY;
  if (!apiKey) {
    throw new Error('FAST2SMS_API_KEY is not configured.');
  }

  const fetch = await getFetch();
  const response = await fetch('https://www.fast2sms.com/dev/bulkV2', {
    method: 'POST',
    headers: {
      authorization: apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const messageFromApi = body?.message || body?.error || 'Fast2SMS request failed.';
    throw new Error(Array.isArray(messageFromApi) ? messageFromApi.join(', ') : String(messageFromApi));
  }

  if (body && body.return === false) {
    const apiMessage = body.message || 'Fast2SMS rejected the request.';
    throw new Error(Array.isArray(apiMessage) ? apiMessage.join(', ') : String(apiMessage));
  }

  return body;
}

/**
 * DLT template SMS (route: dlt) — `message` must be Fast2SMS DLT Manager Message ID.
 * @param {{
 *   phone: string,
 *   messageId: string,
 *   senderId: string,
 *   variablesValues?: string,
 *   entityId?: string,
 *   contentTemplateId?: string,
 * }} params
 */
async function sendDltSms({
  phone,
  messageId,
  senderId,
  variablesValues = '',
  entityId = '',
  contentTemplateId = '',
}) {
  const normalizedPhone = normalizeIndianMobile(phone);
  if (!normalizedPhone) {
    throw new Error('A valid Indian mobile number is required.');
  }

  const fast2smsMessageId = String(messageId || '').trim();
  if (!fast2smsMessageId) {
    throw new Error('DLT Message ID is required for Fast2SMS (MESSAGE_ID from Excel / DLT Manager).');
  }

  const dltSenderId = String(senderId || '').trim();
  if (!dltSenderId) {
    throw new Error('senderId is required for DLT SMS.');
  }

  const payload = {
    route: 'dlt',
    sender_id: dltSenderId,
    message: fast2smsMessageId,
    numbers: normalizedPhone,
  };

  const normalizedVariables = String(variablesValues || '').trim();
  if (normalizedVariables) {
    payload.variables_values = normalizedVariables;
  }

  const normalizedEntityId = String(entityId || '').trim();
  if (normalizedEntityId) {
    payload.entity_id = normalizedEntityId;
  }

  const normalizedContentTemplateId = String(contentTemplateId || '').trim();
  if (normalizedContentTemplateId && String(process.env.FAST2SMS_INCLUDE_CONTENT_TEMPLATE_ID || '').toLowerCase() === 'true') {
    payload.template_id = normalizedContentTemplateId;
  }

  console.log('[SMS SEND PAYLOAD]', {
    sender_id: payload.sender_id,
    message: payload.message,
    variables_values: payload.variables_values || '',
    route: payload.route,
    numbers: payload.numbers,
    entity_id: payload.entity_id || undefined,
    template_id: payload.template_id || undefined,
  });

  const providerResponse = await postFast2SmsPayload(payload);

  console.log('[FAST2SMS RESPONSE]', providerResponse);

  return {
    success: true,
    phone: normalizedPhone,
    messageId: fast2smsMessageId,
    senderId: dltSenderId,
    variablesValues: normalizedVariables,
    providerResponse,
  };
}

/** @deprecated Use sendDltSms for DLT-enabled accounts. */
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
  fetchDltManager,
  fetchDltTemplates,
  fetchDltSenders,
  sendFast2SmsBulk,
  sendDltSms,
  postFast2SmsPayload,
  sendSMS,
  normalizeIndianMobile,
};
