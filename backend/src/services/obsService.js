const ObsClient = require('esdk-obs-nodejs');
const path = require('path');
const { randomUUID } = require('crypto');
const config = require('../config');
const logger = require('../logger');

let client;

function getClient() {
  if (client) return client;
  if (!config.obs.endpoint || !config.obs.accessKey || !config.obs.secretKey || !config.obs.bucket) {
    logger.log('obs_disabled', { reason: 'missing_configuration' });
    return null;
  }

  client = new ObsClient({
    access_key_id: config.obs.accessKey,
    secret_access_key: config.obs.secretKey,
    server: config.obs.endpoint,
    long_conn_param: 60
  });

  return client;
}

function buildObjectKey(filename) {
  const uuid = randomUUID().replace(/-/g, '');
  const ext = path.extname(filename || '');
  return `inbox/${uuid}${ext}`;
}

async function uploadBuffer(buffer, options = {}) {
  const obs = getClient();
  if (!obs) return null;

  const objectKey = options.objectKey || buildObjectKey(options.filename || 'media');

  try {
    await obs.putObject({
      Bucket: config.obs.bucket,
      Key: objectKey,
      Body: buffer,
      ContentType: options.contentType || 'application/octet-stream',
      Metadata: options.metadata || {}
    });

    logger.log('obs_upload_success', { key: objectKey, size: buffer.length });
    return objectKey;
  } catch (error) {
    logger.log('obs_upload_failed', { error: error.message });
    return null;
  }
}

function getSignedUrl(objectKey, expiresSeconds = 3600) {
  const obs = getClient();
  if (!obs) return null;

  try {
    const result = obs.createSignedUrlSync({
      Method: 'GET',
      Bucket: config.obs.bucket,
      Key: objectKey,
      Expires: expiresSeconds
    });
    return result.SignedUrl;
  } catch (error) {
    logger.log('obs_signed_url_failed', { error: error.message });
    return null;
  }
}

module.exports = {
  uploadBuffer,
  getSignedUrl
};

