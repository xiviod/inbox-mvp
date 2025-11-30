const axios = require('axios');
const config = require('../config');
const logger = require('../logger');
const { toCanonicalMessage } = require('./helpers');
const { retry } = require('../utils/retry');

function mapAttachments(message) {
  const attachments = [];
  if (message.image?.link) {
    attachments.push({ type: 'image', url: message.image.link });
  }
  if (message.video?.link) {
    attachments.push({ type: 'video', url: message.video.link });
  }
  return attachments;
}

function mapType(message) {
  if (!message.type) return 'unknown';
  if (['text', 'image', 'video', 'template'].includes(message.type)) {
    return message.type;
  }
  return 'unknown';
}

function parseMessagesFromChange(change) {
  const value = change.value || {};
  const messages = [];
  const contacts = value.contacts || [];
  const waId = contacts[0]?.wa_id || value.metadata?.display_phone_number;

  (value.messages || []).forEach((msg) => {
    messages.push(
      toCanonicalMessage({
        channel: 'whatsapp',
        platform_user_id: msg.from || waId,
        conversation_id: `whatsapp:${msg.from || waId}`,
        message_id: msg.id,
        sender: msg.from ? 'user' : 'system',
        type: mapType(msg),
        text:
          msg.text?.body ||
          msg.interactive?.body?.text ||
          msg.template?.name ||
          null,
        attachments: mapAttachments(msg),
        metadata: { raw: msg },
        timestamp: msg.timestamp
          ? new Date(Number(msg.timestamp) * 1000).toISOString()
          : new Date().toISOString()
      })
    );
  });

  (value.statuses || []).forEach((status) => {
    messages.push(
      toCanonicalMessage({
        channel: 'whatsapp',
        platform_user_id: status.recipient_id || waId,
        conversation_id: `whatsapp:${status.recipient_id || waId}`,
        message_id: status.id,
        sender: 'system',
        type: 'unknown',
        text: status.status,
        attachments: [],
        metadata: { raw: status },
        timestamp: status.timestamp
          ? new Date(Number(status.timestamp) * 1000).toISOString()
          : new Date().toISOString()
      })
    );
  });

  return messages;
}

function parseIncoming(payload = {}) {
  if (!payload.entry) return [];
  const unified = [];

  payload.entry.forEach((entry) => {
    entry.changes?.forEach((change) => {
      unified.push(...parseMessagesFromChange(change));
    });
  });

  return unified;
}

async function sendMessage({ conversation_id, recipient_id, text, type = 'text' }) {
  if (!config.whatsapp.phoneNumberId || !config.whatsapp.token) {
    throw new Error('WhatsApp credentials are missing');
  }

  const payload = {
    messaging_product: 'whatsapp',
    to: recipient_id,
    type,
    text: { preview_url: false, body: text }
  };

  const url = `https://graph.facebook.com/${config.graphVersion}/${config.whatsapp.phoneNumberId}/messages`;
  const headers = {
    Authorization: `Bearer ${config.whatsapp.token}`,
    'Content-Type': 'application/json'
  };

  logger.log('send_whatsapp_attempt', { recipient_id, conversation_id });

  const response = await retry(() => axios.post(url, payload, { headers }));

  logger.log('send_whatsapp_success', {
    recipient_id,
    conversation_id,
    graph_id: response.data?.messages?.[0]?.id
  });

  const messageId =
    response.data?.messages?.[0]?.id || `wa-local-${Date.now().toString(36)}`;

  return toCanonicalMessage({
    channel: 'whatsapp',
    platform_user_id: recipient_id,
    conversation_id: conversation_id || `whatsapp:${recipient_id}`,
    message_id: messageId,
    sender: 'agent',
    type,
    text,
    attachments: [],
    metadata: { raw: { request: payload, response: response.data } },
    timestamp: new Date().toISOString()
  });
}

module.exports = {
  channel: 'whatsapp',
  parseIncoming,
  sendMessage
};

