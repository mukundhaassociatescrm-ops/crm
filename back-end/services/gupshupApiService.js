const axios = require('axios');
const qs = require('qs');

const GUPSHUP_SEND_URL = process.env.GUPSHUP_SEND_URL || 'https://api.gupshup.io/wa/api/v1/msg';
/** HSM / template sends must use the template endpoint — /msg treats payloads as session messages and can trigger (#470) outside the 24h window. */
const GUPSHUP_TEMPLATE_SEND_URL =
  process.env.GUPSHUP_TEMPLATE_SEND_URL || 'https://api.gupshup.io/wa/api/v1/template/msg';
const GUPSHUP_SRC_NAME =
  process.env.GUPSHUP_SRC_NAME || process.env.GUPSHUP_APP_NAME || '';

console.log('[SERVICE TEMPLATE APP ID]', process.env.GUPSHUP_APP_ID ? 'present' : 'missing');
console.log('[SERVICE TEMPLATE SEND URL]', process.env.GUPSHUP_TEMPLATE_SEND_URL || GUPSHUP_TEMPLATE_SEND_URL);

/**
 * WhatsApp business number for Gupshup `source` — must match the number linked in the Gupshup app dashboard.
 * Set GUPSHUP_SOURCE in .env (e.g. 916384322139, digits only).
 */
const resolveGupshupSource = () => {
  console.log('[FINAL SOURCE]', process.env.GUPSHUP_SOURCE);

  const source = normalizeDestination(process.env.GUPSHUP_SOURCE);
  if (!source) {
    throw new Error('Missing GUPSHUP_SOURCE');
  }

  console.log('[FINAL SOURCE USED]', source);
  return source;
};

const normalizeDestination = (value) => {
  const raw = String(value || '').trim();
  const digits = raw.replace(/\D/g, '');
  if (!digits) {
    return '';
  }

  // If caller explicitly provides a country code (e.g. +93...), preserve it.
  if (raw.startsWith('+')) {
    return digits;
  }

  // If user enters a 10-digit Indian mobile number, auto-prefix country code.
  if (digits.length === 10) {
    return `91${digits}`;
  }

  return digits;
};

const normalizeAttachmentFilename = (value) => {
  const raw = String(value || '').trim();
  if (!raw) {
    return `attachment-${Date.now()}`;
  }

  // Keep provider-safe filename characters and replace spaces/special chars with underscores.
  return raw.replace(/[^a-zA-Z0-9._-]/g, '_');
};

const isImageMimeType = (value) => String(value || '').toLowerCase().startsWith('image/');

const isImageFileName = (value) => /\.(png|jpe?g|gif|webp)$/i.test(String(value || ''));

const extractMessageId = (responseBody) => {
  if (!responseBody || typeof responseBody !== 'object') {
    return '';
  }

  return (
    responseBody.messageId
    || responseBody.id
    || responseBody.message_id
    || responseBody.gsId
    || responseBody.gsid
    || responseBody?.data?.messageId
    || responseBody?.data?.id
    || responseBody?.message?.id
    || ''
  );
};

const classifyGupshupProviderBody = (body) => {
  const providerStatus = String(body?.status || body?.data?.status || '').toLowerCase();
  const messageId = extractMessageId(body);
  const detail = body?.message || body?.error || body?.reason || body?.description || '';
  const statusCode = String(body?.statusCode || body?.code || '').toLowerCase();

  const explicitRejected =
    providerStatus === 'error'
    || providerStatus === 'failed'
    || providerStatus === 'rejected'
    || statusCode === 'error'
    || statusCode === 'failed';

  const explicitAccepted =
    providerStatus === 'submitted'
    || providerStatus === 'success'
    || providerStatus === 'accepted'
    || providerStatus === 'enqueued'
    || providerStatus === 'queued'
    || providerStatus === 'sent'
    || Boolean(messageId);

  const accepted = !explicitRejected && explicitAccepted;
  const rejected = explicitRejected || (!accepted && Boolean(detail));

  return {
    messageId: messageId ? String(messageId) : '',
    providerStatus: providerStatus || (accepted ? 'submitted' : 'unknown'),
    detail: detail ? String(detail) : '',
    accepted,
    rejected,
  };
};

