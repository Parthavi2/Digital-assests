const { Queue, QueueEvents } = require('bullmq');
const { queueConnection } = require('./redis');

const prefix = process.env.QUEUE_PREFIX || 'highlightguard';

const createQueue = (name) => new Queue(name, {
  connection: queueConnection,
  prefix,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 3000
    },
    removeOnComplete: {
      count: 500
    },
    removeOnFail: {
      count: 500
    }
  }
});

const fingerprintQueue = createQueue('fingerprint-generation');
const crawlQueue = createQueue('platform-crawling');
const matchingQueue = createQueue('similarity-matching');
const riskQueue = createQueue('risk-classification');

const queueEvents = [
  new QueueEvents('fingerprint-generation', { connection: queueConnection, prefix }),
  new QueueEvents('platform-crawling', { connection: queueConnection, prefix }),
  new QueueEvents('similarity-matching', { connection: queueConnection, prefix }),
  new QueueEvents('risk-classification', { connection: queueConnection, prefix })
];

const addJob = (queue, name, data, options = {}) => queue.add(name, data, options);

const getQueueStats = async (queue) => {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount()
  ]);

  return { name: queue.name, waiting, active, completed, failed, delayed };
};

module.exports = {
  fingerprintQueue,
  crawlQueue,
  matchingQueue,
  riskQueue,
  queueEvents,
  addJob,
  getQueueStats
};
