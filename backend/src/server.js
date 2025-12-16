const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const webhookRouter = require('./routes/webhook');
const apiRouter = require('./routes/api');
const config = require('./config');
const logger = require('./logger');
const { getRecentLogs } = logger;
const { prisma } = require('./db/client');

const allowAllOrigins = config.allowAllFrontendOrigins;
const allowedOrigins = config.frontendOrigins;

const isOriginAllowed = (origin = '') => {
  if (allowAllOrigins || !origin) return true;
  const normalized = origin.replace(/\/$/, '');
  return allowedOrigins.includes(normalized);
};

const app = express();
app.set('trust proxy', 1);

const rawBodySaver = (req, _res, buf) => {
  req.rawBody = Buffer.from(buf);
};

app.use(
  express.json({
    limit: '5mb',
    verify: rawBodySaver
  })
);
app.use(
  express.urlencoded({
    extended: true,
    limit: '5mb',
    verify: rawBodySaver
  })
);

app.use(
  cors({
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        return callback(null, true);
      }
      logger.log('cors_blocked', { origin });
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true
  })
);

// **Relax helmet so HTTP/mixed content works during setup**
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    hsts: false
  })
);

app.use(morgan('combined'));

// serve built frontend
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many webhook events received. Please retry shortly.'
});

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/webhook', webhookLimiter, webhookRouter);
app.use('/api', apiRouter);
app.get('/admin/logs', (req, res) => {
  const limit = Number(req.query.limit) || 50;
  res.json({ entries: getRecentLogs(limit) });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: allowAllOrigins ? true : allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

app.set('io', io);

io.on('connection', (socket) => {
  logger.log('socket_connected', {
    id: socket.id,
    origin: socket.handshake.headers.origin
  });

  socket.on('disconnect', () => {
    logger.log('socket_disconnected', { id: socket.id });
  });
});

app.use((err, req, res, _next) => {
  const requestId = `err-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;

  logger.log('server_error', {
    request_id: requestId,
    method: req.method,
    path: req.originalUrl,
    error: err.message,
    stack: err.stack
  });

  const safeMessage =
    config.env && String(config.env).toLowerCase() === 'production'
      ? undefined
      : err.message;

  res.status(500).json({
    error: 'Internal server error',
    request_id: requestId,
    ...(safeMessage ? { message: safeMessage } : {})
  });
});

const start = () => {
  server.listen(config.port, () => {
    logger.log('server_started', { port: config.port, env: config.env });
  });
};

start();

const gracefulShutdown = async () => {
  logger.log('server_stopping');
  await prisma.$disconnect();
  server.close(() => process.exit(0));
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);