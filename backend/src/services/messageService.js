const { Prisma } = require('@prisma/client');
const { prisma } = require('../db/client');
const logger = require('../logger');

const messagePreview = (message) =>
  message.text ||
  (message.attachments?.length
    ? `[${message.attachments[0].type} attachment]`
    : `[${message.type || 'unknown'}]`);

const normalizeTimestamp = (ts) => {
  if (!ts) return new Date();
  return ts instanceof Date ? ts : new Date(ts);
};

async function upsertConversation(message) {
  return prisma.conversation.upsert({
    where: { conversation_id: message.conversation_id },
    create: {
      conversation_id: message.conversation_id,
      channel: message.channel,
      platform_user_id: message.platform_user_id,
      last_message: messagePreview(message),
      last_ts: normalizeTimestamp(message.timestamp)
    },
    update: {
      platform_user_id: message.platform_user_id,
      last_message: messagePreview(message),
      last_ts: normalizeTimestamp(message.timestamp)
    }
  });
}

async function persistMessage(message) {
  try {
    return await prisma.message.create({
      data: {
        conversation_id: message.conversation_id,
        message_id: message.message_id || null,
        channel: message.channel,
        sender: message.sender,
        type: message.type,
        text: message.text,
        attachments: message.attachments || [],
        metadata: message.metadata || {},
        timestamp: message.timestamp ? normalizeTimestamp(message.timestamp) : null
      }
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      logger.log('message_duplicate', {
        conversation_id: message.conversation_id,
        message_id: message.message_id
      });
      return prisma.message.findUnique({
        where: { message_id: message.message_id }
      });
    }
    throw error;
  }
}

async function processUnifiedMessage(message, io) {
  await upsertConversation(message);
  const saved = await persistMessage(message);
  if (saved) {
    logger.log('message_saved', {
      conversation_id: saved.conversation_id,
      sender: saved.sender,
      channel: saved.channel
    });
    if (io?.emit) {
      io.emit('message.new', saved);
    }
  }
  return saved;
}

module.exports = {
  processUnifiedMessage
};

