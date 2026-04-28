const { prisma } = require('../config/db');
const { cacheGet, cacheSet } = require('../config/redis');
const { RISK_CATEGORIES, REVIEW_STATUSES } = require('../constants/statuses');
const accountIntelligenceService = require('./accountIntelligence.service');

const cacheWrap = async (key, producer, ttl = 45) => {
  const cached = await cacheGet(key).catch(() => null);
  if (cached) return cached;

  const value = await producer();
  await cacheSet(key, value, ttl).catch(() => null);
  return value;
};

const getDashboardSummary = async () => cacheWrap('dashboard:summary', async () => {
  const [
    totalOfficialAssets,
    totalDetections,
    highRiskAlerts,
    criticalRiskAlerts,
    viralSpikeEvents,
    pendingReviews,
    fragmentStitchingCases,
    mutationTrackingCount
  ] = await Promise.all([
    prisma.officialAsset.count({ where: { uploadStatus: { not: 'ARCHIVED' } } }),
    prisma.detectionResult.count(),
    prisma.riskScore.count({ where: { riskCategory: RISK_CATEGORIES.HIGH_RISK } }),
    prisma.riskScore.count({ where: { riskCategory: RISK_CATEGORIES.CRITICAL_RISK } }),
    prisma.propagationEvent.count({ where: { spikeDetected: true } }),
    prisma.reviewCase.count({ where: { status: REVIEW_STATUSES.PENDING_REVIEW } }),
    prisma.fragmentStitchingCase.count(),
    prisma.mutationNode.count()
  ]);

  const topRiskyAccounts = await accountIntelligenceService.getTopRiskyAccounts({ limit: 5 });

  return {
    totalAssets: totalOfficialAssets,
    totalOfficialAssets,
    totalDetections,
    highRiskAlerts,
    criticalRiskAlerts,
    viralSpikeEvents,
    pendingReviews,
    topRiskyAccounts,
    topAccounts: topRiskyAccounts,
    fragmentStitchingCases,
    mutationTrackingCount
  };
});

const getRiskDistribution = async () => cacheWrap('dashboard:risk-distribution', async () => {
  const grouped = await prisma.riskScore.groupBy({
    by: ['riskCategory'],
    _count: { riskCategory: true }
  });

  const counts = Object.values(RISK_CATEGORIES).reduce((acc, category) => {
    acc[category] = 0;
    return acc;
  }, {});

  grouped.forEach((item) => {
    counts[item.riskCategory] = item._count.riskCategory;
  });

  return Object.entries(counts).map(([riskCategory, count]) => ({ riskCategory, count }));
});

const getPlatformDetections = async () => cacheWrap('dashboard:platform-detections', async () => {
  const detections = await prisma.detectionResult.findMany({
    include: { crawledMedia: true },
    orderBy: { createdAt: 'desc' },
    take: 2000
  });

  const counts = detections.reduce((acc, detection) => {
    const platform = detection.crawledMedia.platform;
    acc[platform] = (acc[platform] || 0) + 1;
    return acc;
  }, {});

  return Object.entries(counts).map(([platform, count]) => ({ platform, count }));
});

const getDetectionTimeline = async () => cacheWrap('dashboard:timeline', async () => {
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const detections = await prisma.detectionResult.findMany({
    where: { createdAt: { gte: since } },
    select: { createdAt: true }
  });

  const buckets = {};
  for (let offset = 13; offset >= 0; offset -= 1) {
    const date = new Date(Date.now() - offset * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    buckets[date] = 0;
  }

  detections.forEach((detection) => {
    const date = detection.createdAt.toISOString().slice(0, 10);
    buckets[date] = (buckets[date] || 0) + 1;
  });

  return Object.entries(buckets).map(([date, count]) => ({ date, count }));
});

const getTopAccounts = async (query) => accountIntelligenceService.getTopRiskyAccounts(query);

module.exports = {
  getDashboardSummary,
  getRiskDistribution,
  getPlatformDetections,
  getDetectionTimeline,
  getTopAccounts
};
