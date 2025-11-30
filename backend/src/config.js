const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const requiredForProd = [
  'DATABASE_URL',
  'WEBHOOK_VERIFY_TOKEN',
  'FB_APP_SECRET',
  'WHATSAPP_PHONE_NUMBER_ID',
  'WHATSAPP_TOKEN',
  'FB_PAGE_ACCESS_TOKEN'
];

const missing = requiredForProd.filter((key) => !process.env[key]);
if (missing.length) {
  console.warn(
    `[config] Missing env vars: ${missing.join(
      ', '
    )}. The server will start, but webhook verification or outbound sending may fail until they are provided.`
  );
}

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 4000,
  databaseUrl: process.env.DATABASE_URL,
  verifyToken: process.env.WEBHOOK_VERIFY_TOKEN || 'dev-verify-token',
  fbAppSecret: process.env.FB_APP_SECRET || '',
  frontendOrigin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173',
  graphVersion: process.env.GRAPH_API_VERSION || 'v19.0',
  whatsapp: {
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    token: process.env.WHATSAPP_TOKEN || ''
  },
  facebook: {
    pageAccessToken: process.env.FB_PAGE_ACCESS_TOKEN || ''
  },
  loggingDir: path.join(__dirname, '..', '..', 'logs')
};

