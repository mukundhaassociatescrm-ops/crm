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

const {
  parseSenderResponse,
  parseTemplateResponse,
} = require('./smsDltManagerParsers');

const buildSafeDltManagerUrlForLog = (type) => {
  const safeUrl = new URL(DLT_MANAGER_BASE_URL);
  safeUrl.searchParams.set('authorization', '[REDACTED]');
  safeUrl.searchParams.set('type', type);
  return safeUrl.toString();
};

async function fetchDltManagerRawBody(type) {
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

  return {
    type: normalizedType,
    ok: response.ok,
    status: response.status,
    statusText: response.statusText || '',
    body,
  };
}

async function fetchDltManagerRaw(type) {
  const normalizedType = String(type || '').trim().toLowerCase();
  const isTemplateFetch = normalizedType === 'template';

  if (isTemplateFetch) {
    console.log('\n==============================');
    console.log('FAST2SMS TEMPLATE SYNC START');
    console.log('==============================');
    console.log('REQUEST URL:', buildSafeDltManagerUrlForLog('template'));
    console.log('REQUEST TYPE:', normalizedType);
  } else {
    console.log('[FAST2SMS SENDER FETCH]', {
      URL: buildSafeDltManagerUrlForLog('sender'),
      queryParams: { type: 'sender', authorization: '[REDACTED]' },
    });
  }

  const httpResult = await fetchDltManagerRawBody(type);
  const { status, body } = httpResult;

  if (isTemplateFetch) {
    console.log('FAST2SMS STATUS:', status);

    if (body) {
      console.log(
        'FAST2SMS RAW RESPONSE:',
        JSON.stringify(body, null, 2)
      );

      if (Array.isArray(body?.data)) {
        console.log(
          'FAST2SMS TEMPLATE COUNT:',
          body.data.length
        );

        console.log(
          'FAST2SMS FIRST TEMPLATE SAMPLE:',
          JSON.stringify(body.data[0], null, 2)
        );
      }
    } else {
      console.log('FAST2SMS RAW RESPONSE: null (failed to parse JSON body)');
    }

    console.log('==============================');
    console.log('FAST2SMS TEMPLATE SYNC END');
    console.log('==============================\n');
  } else {
    console.log('[FAST2SMS SENDER FETCH RESPONSE]', {
      status,
      topLevelKeys: body && typeof body === 'object' ? Object.keys(body) : [],
      dataLength: Array.isArray(body?.data) ? body.data.length : 0,
    });
  }

  if (!httpResult.ok) {
    const messageFromApi = body?.message || body?.error || `Fast2SMS DLT Manager (${normalizedType}) request failed.`;
    throw new Error(Array.isArray(messageFromApi) ? messageFromApi.join(', ') : String(messageFromApi));
  }

  if (
    body
    && (
      body.return === false
      || body.return === 'false'
      || body.status === false
      || body.success === false
    )
  ) {
    const apiMessage = body.message || 'Fast2SMS DLT Manager rejected the request.';
    throw new Error(Array.isArray(apiMessage) ? apiMessage.join(', ') : String(apiMessage));
  }

  if (normalizedType === 'template') {
    return parseTemplateResponse(body);
  }

  return parseSenderResponse(body);
}

async function fetchDltTemplates() {
  return fetchDltManagerRaw('template');
}

async function fetchDltSenders() {
  console.log('[FAST2SMS API CALL]', { endpoint: DLT_MANAGER_BASE_URL, type: 'sender' });
  const parsed = await fetchDltManagerRaw('sender');
  return parsed.map((row) => row.raw || row);
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

  console.log('FINAL FAST2SMS PAYLOAD:', {
    route: payload.route,
    sender_id: payload.sender_id,
    message_id: payload.message,
    message: payload.message,
    entity_id: payload.entity_id || null,
    numbers: payload.numbers,
    variables_values: payload.variables_values || null,
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
  fetchDltManagerRawBody,
  fetchDltManagerRaw,
  fetchDltTemplates,
  fetchDltSenders,
  sendFast2SmsBulk,
  sendDltSms,
  postFast2SmsPayload,
  sendSMS,
  normalizeIndianMobile,
};
