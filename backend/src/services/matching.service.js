const { prisma } = require('../config/db');
const { riskQueue, addJob } = require('../config/queue');
const ApiError = require('../utils/ApiError');
const { buildPublicId } = require('../utils/ids');
const { getPagination, buildPaginationMeta } = require('../utils/pagination');
const { scoreBetween } = require('../utils/hash');
const mediaProcessing = require('./mediaProcessing.service');
const propagationService = require('./propagation.service');
const accountIntelligenceService = require('./accountIntelligence.service');

const confidenceFormula = ({ videoSimilarityScore, audioSimilarityScore, frameHashSimilarity, embeddingSimilarity }) => Number((
  (videoSimilarityScore * 0.35)
  + (audioSimilarityScore * 0.30)
  + (frameHashSimilarity * 0.20)
  + (embeddingSimilarity * 0.15)
).toFixed(2));

const captionBoost = (media, asset) => {
  const caption = media.caption.toLowerCase();
  const teams = Array.isArray(asset.teams) ? asset.teams : [];
  const tokens = [asset.matchName, asset.tournament, asset.highlightCategory, ...teams]
    .filter(Boolean)
    .map((item) => String(item).toLowerCase());

  return tokens.some((token) => caption.includes(token.split(' ')[0])) ? 6 : 0;
};

const buildMatchedSegments = (asset, matchedDuration, seed) => {
  const start = scoreBetween(`${seed}:start`, 0, Math.max(1, asset.duration - matchedDuration), 2);
  const end = Number(Math.min(asset.duration, start + matchedDuration).toFixed(2));

  return {
    matchedTimestampRange: { start, end },
    matchedSegments: [
      {
        officialStart: start,
        officialEnd: end,
        detectedStart: scoreBetween(`${seed}:detected-start`, 0, 8, 2),
        detectedEnd: Number((scoreBetween(`${seed}:detected-start`, 0, 8, 2) + matchedDuration).toFixed(2))
      }
    ],
    matchedFrames: Array.from({ length: 6 }, (_, index) => ({
      officialFrameIndex: index * 3,
      detectedFrameIndex: index * 3 + 1,
      similarity: scoreBetween(`${seed}:frame:${index}`, 82, 98, 2)
    }))
  };
};

const scoreCandidate = async (media, asset) => {
  const seed = `${media.id}:${asset.id}`;
  const boost = captionBoost(media, asset);
  const embeddings = await mediaProcessing.analyzeCrawledMediaEmbedding(media);

  const videoSimilarityScore = Math.min(99, scoreBetween(`${seed}:video`, 62, 93, 2) + boost);
  const audioSimilarityScore = Math.min(99, scoreBetween(`${seed}:audio`, 55, 94, 2) + boost * 0.7);
  const frameHashSimilarity = Math.min(99, scoreBetween(`${seed}:frame`, 58, 96, 2) + boost * 0.8);
  const embeddingSimilarity = Math.min(99, scoreBetween(`${seed}:${embeddings.videoEmbedding[0]}:embedding`, 60, 96, 2) + boost * 0.6);
  const confidenceScore = confidenceFormula({
    videoSimilarityScore,
    audioSimilarityScore,
    frameHashSimilarity,
    embeddingSimilarity
  });
  const matchedDuration = Number(scoreBetween(`${seed}:duration`, Math.min(8, asset.duration), Math.min(asset.duration, Math.max(12, asset.duration * 0.68)), 2).toFixed(2));
  const segmentData = buildMatchedSegments(asset, matchedDuration, seed);

  return {
    officialAsset: asset,
    videoSimilarityScore,
    audioSimilarityScore,
    frameHashSimilarity,
    embeddingSimilarity,
    similarityScore: confidenceScore,
    confidenceScore,
    matchedDuration,
    ...segmentData
  };
};

const runMatching = async (crawledMediaId) => {
  const media = await prisma.crawledMedia.findUnique({ where: { id: crawledMediaId } });
  if (!media) {
    throw new ApiError(404, 'Crawled media item not found');
  }

  const assets = await prisma.officialAsset.findMany({
    where: {
      uploadStatus: { not: 'ARCHIVED' },
      fingerprintStatus: 'COMPLETED'
    },
    include: { fingerprint: true }
  });

  if (assets.length === 0) {
    throw new ApiError(409, 'No completed official fingerprints are available for matching');
  }

  const candidates = [];
  for (const asset of assets) {
    candidates.push(await scoreCandidate(media, asset));
  }

  const best = candidates.sort((a, b) => b.confidenceScore - a.confidenceScore)[0];
  const existing = await prisma.detectionResult.findFirst({
    where: {
      crawledMediaId: media.id,
      officialAssetId: best.officialAsset.id
    }
  });

  const data = {
    crawledMediaId: media.id,
    officialAssetId: best.officialAsset.id,
    videoSimilarityScore: best.videoSimilarityScore,
    audioSimilarityScore: best.audioSimilarityScore,
    frameHashSimilarity: best.frameHashSimilarity,
    embeddingSimilarity: best.embeddingSimilarity,
    similarityScore: best.similarityScore,
    confidenceScore: best.confidenceScore,
    matchedDuration: best.matchedDuration,
    matchedTimestampRange: best.matchedTimestampRange,
    matchedFrames: best.matchedFrames,
    matchedSegments: best.matchedSegments,
    detectionStatus: best.confidenceScore >= 65 ? 'MATCHED' : 'CANDIDATE'
  };

  const detection = existing
    ? await prisma.detectionResult.update({
      where: { id: existing.id },
      data,
      include: { crawledMedia: true, officialAsset: true }
    })
    : await prisma.detectionResult.create({
      data: {
        detectionId: buildPublicId('det'),
        ...data
      },
      include: { crawledMedia: true, officialAsset: true }
    });

  await addJob(riskQueue, 'calculate-risk', { detectionId: detection.id });
  await propagationService.recordDetectionPropagation(detection).catch(() => null);
  await accountIntelligenceService.calculateHighlightDensity(media.accountId).catch(() => null);

  return detection;
};

const listMatchingResults = async (query) => {
  const { page, limit, skip } = getPagination(query);
  const where = {};
  if (query.status) where.detectionStatus = query.status;

  const [items, total] = await Promise.all([
    prisma.detectionResult.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        crawledMedia: true,
        officialAsset: true,
        riskScores: { orderBy: { createdAt: 'desc' }, take: 1 }
      }
    }),
    prisma.detectionResult.count({ where })
  ]);

  return { items, meta: buildPaginationMeta(page, limit, total) };
};

const getMatchingResult = async (id) => {
  const item = await prisma.detectionResult.findFirst({
    where: { OR: [{ id }, { detectionId: id }] },
    include: {
      crawledMedia: true,
      officialAsset: true,
      riskScores: { orderBy: { createdAt: 'desc' } },
      evidencePackets: true
    }
  });

  if (!item) {
    throw new ApiError(404, 'Detection result not found');
  }

  return item;
};

module.exports = {
  confidenceFormula,
  runMatching,
  listMatchingResults,
  getMatchingResult
};