const logGupshupProviderResponse = (context, response, classification) => {
  console.log('[GUPSHUP PROVIDER RESPONSE]', {
    context,
    httpStatus: response?.status,
    httpStatusText: response?.statusText || '',
    messageId: classification.messageId || null,
    providerStatus: classification.providerStatus,
    accepted: classification.accepted,
    rejected: classification.rejected,
    detail: classification.detail || null,
    body: JSON.stringify(response?.data ?? null, null, 2),
  });
};

const parseGupshupProviderResponse = (response, context = 'gupshup') => {
  const classification = classifyGupshupProviderBody(response?.data);
  logGupshupProviderResponse(context, response, classification);

  if (response?.status >= 400) {
    const httpMessage = classification.detail || `Gupshup HTTP ${response.status}`;
    throw new Error(httpMessage);
  }

  if (classification.rejected) {
    throw new Error(classification.detail || 'Gupshup rejected the request.');
  }

  if (!classification.accepted) {
    throw new Error(classification.detail || 'Gupshup response did not confirm message acceptance.');
  }

  return {
    messageId: classification.messageId,
    providerStatus: classification.providerStatus,
    providerResponse: response?.data,
    accepted: true,
  };
};

const logGupshupProviderError = (context, error) => {
  console.log('[GUPSHUP PROVIDER ERROR]', {
    context,
    httpStatus: error?.response?.status || null,
    message: error?.message || String(error),
    body: JSON.stringify(error?.response?.data ?? null, null, 2),
  });
};

const buildBaseForm = (destination) => {
  const source = resolveGupshupSource();
  const form = new URLSearchParams();
  form.append('channel', 'whatsapp');
  form.append('source', source);
  form.append('destination', destination);
  if (GUPSHUP_SRC_NAME) {
    form.append('src.name', GUPSHUP_SRC_NAME);
  }
  return form;
};

const sendGupshupMessage = async (form) => {
  const apiKey = process.env.GUPSHUP_API_KEY || process.env.GUPSHUP_APIKEY;
  if (!apiKey) {
    throw new Error('GUPSHUP_API_KEY is not configured.');
  }

  const response = await axios.post(GUPSHUP_SEND_URL, form.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      apikey: apiKey,
    },
    timeout: 15000,
  });

  return {
    messageId: extractMessageId(response.data),
    providerResponse: response.data,
  };
};

