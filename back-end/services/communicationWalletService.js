const { fetchFast2SmsWalletBalance } = require('./fast2smsService');
const { fetchGupshupWalletBalance } = require('./gupshupWalletService');

const CACHE_TTL_MS = Number.parseInt(String(process.env.COMMUNICATION_WALLET_CACHE_MS || ''), 10) || 5 * 60 * 1000;

let walletCache = {
  payload: null,
  fetchedAt: 0,
};

const buildProviderError = (error) => ({
  success: false,
  message: 'Unable to fetch wallet balance',
  error: error?.message || String(error),
});

const getCommunicationWallets = async ({ bypassCache = false } = {}) => {
  const now = Date.now();
  if (!bypassCache && walletCache.payload && now - walletCache.fetchedAt < CACHE_TTL_MS) {
    return {
      ...walletCache.payload,
      cached: true,
      cachedAt: new Date(walletCache.fetchedAt).toISOString(),
    };
  }

  const [smsSettled, whatsappSettled] = await Promise.allSettled([
    fetchFast2SmsWalletBalance(),
    fetchGupshupWalletBalance(),
  ]);

  const sms = smsSettled.status === 'fulfilled'
    ? {
      success: true,
      wallet: smsSettled.value.wallet,
      smsCount: smsSettled.value.smsCount,
    }
    : buildProviderError(smsSettled.reason);

  const whatsapp = whatsappSettled.status === 'fulfilled'
    ? {
      success: true,
      currency: whatsappSettled.value.currency,
      currentBalance: whatsappSettled.value.currentBalance,
      overDraftLimit: whatsappSettled.value.overDraftLimit,
    }
    : buildProviderError(whatsappSettled.reason);

  const payload = {
    success: sms.success || whatsapp.success,
    sms,
    whatsapp,
    cached: false,
    cachedAt: new Date(now).toISOString(),
  };

  walletCache = {
    payload: {
      success: payload.success,
      sms: payload.sms,
      whatsapp: payload.whatsapp,
    },
    fetchedAt: now,
  };

  return payload;
};

const clearCommunicationWalletCache = () => {
  walletCache = { payload: null, fetchedAt: 0 };
};

module.exports = {
  CACHE_TTL_MS,
  getCommunicationWallets,
  clearCommunicationWalletCache,
};
