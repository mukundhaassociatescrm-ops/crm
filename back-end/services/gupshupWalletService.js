const getFetch = async () => {
  if (typeof global.fetch === 'function') {
    return global.fetch.bind(global);
  }
  const { default: fetch } = await import('node-fetch');
  return fetch;
};

const PARTNER_API_BASE = process.env.GUPSHUP_PARTNER_API_BASE || 'https://partner.gupshup.io';

const resolvePartnerToken = () => {
  const token = String(
    process.env.GUPSHUP_PARTNER_APP_TOKEN
    || process.env.GUPSHUP_PARTNER_TOKEN
    || process.env.GUPSHUP_PARTNER_API_KEY
    || ''
  ).trim();
  if (!token) {
    throw new Error('GUPSHUP_PARTNER_APP_TOKEN is not configured.');
  }
  return token;
};

const resolvePartnerAppId = () => {
  const appId = String(process.env.GUPSHUP_APP_ID || '').trim();
  if (!appId) {
    throw new Error('GUPSHUP_APP_ID is not configured.');
  }
  return appId;
};

/**
 * Fetch Gupshup partner app wallet balance (USD).
 * @see https://partner-docs.gupshup.io/reference/get_partner-app-appid-wallet-balance
 */
async function fetchGupshupWalletBalance() {
  const appId = resolvePartnerAppId();
  const token = resolvePartnerToken();
  const url = `${PARTNER_API_BASE}/partner/app/${encodeURIComponent(appId)}/wallet/balance`;

  const fetch = await getFetch();
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: token,
      Accept: 'application/json',
    },
  });

  const body = await response.json().catch(() => ({}));
  const walletResponse = body?.walletResponse || body?.data?.walletResponse || body;

  if (!response.ok) {
    const message = walletResponse?.message || body?.message || `Gupshup wallet request failed (${response.status})`;
    throw new Error(message);
  }

  const currency = String(walletResponse?.currency || 'USD').trim() || 'USD';
  const currentBalance = Number.parseFloat(String(walletResponse?.currentBalance ?? ''));
  const overDraftLimit = Number.parseFloat(String(walletResponse?.overDraftLimit ?? walletResponse?.overdraftLimit ?? '0'));

  return {
    currency,
    currentBalance: Number.isFinite(currentBalance) ? currentBalance : 0,
    overDraftLimit: Number.isFinite(overDraftLimit) ? overDraftLimit : 0,
  };
}

module.exports = {
  fetchGupshupWalletBalance,
};
