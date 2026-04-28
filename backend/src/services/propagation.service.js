const { prisma } = require('../config/db');
const { redis } = require('../config/redis');
const ApiError = require('../utils/ApiError');
const { getPagination, buildPaginationMeta } = require('../utils/pagination');

const findAsset = async (assetId) => prisma.officialAsset.findFirst({
  where: { OR: [{ id: assetId }, { assetId }] }
});

const recordDetectionPropagation = async (detection) => {
  const media = detection.crawledMedia;
  if (!media) return null;

  const key = `propagation:asset:${detection.officialAssetId}`;
  await redis.hincrby(key, 'repostCount', 1);
  await redis.hincrby(key, 'views', media.views || 0);
  await redis.sadd(`${key}:platforms`, media.platform);
  await redis.sadd(`${key}:accounts`, media.accountId);
  await redis.expire(key, 7 * 24 * 60 * 60);

  return { recorded: true };
};

const analyzePropagationForAsset = async (assetId) => {
  const asset = await findAsset(assetId);
  if (!asset) throw new ApiError(404, 'Official asset not found');

  const detections = await prisma.detectionResult.findMany({
    where: { officialAssetId: asset.id },
    include: { crawledMedia: true },
    orderBy: { createdAt: 'asc' }
  });

  if (detections.length === 0) {
    return {
      assetId: asset.assetId,
      repostCount: 0,
      spikeDetected: false,
      spikeReason: 'No unauthorized detections have been recorded for this asset yet.'
    };
  }

  const firstDetected = detections[0].crawledMedia.uploadTimestamp;
  const platforms = new Set(detections.map((detection) => detection.crawledMedia.platform));
  const relatedAccounts = [...new Set(detections.map((detection) => detection.crawledMedia.accountId))];
  const totalViews = detections.reduce((sum, detection) => sum + detection.crawledMedia.views, 0);
  const elapsedHours = Math.max(1, (Date.now() - firstDetected.getTime()) / (60 * 60 * 1000));
  const viewVelocity = Number((totalViews / elapsedHours).toFixed(2));
  const repostCount = detections.length;
  const crossPlatformAppearances = platforms.size;
  const timeToSpikeMinutes = Math.round(Math.max(1, (detections[detections.length - 1].createdAt.getTime() - firstDetected.getTime()) / (60 * 1000)));
  const propagationVelocityScore = Number(Math.min(100, repostCount * 7 + crossPlatformAppearances * 11 + viewVelocity / 4000).toFixed(2));
  const viralRiskScore = Number(Math.min(100, propagationVelocityScore * 0.72 + Math.min(100, totalViews / 12000) * 0.28).toFixed(2));
  const spikeDetected = viralRiskScore >= 70 || (repostCount >= 5 && crossPlatformAppearances >= 3);
  const spikeReason = spikeDetected
    ? `${repostCount} reposts across ${crossPlatformAppearances} platforms reached ${Math.round(viewVelocity)} views/hour.`
    : 'Propagation is being monitored but has not crossed spike thresholds.';

  return prisma.propagationEvent.create({
    data: {
      officialAssetId: asset.id,
      repostCount,
      viewVelocity,
      crossPlatformAppearances,
      firstDetectedUnauthorizedUpload: firstDetected,
      relatedAccounts,
      timeToSpikeMinutes,
      propagationVelocityScore,
      viralRiskScore,
      spikeDetected,
      spikeReason
    }
  });
};

const listPropagationEvents = async (query) => {
  const { page, limit, skip } = getPagination(query);
  const [items, total] = await Promise.all([
    prisma.propagationEvent.findMany({
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { officialAsset: true }
    }),
    prisma.propagationEvent.count()
  ]);

  return { items, meta: buildPaginationMeta(page, limit, total) };
};

const getPropagationByAsset = async (assetId) => {
  const asset = await findAsset(assetId);
  if (!asset) throw new ApiError(404, 'Official asset not found');

  const latest = await prisma.propagationEvent.findFirst({
    where: { officialAssetId: asset.id },
    orderBy: { createdAt: 'desc' },
    include: { officialAsset: true }
  });

  return latest || analyzePropagationForAsset(asset.id);
};

const getSpikeEvents = async (query) => {
  const { page, limit, skip } = getPagination(query);
  const where = { spikeDetected: true };

  const [items, total] = await Promise.all([
    prisma.propagationEvent.findMany({
      where,
      skip,
      take: limit,
      orderBy: { viralRiskScore: 'desc' },
      include: { officialAsset: true }
    }),
    prisma.propagationEvent.count({ where })
  ]);

  return { items, meta: buildPaginationMeta(page, limit, total) };
};

module.exports = {
  recordDetectionPropagation,
  analyzePropagationForAsset,
  listPropagationEvents,
  getPropagationByAsset,
  getSpikeEvents
};
