const express = require('express');
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

const app = express();

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
    origin: config.frontendOrigin,
    credentials: true
  })
);
app.use(helmet());
app.use(morgan('combined'));

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
    origin: config.frontendOrigin,
    methods: ['GET', 'POST']
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

app.use((err, _req, res, _next) => {
  logger.log('server_error', { error: err.message });
  res.status(500).json({ error: 'Internal server error' });
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

