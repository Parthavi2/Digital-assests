const Redis = require('ioredis');
const logger = require('../utils/logger');

const redisConfig = process.env.REDIS_URL
  ? process.env.REDIS_URL
  : {
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASSWORD || undefined
  };

const redisOptions = { maxRetriesPerRequest: null };
const createRedis = () => (
  typeof redisConfig === 'string'
    ? new Redis(redisConfig, redisOptions)
    : new Redis({ ...redisConfig, ...redisOptions })
);

const redis = createRedis();
const queueConnection = createRedis();

redis.on('connect', () => logger.info('Redis connected'));
redis.on('error', (error) => logger.warn('Redis connection issue: %s', error.message));
queueConnection.on('error', (error) => logger.warn('Redis queue connection issue: %s', error.message));

const cacheGet = async (key) => {
  const value = await redis.get(key);
  return value ? JSON.parse(value) : null;
};

const cacheSet = async (key, value, ttlSeconds = Number(process.env.DASHBOARD_CACHE_TTL_SECONDS || 45)) => {
  await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
};

const cacheDelPattern = async (pattern) => {
  const stream = redis.scanStream({ match: pattern, count: 100 });
  const pipeline = redis.pipeline();

  return new Promise((resolve, reject) => {
    stream.on('data', (keys) => {
      keys.forEach((key) => pipeline.del(key));
    });
    stream.on('end', async () => {
      await pipeline.exec();
      resolve();
    });
    stream.on('error', reject);
  });
};

module.exports = {
  redis,
  queueConnection,
  cacheGet,
  cacheSet,
  cacheDelPattern
};
