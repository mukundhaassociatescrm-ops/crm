const { sendSMS } = require('../services/fast2smsService');

exports.sendSingleSms = async (req, res) => {
  const phone = req.body?.phone;
  const message = req.body?.message;

  const messageLength = String(message || '').trim().length;
  console.log('[SMS] sendSingleSms request', { phone, messageLength });

  try {
    const result = await sendSMS(phone, message);
    console.log('[SMS] sendSingleSms success', { phone: result.phone, messageLength });
    return res.status(200).json(result);
  } catch (error) {
    console.log('[SMS] sendSingleSms failed', { phone, messageLength, error: error?.message || String(error) });
    return res.status(400).json({
      success: false,
      message: error?.message || 'Failed to send SMS.',
    });
  }
};

