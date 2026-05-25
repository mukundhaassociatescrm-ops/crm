const { getCommunicationWallets } = require('../services/communicationWalletService');

exports.getWallets = async (req, res, next) => {
  try {
    const bypassCache = String(req.query.refresh || '').toLowerCase() === 'true';
    const data = await getCommunicationWallets({ bypassCache });
    return res.json(data);
  } catch (error) {
    next(error);
  }
};
