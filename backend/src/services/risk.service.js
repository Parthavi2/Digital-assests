const { prisma } = require('../config/db');
const ApiError = require('../utils/ApiError');
const { getPagination, buildPaginationMeta } = require('../utils/pagination');
const { RISK_CATEGORIES } = require('../constants/statuses');
const { calculateHighlightPriority } = require('./highlightPriority.service');
const accountIntelligenceService = require('./accountIntelligence.service');
const fragmentService = require('./fragment.service');
const propagationService = require('./propagation.service');
const mutationService = require('./mutation.service');
const { cacheDelPattern } = require('../config/redis');

const riskMeanings = {
  LOW_RISK: 'fan edit, meme, short transformative content',
  MEDIUM_RISK: 'repeated partial reuse',
  HIGH_RISK: 'copied highlights, monetized misuse, suspicious account',
  CRITICAL_RISK: 'viral spread, fragment stitching, organized misuse'
};

const categorizeRisk = (score) => {
  if (score <= 30) return RISK_CATEGORIES.LOW_RISK;
  if (score <= 60) return RISK_CATEGORIES.MEDIUM_RISK;
  if (score <= 85) return RISK_CATEGORIES.HIGH_RISK;
  return RISK_CATEGORIES.CRITICAL_RISK;
};

const findDetection = async (detectionId) => prisma.detectionResult.findFirst({
  where: { OR: [{ id: detectionId }, { detectionId }] },
  include: {
    crawledMedia: true,
    officialAsset: true
  }
});

const calculateRiskForDetection = async (detectionId, options = {}) => {
  const detection = await findDetection(detectionId);
  if (!detection) throw new ApiError(404, 'Detection result not found');

  const priority = calculateHighlightPriority(detection.officialAsset);
  const accountIntel = await accountIntelligenceService
    .calculateHighlightDensity(detection.crawledMedia.accountId)
    .catch(() => null);

  await fragmentService
    .analyzeFragments({ accountId: detection.crawledMedia.accountId, windowMinutes: 60 })
    .catch(() => null);

  const propagationEvent = await propagationService
    .analyzePropagationForAsset(detection.officialAssetId)
    .catch(() => null);

  await mutationService
    .buildMutationTree(detection.officialAssetId)
    .catch(() => null);

  const fragmentCase = await prisma.fragmentStitchingCase.findFirst({
    where: {
      accountId: detection.crawledMedia.accountId,
      officialAssetId: detection.officialAssetId
    },
    orderBy: { fragmentStitchingScore: 'desc' }
  });

  const latestPropagationEvent = propagationEvent || await prisma.propagationEvent.findFirst({
    where: { officialAssetId: detection.officialAssetId },
    orderBy: { createdAt: 'desc' }
  });

  const mutationAggregate = await prisma.mutationNode.aggregate({
    where: { officialAssetId: detection.officialAssetId },
    _avg: { mutationScore: true }
  });

  const similarityScore = detection.confidenceScore;
  const highlightPriorityScore = priority.highlightPriorityScore;
  const highlightDensityScore = accountIntel?.highlightDensityScore || 0;
  const fragmentStitchingScore = fragmentCase?.fragmentStitchingScore || 0;
  const propagationVelocityScore = latestPropagationEvent?.propagationVelocityScore || 0;
  const mutationScore = Number((mutationAggregate._avg.mutationScore || 0).toFixed(2));
  const accountHistoryScore = accountIntel?.accountHistoryScore || 0;
  const monetizationSignalScore = accountIntel?.monetizationSignalScore || 0;

  const finalScore = Number(Math.min(100, (
    similarityScore * 0.30
    + highlightPriorityScore * 0.15
    + highlightDensityScore * 0.15
    + fragmentStitchingScore * 0.12
    + propagationVelocityScore * 0.12
    + mutationScore * 0.08
    + accountHistoryScore * 0.05
    + monetizationSignalScore * 0.03
  )).toFixed(2));

  const riskCategory = categorizeRisk(finalScore);
  const recommendedAction = riskCategory === RISK_CATEGORIES.CRITICAL_RISK
    ? 'ESCALATE_LEGAL'
    : riskCategory === RISK_CATEGORIES.HIGH_RISK
      ? 'PREPARE_TAKEDOWN'
      : riskCategory === RISK_CATEGORIES.MEDIUM_RISK
        ? 'REQUEST_LICENSE_REVIEW'
        : 'MONITOR';
  const riskReasons = [
    priority.priorityReason,
    accountIntel ? `Account highlight density is ${accountIntel.highlightDensityScore}%.` : 'No account history was available before this detection.',
    fragmentCase ? fragmentCase.stitchingRiskReason : 'No fragment stitching pattern crossed threshold.',
    latestPropagationEvent?.spikeDetected ? latestPropagationEvent.spikeReason : 'Propagation is below spike threshold.'
  ];
  const riskScore = await prisma.riskScore.create({
    data: {
      detectionId: detection.id,
      similarityScore,
      highlightPriorityScore,
      highlightDensityScore,
      fragmentStitchingScore,
      propagationVelocityScore,
      mutationScore,
      accountHistoryScore,
      monetizationSignalScore,
      finalScore,
      finalRiskScore: finalScore,
      riskCategory,
      riskMeaning: riskMeanings[riskCategory],
      riskReasons,
      recommendedAction,
      explainability: {
        formula: {
          similarityScore: '30%',
          highlightPriorityScore: '15%',
          highlightDensityScore: '15%',
          fragmentStitchingScore: '12%',
          propagationVelocityScore: '12%',
          mutationScore: '8%',
          accountHistoryScore: '5%',
          monetizationSignalScore: '3%'
        },
        priority,
        riskReasons,
        recommendedAction,
        accountId: detection.crawledMedia.accountId,
        detectionConfidence: detection.confidenceScore
      }
    },
    include: {
      detection: {
        include: {
          crawledMedia: true,
          officialAsset: true
        }
      }
    }
  });

  if (options.autoGenerateEvidence !== false && [RISK_CATEGORIES.HIGH_RISK, RISK_CATEGORIES.CRITICAL_RISK].includes(riskCategory)) {
    const evidenceService = require('./evidence.service');
    await evidenceService.generateEvidence(detection.id).catch(() => null);
  }

  await cacheDelPattern('dashboard:*').catch(() => null);

  return riskScore;
};

const listRiskResults = async (query) => {
  const { page, limit, skip } = getPagination(query);
  const where = {};
  if (query.riskCategory) where.riskCategory = query.riskCategory;

  const [items, total] = await Promise.all([
    prisma.riskScore.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        detection: {
          include: {
            crawledMedia: true,
            officialAsset: true
          }
        }
      }
    }),
    prisma.riskScore.count({ where })
  ]);

  return { items, meta: buildPaginationMeta(page, limit, total) };
};

const getRiskSummary = async () => {
  const grouped = await prisma.riskScore.groupBy({
    by: ['riskCategory'],
    _count: { riskCategory: true },
    _avg: { finalScore: true }
  });

  return {
    distribution: grouped.map((item) => ({
      riskCategory: item.riskCategory,
      count: item._count.riskCategory,
      averageScore: Number((item._avg.finalScore || 0).toFixed(2))
    })),
    latestCritical: await prisma.riskScore.findMany({
      where: { riskCategory: RISK_CATEGORIES.CRITICAL_RISK },
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        detection: {
          include: { crawledMedia: true, officialAsset: true }
        }
      }
    })
  };
};

module.exports = {
  calculateRiskForDetection,
  listRiskResults,
  getRiskSummary,
  categorizeRisk,
  riskMeanings
};
