/**
 * TEMPORARY verification logging for WhatsApp template campaign sends.
 * Remove this module after successful production validation (~48h).
 *
 * Active for 48 hours after the API process starts, unless overridden.
 * Disable early: TEMP_TEMPLATE_SEND_DEBUG=false
 * Extend window: TEMP_TEMPLATE_SEND_DEBUG_UNTIL=2026-06-04T23:59:59.999Z
 */

const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;
const DEBUG_STARTED_MS = Date.now();
const DEBUG_UNTIL_MS = (() => {
  const fromEnv = process.env.TEMP_TEMPLATE_SEND_DEBUG_UNTIL;
  if (fromEnv) {
    const parsed = Date.parse(fromEnv);
    return Number.isFinite(parsed) ? parsed : DEBUG_STARTED_MS + FORTY_EIGHT_HOURS_MS;
  }
  return DEBUG_STARTED_MS + FORTY_EIGHT_HOURS_MS;
})();

const isTempTemplateSendDebugEnabled = () => {
  if (String(process.env.TEMP_TEMPLATE_SEND_DEBUG || '').toLowerCase() === 'false') {
    return false;
  }

  if (!Number.isFinite(DEBUG_UNTIL_MS)) {
    return true;
  }

  return Date.now() <= DEBUG_UNTIL_MS;
};

const logTempTemplateSend = (phase, payload) => {
  if (!isTempTemplateSendDebugEnabled()) {
    return;
  }

  const tag = phase === 'before'
    ? '[TEMP TEMPLATE SEND DEBUG · BEFORE]'
    : '[TEMP TEMPLATE SEND DEBUG · AFTER]';

  console.log(tag, {
    phase,
    loggedAt: new Date().toISOString(),
    expiresAt: Number.isFinite(DEBUG_UNTIL_MS) ? new Date(DEBUG_UNTIL_MS).toISOString() : null,
    ...payload,
  });
};

const logTempTemplateSendBefore = (payload) => {
  logTempTemplateSend('before', payload);
};

const logTempTemplateSendAfter = (payload) => {
  logTempTemplateSend('after', payload);
};

module.exports = {
  isTempTemplateSendDebugEnabled,
  logTempTemplateSendBefore,
  logTempTemplateSendAfter,
};
