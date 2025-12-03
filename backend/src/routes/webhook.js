const express = require('express');
const adapters = require('../adapters');
const logger = require('../logger');
const config = require('../config');
const metaSignature = require('../middleware/metaSignature');
const telegramSecret = require('../middleware/telegramSecret');
const { processUnifiedMessage } = require('../services/messageService');

const router = express.Router();

const verifyHandler = (req, res) => {
  const mode = req.query['hub.mode'];
  const verifyToken = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && verifyToken === config.verifyToken) {
    logger.log('webhook_verified');
    return res.status(200).send(challenge);
  }

  logger.log('webhook_verify_failed', { mode, verifyToken });
  return res.sendStatus(403);
};

router.get('/', verifyHandler);
router.get('/whatsapp', verifyHandler);
router.get('/instagram', verifyHandler);
router.get('/messenger', verifyHandler);

const inboundHandler =
  (channel) =>
  async (req, res, next) => {
    try {
      logger.log('webhook_received', { channel, path: req.originalUrl });
      const adapter = adapters[channel];
      if (!adapter) {
        return res.status(400).json({ error: 'Unsupported channel' });
      }
      const unifiedMessages = adapter.parseIncoming(req.body || {});
      const io = req.app.get('io');

      await Promise.all(
        unifiedMessages.map((message) => processUnifiedMessage(message, io))
      );

      logger.log('webhook_processed', {
        channel,
        count: unifiedMessages.length
      });
      res.sendStatus(200);
    } catch (error) {
      logger.log('webhook_error', {
        channel,
        error: error.message,
        stack: error.stack
      });
      next(error);
    }
  };

router.post('/whatsapp', metaSignature, inboundHandler('whatsapp'));
router.post('/instagram', metaSignature, inboundHandler('instagram'));
router.post('/messenger', metaSignature, inboundHandler('messenger'));
router.post('/telegram', telegramSecret, inboundHandler('telegram'));

module.exports = router;

