const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const normalizeOrigins = (raw) => {
  const parts = (raw || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  const hasWildcard = parts.some((part) =>
    ['*', 'self', 'same-origin'].includes(part.toLowerCase())
  );

  const values = parts
    .filter(
      (part) => !['*', 'self', 'same-origin'].includes(part.toLowerCase())
    )
    .map((part) => part.replace(/\/$/, ''));

  return {
    values,
    allowAll: hasWildcard || values.length === 0
  };
};

const requiredForProd = [
  'DATABASE_URL',
  'WEBHOOK_VERIFY_TOKEN',
  'FB_APP_SECRET',
  'WHATSAPP_PHONE_NUMBER_ID',
  'WHATSAPP_TOKEN',
  'FB_PAGE_ACCESS_TOKEN',
  'TELEGRAM_BOT_TOKEN'
];

const recommendedForProd = [
  'OBS_ENDPOINT',
  'OBS_BUCKET',
  'OBS_REGION',
  'OBS_ACCESS_KEY',
  'OBS_SECRET_KEY',
  'DCS_REDIS_HOST',
  'AI_ASSIST_ENDPOINT',
  'AI_ASSIST_TOKEN'
];

const missingRequired = requiredForProd.filter((key) => !process.env[key]);
if (missingRequired.length) {
  console.warn(
    `[config] Missing required env vars: ${missingRequired.join(
      ', '
    )}. The server will start, but webhook verification or outbound sending may fail until they are provided.`
  );
}

const missingRecommended = recommendedForProd.filter((key) => !process.env[key]);
if (missingRecommended.length) {
  console.warn(
    `[config] Missing recommended Huawei Cloud env vars: ${missingRecommended.join(
      ', '
    )}. Related integrations (OBS/DCS/AI) will be skipped until they are provided.`
  );
}

const frontendOriginConfig = normalizeOrigins(process.env.FRONTEND_ORIGIN);

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 4000,
  databaseUrl: process.env.DATABASE_URL,
  verifyToken: process.env.WEBHOOK_VERIFY_TOKEN || 'dev-verify-token',
  fbAppSecret: process.env.FB_APP_SECRET || '',
  frontendOrigin: frontendOriginConfig.values[0] || 'http://localhost:5173',
  frontendOrigins: frontendOriginConfig.values,
  allowAllFrontendOrigins: frontendOriginConfig.allowAll,
  graphVersion: process.env.GRAPH_API_VERSION || 'v19.0',
  whatsapp: {
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    token: process.env.WHATSAPP_TOKEN || ''
  },
  facebook: {
    pageAccessToken: process.env.FB_PAGE_ACCESS_TOKEN || ''
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    secretToken: process.env.TELEGRAM_WEBHOOK_SECRET || ''
  },
  obs: {
    endpoint: process.env.OBS_ENDPOINT || '',
    region: process.env.OBS_REGION || '',
    bucket: process.env.OBS_BUCKET || '',
    accessKey: process.env.OBS_ACCESS_KEY || '',
    secretKey: process.env.OBS_SECRET_KEY || ''
  },
  cache: {
    host: process.env.DCS_REDIS_HOST || '',
    port: Number(process.env.DCS_REDIS_PORT) || 6379,
    password: process.env.DCS_REDIS_PASSWORD || '',
    tls: process.env.DCS_REDIS_TLS === 'true'
  },
  ai: {
    endpoint: process.env.AI_ASSIST_ENDPOINT || '',
    version: process.env.AI_ASSIST_VERSION || 'latest',
    token: process.env.AI_ASSIST_TOKEN || '',
    timeoutMs: Number(process.env.AI_ASSIST_TIMEOUT_MS) || 15000
  },
  lts: {
    enabled: process.env.LTS_ENABLED === 'true',
    endpoint: process.env.LTS_ENDPOINT || '',
    projectId: process.env.LTS_PROJECT_ID || '',
    logGroup: process.env.LTS_LOG_GROUP || '',
    logStream: process.env.LTS_LOG_STREAM || '',
    accessKey: process.env.LTS_ACCESS_KEY || '',
    secretKey: process.env.LTS_SECRET_KEY || ''
  },
  loggingDir: path.join(__dirname, '..', '..', 'logs')
};

