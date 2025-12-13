const adapters = require('../adapters');
const { prisma } = require('../db/client');
const logger = require('../logger');
const { callAssistant } = require('./aiService');
const { processUnifiedMessage } = require('./messageService');

const REPLY_MODES = {
  AI: 'ai',
  MANUAL: 'manual'
};

const inferRecipientId = (conversation) => {
  if (!conversation?.conversation_id) return null;
  // convention across channels in this repo: `${channel}:${platformId}`
  const parts = String(conversation.conversation_id).split(':');
  return parts.length >= 2 ? parts.slice(1).join(':') : null;
};

const extractReplyText = (data) => {
  if (!data) return null;
  if (typeof data.reply_text === 'string' && data.reply_text.trim()) {
    return data.reply_text.trim();
  }
  if (typeof data.reply === 'string' && data.reply.trim()) {
    return data.reply.trim();
  }
  if (typeof data.text === 'string' && data.text.trim()) {
    return data.text.trim();
  }
  return null;
};

async function maybeAutoReply(message, io) {
  try {
    if (!message || message.sender !== 'user') return;
    if (!message.text || !String(message.text).trim()) return;

    const conversation = await prisma.conversation.findUnique({
      where: { conversation_id: message.conversation_id }
    });
    if (!conversation) return;

    const mode = (conversation.reply_mode || REPLY_MODES.AI).toLowerCase();
    if (mode !== REPLY_MODES.AI) return;

    const adapter = adapters[message.channel];
    if (!adapter?.sendMessage) return;

    // tiny safety to avoid spamming if multiple webhook events arrive quickly
    const lastAgent = await prisma.message.findFirst({
      where: { conversation_id: message.conversation_id, sender: 'agent' },
      orderBy: { created_at: 'desc' }
    });
    if (lastAgent?.created_at) {
      const ageMs = Date.now() - new Date(lastAgent.created_at).getTime();
      if (ageMs < 1500) return;
    }

    const historyRows = await prisma.message.findMany({
      where: { conversation_id: message.conversation_id },
      orderBy: { created_at: 'desc' },
      take: 12
    });

    const history = historyRows
      .reverse()
      .map((row) => ({
        sender: row.sender,
        type: row.type,
        text: row.text,
        timestamp: row.timestamp || row.created_at,
        metadata: row.metadata || {}
      }));

    logger.log('ai_auto_reply_start', {
      conversation_id: message.conversation_id,
      channel: message.channel
    });

    const { data, cached } = await callAssistant({
      conversation_id: message.conversation_id,
      channel: message.channel,
      language: message.metadata?.language || 'auto',
      message_text: String(message.text),
      history,
      metadata: message.metadata || {}
    });

    const replyText = extractReplyText(data);
    if (!replyText) {
      logger.log('ai_auto_reply_empty', { conversation_id: message.conversation_id });
      return;
    }

    const recipient_id =
      message.channel === 'telegram'
        ? inferRecipientId(conversation)
        : inferRecipientId(conversation) || conversation.platform_user_id;

    if (!recipient_id) {
      logger.log('ai_auto_reply_no_recipient', {
        conversation_id: message.conversation_id,
        channel: message.channel
      });
      return;
    }

    const unified = await adapter.sendMessage({
      channel: message.channel,
      conversation_id: message.conversation_id,
      recipient_id,
      type: 'text',
      text: replyText
    });

    unified.metadata = {
      ...(unified.metadata || {}),
      origin: 'ai',
      ai: data,
      cached
    };

    await processUnifiedMessage(unified, io);

    logger.log('ai_auto_reply_sent', {
      conversation_id: message.conversation_id,
      channel: message.channel
    });
  } catch (error) {
    // Don't break webhook processing
    logger.log('ai_auto_reply_failed', {
      conversation_id: message?.conversation_id,
      error: error.message
    });
  }
}

module.exports = {
  REPLY_MODES,
  maybeAutoReply
};


