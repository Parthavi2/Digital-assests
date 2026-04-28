const { prisma } = require('../config/db');
const ApiError = require('../utils/ApiError');
const { getPagination, buildPaginationMeta } = require('../utils/pagination');
const { RISK_CATEGORIES } = require('../constants/statuses');

const getLatestRiskCategory = (detection) => detection.riskScores?.[0]?.riskCategory || null;

const resolveAccountRiskLevel = (densityScore, highRiskDetectionCount, copiedContentCount) => {
  if (densityScore >= 75 || highRiskDetectionCount >= 5) return RISK_CATEGORIES.CRITICAL_RISK;
  if (densityScore >= 55 || highRiskDetectionCount >= 2) return RISK_CATEGORIES.HIGH_RISK;
  if (densityScore >= 30 || copiedContentCount >= 3) return RISK_CATEGORIES.MEDIUM_RISK;
  return RISK_CATEGORIES.LOW_RISK;
};

const calculateHighlightDensity = async (accountId) => {
  const mediaItems = await prisma.crawledMedia.findMany({
    where: { accountId },
    include: {
      detections: {
        include: {
          officialAsset: true,
          riskScores: {
            orderBy: { createdAt: 'desc' },
            take: 1
          }
        }
      }
    },
    orderBy: { uploadTimestamp: 'asc' }
  });

  if (mediaItems.length === 0) {
    throw new ApiError(404, 'Account intelligence not found');
  }

  const detections = mediaItems.flatMap((item) => item.detections);
  const totalPostsScanned = mediaItems.length;
  const highlightPosts = mediaItems.filter((item) => item.detections.length > 0).length;
  const copiedContentCount = detections.length;
  const highlightDensityScore = Number(((highlightPosts / totalPostsScanned) * 100).toFixed(2));

  const matchCounts = detections.reduce((acc, detection) => {
    const matchName = detection.officialAsset.matchName;
    acc[matchName] = (acc[matchName] || 0) + 1;
    return acc;
  }, {});
  const mostRepeatedMatchCount = Math.max(0, ...Object.values(matchCounts));
  const repeatedMatchContentPercentage = copiedContentCount === 0
    ? 0
    : Number(((mostRepeatedMatchCount / copiedContentCount) * 100).toFixed(2));

  const firstPost = mediaItems[0].uploadTimestamp;
  const lastPost = mediaItems[mediaItems.length - 1].uploadTimestamp;
  const activeDays = Math.max(1, (lastPost.getTime() - firstPost.getTime()) / (24 * 60 * 60 * 1000));
  const postingFrequency = Number((totalPostsScanned / activeDays).toFixed(2));

  const highRiskDetectionCount = detections.filter((detection) => {
    const riskCategory = getLatestRiskCategory(detection);
    return [RISK_CATEGORIES.HIGH_RISK, RISK_CATEGORIES.CRITICAL_RISK].includes(riskCategory);
  }).length;

  const accountHistoryScore = Number(Math.min(100, (
    highlightDensityScore * 0.45
    + repeatedMatchContentPercentage * 0.25
    + Math.min(100, postingFrequency * 8) * 0.15
    + Math.min(100, copiedContentCount * 8) * 0.15
  )).toFixed(2));

  const monetizationSignalScore = Number(Math.min(100, (
    mediaItems.reduce((sum, item) => sum + item.views + item.likes + item.shares, 0) / Math.max(1, mediaItems.length) / 2500
  )).toFixed(2));

  const accountRiskLevel = resolveAccountRiskLevel(highlightDensityScore, highRiskDetectionCount, copiedContentCount);
  const firstMedia = mediaItems[0];

  const intelligence = await prisma.accountIntelligence.upsert({
    where: { accountId },
    update: {
      platform: firstMedia.platform,
      accountName: firstMedia.accountName,
      accountHandle: firstMedia.accountHandle,
      totalPostsScanned,
      highlightPosts,
      copiedContentCount,
      repeatedMatchContentPercentage,
      postingFrequency,
      highRiskDetectionCount,
      highlightDensityScore,
      accountHistoryScore,
      monetizationSignalScore,
      accountRiskLevel,
      signals: {
        mostRepeatedMatchCount,
        matchCounts,
        sampledUrls: mediaItems.slice(0, 5).map((item) => item.detectedUrl)
      },
      lastCalculatedAt: new Date()
    },
    create: {
      accountId,
      platform: firstMedia.platform,
      accountName: firstMedia.accountName,
      accountHandle: firstMedia.accountHandle,
      totalPostsScanned,
      highlightPosts,
      copiedContentCount,
      repeatedMatchContentPercentage,
      postingFrequency,
      highRiskDetectionCount,
      highlightDensityScore,
      accountHistoryScore,
      monetizationSignalScore,
      accountRiskLevel,
      signals: {
        mostRepeatedMatchCount,
        matchCounts,
        sampledUrls: mediaItems.slice(0, 5).map((item) => item.detectedUrl)
      }
    }
  });

  return intelligence;
};

const listAccountIntelligence = async (query) => {
  const { page, limit, skip } = getPagination(query);
  const where = {};
  if (query.platform) where.platform = query.platform;
  if (query.riskCategory) where.accountRiskLevel = query.riskCategory;

  const [items, total] = await Promise.all([
    prisma.accountIntelligence.findMany({
      where,
      skip,
      take: limit,
      orderBy: [
        { highlightDensityScore: 'desc' },
        { copiedContentCount: 'desc' }
      ]
    }),
    prisma.accountIntelligence.count({ where })
  ]);

  return { items, meta: buildPaginationMeta(page, limit, total) };
};

const getTopRiskyAccounts = async (query) => {
  const limit = Math.min(Number(query.limit || 10), 25);
  return prisma.accountIntelligence.findMany({
    take: limit,
    orderBy: [
      { accountRiskLevel: 'desc' },
      { highlightDensityScore: 'desc' },
      { highRiskDetectionCount: 'desc' }
    ]
  });
};

module.exports = {
  calculateHighlightDensity,
  listAccountIntelligence,
  getTopRiskyAccounts
};
