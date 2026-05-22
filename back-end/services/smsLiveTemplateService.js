const { fetchDltManagerRawBody } = require('./fast2smsService');
const {
  parseTemplateResponse,
  parseSenderResponse,
  buildSenderLookupMap,
  mapFlatTemplateToDbPayload,
} = require('./smsDltManagerParsers');
const { normalizeSmsTemplateForApi } = require('./smsTemplateNormalize');

const mapFlatToLiveApiTemplate = (flat, senderLookup) => {
  const mapped = mapFlatTemplateToDbPayload(flat, senderLookup);
  if (!mapped || mapped.error) {
    return null;
  }

  const messageId = String(mapped.messageId || '').trim();
  if (!messageId) {
    return null;
  }

  const base = {
    _id: `f2sms:${messageId}`,
    templateId: messageId,
    templateName: mapped.templateName || `Template ${messageId}`,
    messageId,
    fast2smsMessageId: messageId,
    dltMessageId: messageId,
    senderId: mapped.senderId,
    entityId: mapped.entityId,
    entityName: mapped.entityName,
    templateContent: mapped.templateContent,
    content: mapped.templateContent,
    approvalStatus: mapped.approvalStatus,
    provider: 'fast2sms',
    isActive: true,
    route: 'dlt',
  };

  return normalizeSmsTemplateForApi(base);
};

const fetchLiveSmsTemplates = async () => {
  const [templateHttp, senderHttp] = await Promise.all([
    fetchDltManagerRawBody('template'),
    fetchDltManagerRawBody('sender'),
  ]);

  assertFast2smsSuccess(templateHttp, 'template');
  assertFast2smsSuccess(senderHttp, 'sender');

  const flatTemplates = parseTemplateResponse(templateHttp.body);
  const parsedSenders = parseSenderResponse(senderHttp.body);
  const senderLookup = buildSenderLookupMap(parsedSenders);

  const data = flatTemplates
    .map((flat) => mapFlatToLiveApiTemplate(flat, senderLookup))
    .filter(Boolean);

  return {
    source: 'fast2sms',
    count: data.length,
    data,
  };
};

const assertFast2smsSuccess = (httpResult, type) => {
  const { status, body } = httpResult;

  if (!httpResult.ok) {
    const messageFromApi = body?.message || body?.error || `Fast2SMS DLT Manager (${type}) HTTP ${status}`;
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
};

module.exports = {
  fetchLiveSmsTemplates,
  mapFlatToLiveApiTemplate,
};
