const neo4j = require('neo4j-driver');
const logger = require('../utils/logger');

let driver;

const connectNeo4j = () => {
  if (!process.env.NEO4J_URI) {
    logger.warn('NEO4J_URI is not configured; graph persistence disabled');
    return null;
  }

  driver = neo4j.driver(
    process.env.NEO4J_URI,
    neo4j.auth.basic(process.env.NEO4J_USERNAME || 'neo4j', process.env.NEO4J_PASSWORD || 'highlightguard')
  );

  logger.info('Neo4j placeholder driver configured');
  return driver;
};

const writeMutationGraph = async (nodes) => {
  if (!driver || nodes.length === 0) {
    return { persisted: false, nodes: nodes.length };
  }

  const session = driver.session();
  try {
    for (const node of nodes) {
      await session.run(
        `MERGE (m:Mutation {mutationId: $mutationId})
         SET m.officialAssetId = $officialAssetId,
             m.platform = $platform,
             m.accountName = $accountName,
             m.transformationType = $transformationType,
             m.similarityScore = $similarityScore,
             m.timestamp = $timestamp
         WITH m
         OPTIONAL MATCH (p:Mutation {mutationId: $parentMutationId})
         FOREACH (_ IN CASE WHEN p IS NULL THEN [] ELSE [1] END |
           MERGE (p)-[:MUTATED_INTO]->(m)
         )`,
        {
          mutationId: node.mutationId,
          parentMutationId: node.parentMutationId || null,
          officialAssetId: node.officialAssetId,
          platform: node.platform,
          accountName: node.accountName,
          transformationType: node.transformationType,
          similarityScore: node.similarityScore,
          timestamp: node.timestamp.toISOString()
        }
      );
    }

    return { persisted: true, nodes: nodes.length };
  } catch (error) {
    logger.warn('Neo4j placeholder write failed: %s', error.message);
    return { persisted: false, nodes: nodes.length, error: error.message };
  } finally {
    await session.close();
  }
};

const closeNeo4j = async () => {
  if (driver) {
    await driver.close();
  }
};

module.exports = {
  connectNeo4j,
  writeMutationGraph,
  closeNeo4j
};
