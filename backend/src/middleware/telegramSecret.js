const config = require('../config');
const logger = require('../logger');

function telegramSecret(req, res, next) {
  if (!config.telegram.secretToken) {
    return next();
  }

  const header = req.headers['x-telegram-bot-api-secret-token'];
  if (!header) {
    logger.log('telegram_secret_missing');
    return res.status(401).send('Missing Telegram secret token');
  }

  if (header !== config.telegram.secretToken) {
    logger.log('telegram_secret_invalid');
    return res.status(401).send('Invalid Telegram secret token');
  }

  next();
}

module.exports = telegramSecret;

