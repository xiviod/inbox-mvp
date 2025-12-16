const config = require('../config');
const logger = require('../logger');

function telegramSecret(req, res, next) {
  if (!config.telegram.secretToken) {
    return next();
  }

  const headerRaw = req.headers['x-telegram-bot-api-secret-token'];
  if (!headerRaw) {
    logger.log('telegram_secret_missing');
    return res.status(401).send('Missing Telegram secret token');
  }

  // Be tolerant of CRLF/whitespace differences (common when env was edited on Windows).
  const header = String(headerRaw).trim();
  const expected = String(config.telegram.secretToken).trim();

  if (header !== expected) {
    logger.log('telegram_secret_invalid', {
      header_len: header.length,
      expected_len: expected.length
    });
    return res.status(401).send('Invalid Telegram secret token');
  }

  next();
}

module.exports = telegramSecret;

