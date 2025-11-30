const config = require('../config');
const logger = require('../logger');
const { verifySignature } = require('../utils/signature');

function metaSignatureMiddleware(req, res, next) {
  if (!config.fbAppSecret) {
    logger.log('signature_skip', { reason: 'missing_app_secret' });
    return next();
  }

  const signature =
    req.headers['x-hub-signature-256'] || req.headers['X-Hub-Signature-256'];
  const rawBody = req.rawBody;

  if (!signature || !rawBody) {
    logger.log('signature_missing', { path: req.originalUrl });
    return res.status(400).send('Missing webhook signature');
  }

  const isValid = verifySignature(rawBody, signature, config.fbAppSecret);

  if (!isValid) {
    logger.log('signature_invalid', { path: req.originalUrl });
    return res.status(401).send('Invalid signature');
  }

  next();
}

module.exports = metaSignatureMiddleware;

