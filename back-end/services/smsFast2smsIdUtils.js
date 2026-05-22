/**
 * Fast2SMS DLT route `message` = short numeric Message ID from DLT Manager (e.g. 215773).
 * DLT registry Content Template ID is 15–20 digits (e.g. 1207177919802380527) — must NOT be sent as `message`.
 */

const asTrimmed = (value) => String(value ?? '').trim();

const isNumericId = (value) => /^\d+$/.test(asTrimmed(value));

/** Fast2SMS-approved Message ID (from DLT Manager / sync). */
const isFast2smsMessageId = (value) => {
  const id = asTrimmed(value);
  if (!id || !isNumericId(id)) {
    return false;
  }
  return id.length <= 11;
};

/** TRAI DLT Content Template ID — not valid for Fast2SMS `message` param. */
const isDltContentTemplateId = (value) => {
  const id = asTrimmed(value);
  if (!id || !isNumericId(id)) {
    return false;
  }
  return id.length >= 12;
};

const resolveFast2smsMessageIdFromRecord = (template) => {
  const candidates = [
    template?.messageId,
    template?.dltMessageId,
  ].map(asTrimmed).filter(Boolean);

  const valid = candidates.find(isFast2smsMessageId);
  if (valid) {
    return valid;
  }

  return '';
};

const resolveDltContentTemplateIdFromRecord = (template) => {
  const candidates = [
    template?.contentTemplateId,
    template?.templateId,
  ].map(asTrimmed).filter(Boolean);

  return candidates.find(isDltContentTemplateId) || '';
};

/** Fast2SMS POST /dev/custom bulk DLT — `message` prefers TRAI content template ID, else Message ID. */
const resolveBulkDltCustomMessage = (template) => {
  const dltContentId = resolveDltContentTemplateIdFromRecord(template);
  if (dltContentId) {
    return dltContentId;
  }
  return resolveFast2smsMessageIdFromRecord(template);
};

module.exports = {
  asTrimmed,
  isFast2smsMessageId,
  isDltContentTemplateId,
  resolveFast2smsMessageIdFromRecord,
  resolveDltContentTemplateIdFromRecord,
  resolveBulkDltCustomMessage,
};
