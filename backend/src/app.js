require('dotenv').config();

const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');
const morgan = require('morgan');
const routes = require('./routes');
const requestContext = require('./middleware/requestContext');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { prisma, getMongoDb } = require('./config/db');
const { redis } = require('./config/redis');
const {
  fingerprintQueue,
  crawlQueue,
  matchingQueue,
  riskQueue,
  getQueueStats
} = require('./config/queue');
const { uploadDir } = require('./config/storage');
const logger = require('./utils/logger');

const app = express();

const corsOrigins = (process.env.FRONTEND_ORIGIN || 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim());

app.use(requestContext);
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || corsOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('CORS origin not allowed'));
  },
  credentials: true
}));
app.use(rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  max: Number(process.env.RATE_LIMIT_MAX || 300),
  standardHeaders: true,
  legacyHeaders: false
}));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(mongoSanitize());
app.use(hpp());
app.use('/uploads', express.static(uploadDir));
app.use(morgan('combined', {
  stream: {
    write: (message) => logger.info(message.trim())
  }
}));

const healthHandler = async (_req, res) => {
  const checks = {};

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.postgres = 'ok';
  } catch (error) {
    checks.postgres = `error: ${error.message}`;
  }

  try {
    checks.redis = await redis.ping();
  } catch (error) {
    checks.redis = `error: ${error.message}`;
  }

  try {
    const mongo = getMongoDb();
    checks.mongo = mongo ? (await mongo.admin().ping(), 'ok') : 'not_connected';
  } catch (error) {
    checks.mongo = `error: ${error.message}`;
  }

  try {
    const queueStats = await Promise.all([
      getQueueStats(fingerprintQueue),
      getQueueStats(crawlQueue),
      getQueueStats(matchingQueue),
      getQueueStats(riskQueue)
    ]);
    checks.queues = queueStats;
  } catch (error) {
    checks.queues = `error: ${error.message}`;
  }

  res.json({
    success: true,
    service: 'highlightguard-ai-backend',
    timestamp: new Date().toISOString(),
    checks
  });
};

app.get('/health', healthHandler);
app.get('/api/health', healthHandler);

app.use('/api', routes);
app.use(notFound);
app.use(errorHandler);

module.exports = app;