const sendGupshupTextMessage = async ({ to, message }) => {
  console.log('--- GUPSHUP SEND START ---');

  const destination = normalizeDestination(to);
  if (!destination) {
    throw new Error('A valid destination number is required.');
  }

  const cleanMessage = String(message || '').trim();
  if (!cleanMessage) {
    throw new Error('Message text is required.');
  }

  const apiKey = process.env.GUPSHUP_API_KEY || process.env.GUPSHUP_APIKEY;
  if (!apiKey) {
    throw new Error('GUPSHUP_API_KEY is not configured.');
  }

  const source = resolveGupshupSource();

  const srcName = process.env.GUPSHUP_APP_NAME || process.env.GUPSHUP_SRC_NAME || GUPSHUP_SRC_NAME;
  const sendUrl = process.env.GUPSHUP_SEND_URL || GUPSHUP_SEND_URL;
  const messageObject = {
    type: 'text',
    text: cleanMessage,
  };
  const messageJson = JSON.stringify(messageObject);

  const formData = qs.stringify({
    channel: 'whatsapp',
    source,
    destination,
    'src.name': srcName,
    message: messageJson,
  });

  console.log('[SESSION CONFIG]', {
    url: sendUrl,
    source,
    destination: to,
    srcName: process.env.GUPSHUP_APP_NAME || process.env.GUPSHUP_SRC_NAME || GUPSHUP_SRC_NAME,
  });
  console.log('[SESSION VALIDATION]', {
    sourceEmpty: !source,
    srcNameEmpty: !process.env.GUPSHUP_APP_NAME,
  });
  console.log('[SESSION MESSAGE RAW]', messageObject);
  console.log('[SESSION MESSAGE STRING]', messageJson);
  console.log('[SESSION PAYLOAD STRING]', formData);
  console.log('[SESSION PAYLOAD SOURCE]', {
    sourceInPayload: formData.includes(`source=${source}`),
    source,
  });

  try {
    const response = await axios.post(sendUrl, formData, {
      headers: {
        apikey: apiKey,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeout: 15000,
    });

    console.log('[GUPSHUP RESPONSE]', {
      status: response.status,
      data: response.data,
    });

    return {
      messageId: extractMessageId(response.data),
      providerResponse: response.data,
    };
  } catch (error) {
    console.log('[GUPSHUP ERROR]', {
      status: error?.response?.status,
      data: error?.response?.data,
      message: error.message,
    });
    throw error;
  }
};

/** Session (24h window) text messages — alias for sendGupshupTextMessage. */
const sendWhatsAppMessage = sendGupshupTextMessage;

const sendGupshupFileMessage = async ({ to, fileUrl, filename, mimeType }) => {
  const destination = normalizeDestination(to);
  if (!destination) {
    throw new Error('A valid destination number is required.');
  }

  if (!fileUrl) {
    throw new Error('fileUrl is required to send a file message.');
  }

  const providerFilename = normalizeAttachmentFilename(filename);
  const shouldSendAsImage = isImageMimeType(mimeType) || isImageFileName(providerFilename);

  const messagePayload = shouldSendAsImage
    ? {
      type: 'image',
      originalUrl: String(fileUrl),
      previewUrl: String(fileUrl),
      caption: providerFilename,
    }
    : {
      type: 'file',
      // Keep both `url` and `file.link` for provider compatibility.
      url: String(fileUrl),
      filename: providerFilename,
      file: {
        link: String(fileUrl),
        filename: providerFilename,
      },
    };

  const form = buildBaseForm(destination);
  form.append('message', JSON.stringify(messagePayload));

  return sendGupshupMessage(form);
};

const sendGupshupTemplateMessage = async ({ to, templateId, params = [] }) => {
  const destination = normalizeDestination(to);
  if (!destination) {
    throw new Error('A valid destination number is required.');
  }

  if (!templateId) {
    throw new Error('templateId is required to send a template message.');
  }

  const normalizedParams = Array.isArray(params)
    ? params.map((value) => String(value ?? ''))
    : [];

  const apiKey = process.env.GUPSHUP_API_KEY || process.env.GUPSHUP_APIKEY;
  if (!apiKey) {
    throw new Error('GUPSHUP_API_KEY is not configured.');
  }

  const source = resolveGupshupSource();
  const srcName = process.env.GUPSHUP_APP_NAME || process.env.GUPSHUP_SRC_NAME || GUPSHUP_SRC_NAME;
  const templateSendUrl = process.env.GUPSHUP_TEMPLATE_SEND_URL || GUPSHUP_TEMPLATE_SEND_URL;

  const formData = qs.stringify({
    channel: 'whatsapp',
    source,
    destination,
    'src.name': srcName,
    template: JSON.stringify({
      id: String(templateId),
      params: normalizedParams,
    }),
  });

  console.log('[GUPSHUP TEMPLATE SEND PAYLOAD]', {
    destination,
    templateId: String(templateId),
    params: normalizedParams,
    source,
    srcName,
    url: templateSendUrl,
  });
  console.log('[GUPSHUP TEMPLATE SEND FORM]', formData);

  try {
    const response = await axios.post(templateSendUrl, formData, {
      headers: {
        apikey: apiKey,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeout: 15000,
      validateStatus: () => true,
    });

    const parsed = parseGupshupProviderResponse(response, 'template');
    return {
      messageId: parsed.messageId,
      providerStatus: parsed.providerStatus,
      providerResponse: parsed.providerResponse,
      accepted: true,
    };
  } catch (error) {
    logGupshupProviderError('template', error);
    throw error;
  }
};

module.exports = {
  normalizeDestination,
  resolveGupshupSource,
  classifyGupshupProviderBody,
  parseGupshupProviderResponse,
  sendGupshupTextMessage,
  sendWhatsAppMessage,
  sendGupshupFileMessage,
  sendGupshupTemplateMessage,
};
