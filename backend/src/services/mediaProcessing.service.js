const { scoreBetween, hashString } = require('../utils/hash');

const buildEmbedding = (seed, dimensions = 48) => Array.from({ length: dimensions }, (_, index) => {
  const value = scoreBetween(`${seed}:dim:${index}`, -1, 1, 6);
  return Number(value);
});

const extractKeyframes = async (asset) => {
  const frameCount = Math.max(8, Math.min(32, Math.ceil(asset.duration / 6)));

  return Array.from({ length: frameCount }, (_, index) => ({
    index,
    timestamp: Number(((asset.duration / frameCount) * index).toFixed(2)),
    extractor: 'ffmpeg-placeholder',
    path: `generated/keyframes/${asset.assetId}/frame_${String(index).padStart(4, '0')}.jpg`
  }));
};

const generatePerceptualHashes = async (asset, keyframes) => keyframes.map((frame) => ({
  frameIndex: frame.index,
  timestamp: frame.timestamp,
  pHash: hashString(`${asset.assetId}:frame:${frame.index}`).slice(0, 16),
  dHash: hashString(`${asset.mediaUrl}:dhash:${frame.index}`).slice(0, 16)
}));

const extractAudioFingerprint = async (asset) => `audfp_${hashString(`${asset.assetId}:${asset.duration}:audio`).slice(0, 32)}`;

const generateVideoEmbedding = async (asset) => buildEmbedding(`${asset.assetId}:video`);

const generateAudioEmbedding = async (asset) => buildEmbedding(`${asset.assetId}:audio`);

const analyzeCrawledMediaEmbedding = async (media) => ({
  videoEmbedding: buildEmbedding(`${media.id}:${media.mediaUrl}:video`),
  audioEmbedding: buildEmbedding(`${media.id}:${media.mediaUrl}:audio`)
});

module.exports = {
  extractKeyframes,
  generatePerceptualHashes,
  extractAudioFingerprint,
  generateVideoEmbedding,
  generateAudioEmbedding,
  analyzeCrawledMediaEmbedding
};
