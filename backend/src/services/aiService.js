const axios = require('axios');
const config = require('../config');
const cache = require('./cacheService');
const logger = require('../logger');

function buildCacheKey(conversationId, hashable) {
  return `ai:${conversationId}:${Buffer.from(hashable).toString('base64')}`;
}

async function callAssistant(payload) {
  if (!config.ai.endpoint) {
    throw new Error('AI assistant endpoint is not configured');
  }

  const cacheKey = buildCacheKey(
    payload.conversation_id || 'unknown',
    `${payload.language || 'multi'}:${payload.message_text}`
  );

  const cached = await cache.getJSON(cacheKey);
  if (cached) {
    logger.log('ai_cache_hit', { conversation_id: payload.conversation_id });
    return { data: cached, cached: true };
  }

  try {
    const response = await axios.post(config.ai.endpoint, payload, {
      headers: {
        Authorization: `Bearer ${config.ai.token}`,
        'Content-Type': 'application/json'
      },
      timeout: config.ai.timeoutMs || 15000
    });

    const data = response.data;
    await cache.setJSON(cacheKey, data, 120);
    logger.log('ai_invoke_success', {
      conversation_id: payload.conversation_id,
      intent: data.intent,
      confidence: data.confidence
    });
    return { data, cached: false };
  } catch (error) {
    logger.log('ai_invoke_failed', {
      conversation_id: payload.conversation_id,
      error: error.message
    });
    throw error;
  }
}

module.exports = {
  callAssistant
};

