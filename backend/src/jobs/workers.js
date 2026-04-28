require('dotenv').config();

const { Worker } = require('bullmq');
const { queueConnection } = require('../config/redis');
const {
  fingerprintQueue,
  crawlQueue,
  matchingQueue,
  riskQueue
} = require('../config/queue');
const { connectPostgres, connectMongo, disconnectDatabases } = require('../config/db');
const { connectNeo4j, closeNeo4j } = require('../config/neo4j');
const logger = require('../utils/logger');
const fingerprintService = require('../services/fingerprint.service');
const crawlerService = require('../services/crawler.service');
const matchingService = require('../services/matching.service');
const riskService = require('../services/risk.service');

const prefix = process.env.QUEUE_PREFIX || 'highlightguard';
let workers = [];

const buildWorker = (queue, processor, concurrency = 3) => {
  const worker = new Worker(queue.name, processor, {
    connection: queueConnection,
    prefix,
    concurrency
  });

  worker.on('completed', (job) => logger.info('Job completed: %s:%s', queue.name, job.id));
  worker.on('failed', (job, error) => logger.error('Job failed: %s:%s %s', queue.name, job?.id, error.message));

  return worker;
};

const initWorkers = () => {
  if (workers.length) return workers;

  workers = [
    buildWorker(fingerprintQueue, async (job) => fingerprintService.generateFingerprint(job.data.assetId), 2),
    buildWorker(crawlQueue, async (job) => crawlerService.runMockCrawl(job.data), 1),
    buildWorker(matchingQueue, async (job) => matchingService.runMatching(job.data.crawledMediaId), 4),
    buildWorker(riskQueue, async (job) => riskService.calculateRiskForDetection(job.data.detectionId), 4)
  ];

  logger.info('BullMQ workers initialized');
  return workers;
};

const closeWorkers = async () => {
  await Promise.all(workers.map((worker) => worker.close()));
  workers = [];
};

const runStandalone = async () => {
  await connectPostgres();
  await connectMongo().catch((error) => logger.warn('Mongo startup skipped: %s', error.message));
  connectNeo4j();
  initWorkers();
  logger.info('Worker process is running');
};

if (require.main === module) {
  runStandalone().catch((error) => {
    logger.error(error);
    process.exit(1);
  });

  process.on('SIGTERM', async () => {
    await closeWorkers();
    await closeNeo4j();
    await disconnectDatabases();
    process.exit(0);
  });
}

module.exports = {
  initWorkers,
  closeWorkers
};
