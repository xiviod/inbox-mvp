const axios = require('axios');
const config = require('../config');
const logger = require('../logger');
const { toCanonicalMessage } = require('./helpers');
const { retry } = require('../utils/retry');

function normalizeAttachments(message) {
  return (
    message.attachments
      ?.map((attachment) => {
        if (!attachment?.type || !attachment?.payload?.url) return null;
        if (!['image', 'video'].includes(attachment.type)) return null;
        return { type: attachment.type, url: attachment.payload.url };
      })
      .filter(Boolean) || []
  );
}

function parseIncoming(payload = {}) {
  const unified = [];
  payload.entry?.forEach((entry) => {
    entry.messaging?.forEach((event) => {
      if (event.message) {
        const senderId = event.sender?.id;
        const attachments = normalizeAttachments(event.message);
        unified.push(
          toCanonicalMessage({
            channel: 'messenger',
            platform_user_id: senderId,
            conversation_id: `messenger:${senderId}`,
            message_id: event.message.mid || event.message.id,
            sender: 'user',
            type: event.message.text
              ? 'text'
              : attachments[0]?.type || 'unknown',
            text: event.message.text || null,
            attachments,
            metadata: { raw: event },
            timestamp: event.timestamp
              ? new Date(event.timestamp).toISOString()
              : new Date().toISOString()
          })
        );
      } else if (event.postback) {
        unified.push(
          toCanonicalMessage({
            channel: 'messenger',
            platform_user_id: event.sender?.id,
            conversation_id: `messenger:${event.sender?.id}`,
            message_id: event.postback.mid || `postback-${event.sender?.id}`,
            sender: 'user',
            type: 'template',
            text: event.postback.title || event.postback.payload,
            attachments: [],
            metadata: { raw: event },
            timestamp: event.timestamp
              ? new Date(event.timestamp).toISOString()
              : new Date().toISOString()
          })
        );
      }
    });
  });
  return unified;
}

async function sendMessage({ recipient_id, conversation_id, text }) {
  if (!config.facebook.pageAccessToken) {
    throw new Error('Facebook Page Access Token is missing');
  }

  const payload = {
    messaging_type: 'RESPONSE',
    recipient: { id: recipient_id },
    message: { text }
  };

  const url = `https://graph.facebook.com/${config.graphVersion}/me/messages`;

  logger.log('send_messenger_attempt', { recipient_id, conversation_id });

  const response = await retry(() =>
    axios.post(url, payload, {
      params: { access_token: config.facebook.pageAccessToken }
    })
  );

  logger.log('send_messenger_success', {
    recipient_id,
    conversation_id,
    graph_id: response.data?.message_id
  });

  return toCanonicalMessage({
    channel: 'messenger',
    platform_user_id: recipient_id,
    conversation_id: conversation_id || `messenger:${recipient_id}`,
    message_id: response.data?.message_id || `ms-local-${Date.now()}`,
    sender: 'agent',
    type: 'text',
    text,
    attachments: [],
    metadata: { raw: { request: payload, response: response.data } },
    timestamp: new Date().toISOString()
  });
}

module.exports = {
  channel: 'messenger',
  parseIncoming,
  sendMessage
};

