const express = require('express');
const adapters = require('../adapters');
const { prisma } = require('../db/client');
const { processUnifiedMessage } = require('../services/messageService');
const logger = require('../logger');

const router = express.Router();

router.get('/conversations', async (req, res, next) => {
  try {
    const conversations = await prisma.conversation.findMany({
      orderBy: { last_ts: 'desc' },
      take: 50
    });
    res.json(conversations);
  } catch (error) {
    next(error);
  }
});

router.get('/conversations/:conversationId/messages', async (req, res, next) => {
  try {
    const messages = await prisma.message.findMany({
      where: { conversation_id: req.params.conversationId },
      orderBy: { created_at: 'asc' },
      take: 200
    });
    res.json(messages);
  } catch (error) {
    next(error);
  }
});

router.post('/send', async (req, res, next) => {
  try {
    const { channel, conversation_id, recipient_id, type = 'text', text } =
      req.body || {};
    if (!channel || !recipient_id || !text) {
      return res
        .status(400)
        .json({ error: 'channel, recipient_id, and text are required' });
    }

    const adapter = adapters[channel];
    if (!adapter?.sendMessage) {
      return res.status(400).json({ error: 'Unsupported channel' });
    }

    logger.log('outbound_attempt', { channel, conversation_id, recipient_id });

    const unifiedMessage = await adapter.sendMessage({
      channel,
      conversation_id,
      recipient_id,
      type,
      text
    });

    const io = req.app.get('io');
    const saved = await processUnifiedMessage(unifiedMessage, io);

    logger.log('outbound_success', {
      channel,
      conversation_id,
      message_id: saved?.message_id
    });

    res.json({ status: 'sent', message: saved });
  } catch (error) {
    logger.log('outbound_failed', { error: error.message });
    next(error);
  }
});

module.exports = router;

