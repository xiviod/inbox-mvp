const crypto = require('crypto');

function createSignature(rawBody, secret) {
  return (
    'sha256=' +
    crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
  );
}

function verifySignature(rawBody, headerSignature, secret) {
  if (!secret) return true;
  if (!rawBody || !headerSignature) return false;
  const expected = createSignature(rawBody, secret);
  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(headerSignature)
  );
}

module.exports = {
  createSignature,
  verifySignature
};

