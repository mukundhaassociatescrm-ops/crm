const META_MARKETING_LIMIT_CODE = '131049';
const MARKETING_LIMIT_RETRY_MS = 24 * 60 * 60 * 1000;
const MAX_FAILURE_WEBHOOK_BYTES = 16 * 1024;

const META_MARKETING_LIMIT_CATEGORY = 'meta_marketing_limit';

const FAILURE_CATEGORY_BY_CODE = {
  [META_MARKETING_LIMIT_CODE]: META_MARKETING_LIMIT_CATEGORY,
};

const isMarketingLimitScheduledRetry = (recipient) => (
  recipient?.status === 'ScheduledRetry'
  && recipient?.failureCategory === META_MARKETING_LIMIT_CATEGORY
);

const truncateFailurePayload = (value) => {
  if (value === null || value === undefined) {
    return null;
  }

  try {
    const serialized = JSON.stringify(value);
    if (serialized.length <= MAX_FAILURE_WEBHOOK_BYTES) {
      return value;
    }

    return {
      truncated: true,
      originalBytes: serialized.length,
      preview: serialized.slice(0, MAX_FAILURE_WEBHOOK_BYTES),
    };
  } catch {
    return { truncated: true, preview: String(value).slice(0, MAX_FAILURE_WEBHOOK_BYTES) };
  }
};

const classifyWhatsAppFailure = (failureCode = '', failureReason = '') => {
  const code = String(failureCode || '').trim();
  const reason = String(failureReason || '').trim();
  const reasonLower = reason.toLowerCase();

  if (
    code === META_MARKETING_LIMIT_CODE
    || reasonLower.includes('healthy ecosystem engagement')
  ) {
    return {
      failureCategory: FAILURE_CATEGORY_BY_CODE[META_MARKETING_LIMIT_CODE],
      retryEligible: true,
      scheduleRetry: true,
      retryScheduledAt: new Date(Date.now() + MARKETING_LIMIT_RETRY_MS),
    };
  }

  return {
    failureCategory: '',
    retryEligible: false,
    scheduleRetry: false,
    retryScheduledAt: null,
  };
};

module.exports = {
  META_MARKETING_LIMIT_CODE,
  META_MARKETING_LIMIT_CATEGORY,
  MARKETING_LIMIT_RETRY_MS,
  classifyWhatsAppFailure,
  truncateFailurePayload,
  isMarketingLimitScheduledRetry,
};
