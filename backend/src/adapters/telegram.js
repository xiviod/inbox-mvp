const axios = require('axios');
const config = require('../config');
const logger = require('../logger');
const { toCanonicalMessage } = require('./helpers');
const { retry } = require('../utils/retry');

const TELEGRAM_API = 'https://api.telegram.org';

const attachmentFromPhoto = (photos = []) => {
  if (!photos.length) return null;
  const largest = [...photos].sort((a, b) => (b.file_size || 0) - (a.file_size || 0))[0];
  return largest
    ? { type: 'image', url: `telegram:file_id:${largest.file_id}` }
    : null;
};

const attachmentFromDocument = (document) =>
  document
    ? { type: document.mime_type?.startsWith('video') ? 'video' : 'unknown', url: `telegram:file_id:${document.file_id}` }
    : null;

const buildCanonical = (message, sender = 'user') => {
  if (!message) return null;

  const attachments = [];
  const chatId =
    message.chat?.id ??
    message.sender_chat?.id ??
    message.from?.id ??
    'unknown';

  const fromUser = message.from || {};
  const chat = message.chat || {};
  const participant =
    chat.type === 'private'
      ? chat
      : fromUser.is_bot === false
      ? fromUser
      : chat || fromUser;

  const nameParts = [participant.first_name, participant.last_name].filter(
    Boolean
  );
  const displayName =
    participant.username ||
    (nameParts.length ? nameParts.join(' ') : null) ||
    fromUser.username ||
    `telegram:${chatId}`;
  const photo = attachmentFromPhoto(message.photo);
  if (photo) attachments.push(photo);

  const document = attachmentFromDocument(message.document || message.video);
  if (document) attachments.push(document);

  const text =
    message.text ||
    message.caption ||
    message.data ||
    message.game_short_name ||
    null;

  const type = message.text
    ? 'text'
    : attachments[0]?.type || (message.data ? 'template' : 'unknown');

  return toCanonicalMessage({
    channel: 'telegram',
    platform_user_id: displayName,
    conversation_id: `telegram:${chatId}`,
    message_id: String(message.message_id || message.id || Date.now()),
    sender,
    type,
    text,
    attachments,
    metadata: {
      raw: message,
      telegram_user_id: String(chatId),
      telegram_username: participant.username || fromUser.username || null,
      telegram_chat_title: chat.title || null
    },
    timestamp: message.date
      ? new Date(message.date * 1000).toISOString()
      : new Date().toISOString()
  });
};

function parseIncoming(payload = {}) {
  const updates = [];
  if (Array.isArray(payload)) {
    updates.push(...payload);
  } else if (payload.update_id) {
    updates.push(payload);
  } else if (Array.isArray(payload.result)) {
    updates.push(...payload.result);
  } else if (payload.body?.update_id) {
    updates.push(payload.body);
  }

  const messages = [];
  updates.forEach((update) => {
    if (update.message) {
      const canonical = buildCanonical(update.message, 'user');
      if (canonical) messages.push(canonical);
    } else if (update.edited_message) {
      const canonical = buildCanonical(update.edited_message, 'user');
      if (canonical) messages.push(canonical);
    } else if (update.callback_query) {
      const canonical = buildCanonical(
        {
          ...update.callback_query.message,
          data: update.callback_query.data,
          from: update.callback_query.from
        },
        'user'
      );
      if (canonical) messages.push(canonical);
    } else {
      messages.push(
        toCanonicalMessage({
          channel: 'telegram',
          platform_user_id: '',
          conversation_id: `telegram:unknown`,
          message_id: `telegram-unknown-${Date.now()}`,
          sender: 'system',
          type: 'unknown',
          text: 'Unhandled telegram update',
          metadata: { raw: update },
          timestamp: new Date().toISOString()
        })
      );
    }
  });

  return messages;
}

async function sendMessage({ conversation_id, recipient_id, text }) {
  if (!config.telegram.botToken) {
    throw new Error('Telegram bot token missing');
  }
  const chatId = recipient_id || conversation_id?.split(':')[1];
  if (!chatId) {
    throw new Error('Telegram recipient_id missing');
  }

  const payload = {
    chat_id: chatId,
    text
  };

  const url = `${TELEGRAM_API}/bot${config.telegram.botToken}/sendMessage`;

  logger.log('send_telegram_attempt', { chatId, conversation_id });

  const response = await retry(() => axios.post(url, payload));

  logger.log('send_telegram_success', {
    chatId,
    conversation_id,
    message_id: response.data?.result?.message_id
  });

  const unified = buildCanonical(
    {
      ...response.data?.result,
      text
    },
    'agent'
  );

  return (
    unified || {
      channel: 'telegram',
      platform_user_id: String(chatId),
      conversation_id: conversation_id || `telegram:${chatId}`,
      message_id:
        response.data?.result?.message_id ||
        `telegram-local-${Date.now().toString(36)}`,
      sender: 'agent',
      type: 'text',
      text,
      attachments: [],
      metadata: { raw: response.data },
      timestamp: new Date().toISOString()
    }
  );
}

module.exports = {
  channel: 'telegram',
  parseIncoming,
  sendMessage
};

