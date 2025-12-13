const axios = require('axios');
const config = require('../config');
const cache = require('./cacheService');
const logger = require('../logger');

function buildCacheKey(conversationId, hashable) {
  return `ai:${conversationId}:${Buffer.from(hashable).toString('base64')}`;
}

function withVersion(url, version) {
  if (!version) return url;
  const hasQuery = url.includes('?');
  return `${url}${hasQuery ? '&' : '?'}version=${encodeURIComponent(version)}`;
}

function buildAuthHeaders(token) {
  const raw = String(token || '').trim();
  if (!raw) return {};

  // Explicit bearer string → pass through
  if (/^bearer\s+/i.test(raw)) {
    return { Authorization: raw };
  }

  // Heuristic:
  // - Huawei IAM tokens / cert blobs tend to be very long (often start with "MI...")
  // - Typical API bearer/JWT tokens are shorter and/or dot-separated
  const looksJwt = raw.split('.').length === 3 && raw.length < 2000;
  const looksHuaweiToken = raw.length > 120 || raw.startsWith('MI');

  if (looksHuaweiToken && !looksJwt) {
    return { 'X-Auth-Token': raw };
  }

  return { Authorization: `Bearer ${raw}` };
}

async function callAssistant(payload) {
  if (!config.ai.endpoint) {
    throw new Error('AI assistant endpoint not configured');
  }
  if (!config.ai.token) {
    throw new Error('AI assistant token not configured');
  }

  const conversationId =
    payload?.conversation_id || `conv-${Date.now().toString(36)}`;
  const messageText = payload?.message_text || payload?.query || '';
  const language = payload?.language || 'multi';
  const channel = payload?.channel || 'unknown';

  const cacheKey = buildCacheKey(
    conversationId,
    `${channel}:${language}:${String(messageText)}`
  );

  const cached = await cache.getJSON(cacheKey);
  if (cached) {
    logger.log('ai_cache_hit', { conversation_id: conversationId });
    return { data: cached, cached: true };
  }

  const url = withVersion(config.ai.endpoint, config.ai.version || 'latest');

  try {
    const response = await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json',
        ...buildAuthHeaders(config.ai.token)
      },
      timeout: config.ai.timeoutMs || 15000
    });

    const data = response.data;
    await cache.setJSON(cacheKey, data, 120);
    logger.log('ai_invoke_success', {
      conversation_id: conversationId,
      intent: data?.intent,
      confidence: data?.confidence,
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
