const logger = require('../utils/logger');

const vectorStore = new Map();

const dot = (a, b) => a.reduce((sum, value, index) => sum + (value * (b[index] || 0)), 0);
const magnitude = (vector) => Math.sqrt(vector.reduce((sum, value) => sum + (value * value), 0)) || 1;

const cosineSimilarity = (a, b) => dot(a, b) / (magnitude(a) * magnitude(b));

const upsertAssetVectors = async (assetId, vectors) => {
  const ids = {
    videoVectorId: `faiss_video_${assetId}`,
    audioVectorId: `faiss_audio_${assetId}`
  };

  vectorStore.set(ids.videoVectorId, { assetId, type: 'video', vector: vectors.videoEmbedding });
  vectorStore.set(ids.audioVectorId, { assetId, type: 'audio', vector: vectors.audioEmbedding });

  logger.info('Vector placeholder upserted vectors for asset %s', assetId);
  return ids;
};

const searchSimilarVectors = async (queryVector, options = {}) => {
  const topK = options.topK || 5;
  const type = options.type;

  return [...vectorStore.entries()]
    .filter(([, value]) => !type || value.type === type)
    .map(([vectorId, value]) => ({
      vectorId,
      assetId: value.assetId,
      type: value.type,
      score: Number(cosineSimilarity(queryVector, value.vector).toFixed(4))
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
};

module.exports = {
  upsertAssetVectors,
  searchSimilarVectors
};
