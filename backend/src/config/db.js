const { PrismaClient } = require('@prisma/client');
const { MongoClient } = require('mongodb');
const logger = require('../utils/logger');

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error']
});

let mongoClient;
let mongoDb;

const connectPostgres = async () => {
  await prisma.$connect();
  logger.info('PostgreSQL connected');
};

const connectMongo = async () => {
  if (!process.env.MONGODB_URI) {
    logger.warn('MONGODB_URI is not configured; raw crawl storage disabled');
    return null;
  }

  mongoClient = new MongoClient(process.env.MONGODB_URI);
  await mongoClient.connect();
  mongoDb = mongoClient.db(process.env.MONGODB_DB || 'highlightguard_ai');

  await mongoDb.collection('raw_crawl_items').createIndex({ crawledMediaId: 1 });
  await mongoDb.collection('media_intelligence_events').createIndex({ createdAt: -1 });

  logger.info('MongoDB connected');
  return mongoDb;
};

const getMongoDb = () => mongoDb;

const disconnectDatabases = async () => {
  await prisma.$disconnect();
  if (mongoClient) {
    await mongoClient.close();
  }
};

module.exports = {
  prisma,
  connectPostgres,
  connectMongo,
  getMongoDb,
  disconnectDatabases
};
