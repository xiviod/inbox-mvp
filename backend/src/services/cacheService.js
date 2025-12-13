const Redis = require('ioredis');
const logger = require('../logger');
const config = require('../config');

let client;

function getClient() {
  if (client) return client;
  if (!config.cache.host) {
    logger.log('cache_disabled', { reason: 'missing_host' });
    return null;
  }

  const options = {
    host: config.cache.host,
    port: config.cache.port,
    password: config.cache.password || undefined,
    enableReadyCheck: true,
    lazyConnect: true
  };

  if (config.cache.tls) {
    options.tls = {};
  }

  client = new Redis(options);
  client.on('error', (err) => {
    logger.log('cache_error', { message: err.message });
  });
  client.on('connect', () => {
    logger.log('cache_connected', { host: config.cache.host, port: config.cache.port });
  });

  client.connect().catch((err) => {
    logger.log('cache_connect_failed', { error: err.message });
  });

  return client;
}

async function getJSON(key) {
  const redis = getClient();
  if (!redis) return null;
  const raw = await redis.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    logger.log('cache_parse_error', { key, error: error.message });
    return null;
  }
}

async function setJSON(key, value, ttlSeconds = 300) {
  const redis = getClient();
  if (!redis) return;
  try {
    const payload = JSON.stringify(value);
    if (ttlSeconds > 0) {
      await redis.set(key, payload, 'EX', ttlSeconds);
    } else {
      await redis.set(key, payload);
    }
  } catch (error) {
    logger.log('cache_set_error', { key, error: error.message });
  }
}

async function del(key) {
  const redis = getClient();
  if (!redis) return;
  try {
    await redis.del(key);
  } catch (error) {
    logger.log('cache_delete_error', { key, error: error.message });
  }
}

module.exports = {
  getJSON,
  setJSON,
  del
};

