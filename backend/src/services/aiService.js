const axios = require('axios');
const config = require('../config');
const cache = require('./cacheService');
const logger = require('../logger');

function buildCacheKey(conversationId, message) {
  return `ai:${conversationId}:${Buffer.from(message).toString('base64')}`;
}

async function callAssistant(payload) {
  if (!config.ai.endpoint || !config.ai.token) {
    throw new Error('AI assistant endpoint/token not configured');
  }

  const conversationId =
    payload.conversation_id || `conv-${Date.now().toString(36)}`;
  const messageText = payload.message_text || payload.query || '';

  const cacheKey = buildCacheKey(conversationId, messageText);
  const cached = await cache.getJSON(cacheKey);
  if (cached) {
    logger.log('ai_cache_hit', { conversation_id: conversationId });
    return { data: cached, cached: true };
  }

  const url = `${config.ai.endpoint}/${encodeURIComponent(
    conversationId
  )}?version=${config.ai.version || 'latest'}`;

  try {
    const response = await axios.post(
      url,
      { query: messageText },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Auth-Token': config.ai.token
        },
        timeout: config.ai.timeoutMs || 15000
      }
    );

    const data = response.data;
    await cache.setJSON(cacheKey, data, 120);
    logger.log('ai_invoke_success', {
      conversation_id: conversationId,
      model_latency: data?.latency?.model
    });
    return { data, cached: false };
  } catch (error) {
    logger.log('ai_invoke_failed', {
      conversation_id: conversationId,
      error: error.message
    });
    throw error;
  }
}

module.exports = {
  callAssistant
};