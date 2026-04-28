require('dotenv').config();

const app = require('./app');
const logger = require('./utils/logger');
const {
  connectPostgres,
  connectMongo,
  disconnectDatabases
} = require('./config/db');
const { connectNeo4j, closeNeo4j } = require('./config/neo4j');
const { initWorkers, closeWorkers } = require('./jobs/workers');

const port = Number(process.env.PORT || 5000);

const start = async () => {
  await connectPostgres();
  await connectMongo().catch((error) => logger.warn('Mongo startup skipped: %s', error.message));
  connectNeo4j();

  if (process.env.DISABLE_WORKERS !== 'true') {
    initWorkers();
  }

  const server = app.listen(port, () => {
    logger.info('HighlightGuard AI backend listening on port %s', port);
  });

  const shutdown = async () => {
    logger.info('Shutting down HighlightGuard AI backend');
    server.close(async () => {
      await closeWorkers();
      await closeNeo4j();
      await disconnectDatabases();
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
};

start().catch((error) => {
  logger.error(error);
  process.exit(1);
});
