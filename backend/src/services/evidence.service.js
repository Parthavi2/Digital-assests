const { prisma } = require('../config/db');
const ApiError = require('../utils/ApiError');
const { buildPublicId } = require('../utils/ids');
const { getPagination, buildPaginationMeta } = require('../utils/pagination');
const { RISK_CATEGORIES, REVIEW_STATUSES } = require('../constants/statuses');

const recommendedActionForRisk = (riskCategory) => {
  if (riskCategory === RISK_CATEGORIES.CRITICAL_RISK) return 'ESCALATE_LEGAL';
  if (riskCategory === RISK_CATEGORIES.HIGH_RISK) return 'PREPARE_TAKEDOWN';
  if (riskCategory === RISK_CATEGORIES.MEDIUM_RISK) return 'REQUEST_LICENSE_REVIEW';
  return 'MONITOR';
};

const toJson = (value) => JSON.parse(JSON.stringify(value || {}));

const findDetection = async (detectionId) => prisma.detectionResult.findFirst({
  where: { OR: [{ id: detectionId }, { detectionId }] },
  include: {
    crawledMedia: true,
    officialAsset: true,
    riskScores: { orderBy: { createdAt: 'desc' }, take: 1 }
  }
});

const generateEvidence = async (detectionId) => {
  const detection = await findDetection(detectionId);
  if (!detection) throw new ApiError(404, 'Detection result not found');

  const latestRisk = detection.riskScores[0];
  const accountIntel = await prisma.accountIntelligence.findUnique({
    where: { accountId: detection.crawledMedia.accountId }
  });
  const fragmentCase = await prisma.fragmentStitchingCase.findFirst({
    where: {
      accountId: detection.crawledMedia.accountId,
      officialAssetId: detection.officialAssetId
    },
    orderBy: { fragmentStitchingScore: 'desc' }
  });
  const propagationEvent = await prisma.propagationEvent.findFirst({
    where: { officialAssetId: detection.officialAssetId },
    orderBy: { createdAt: 'desc' }
  });
  const mutationLineage = await prisma.mutationNode.findMany({
    where: { officialAssetId: detection.officialAssetId },
    orderBy: { timestamp: 'asc' },
    include: { childVersions: true }
  });

  const riskScore = latestRisk?.finalScore || detection.confidenceScore;
  const riskCategory = latestRisk?.riskCategory || (riskScore >= 61 ? RISK_CATEGORIES.HIGH_RISK : RISK_CATEGORIES.MEDIUM_RISK);
  const recommendedAction = recommendedActionForRisk(riskCategory);
  const reasonForFlagging = [
    `${detection.confidenceScore}% confidence match against official asset ${detection.officialAsset.assetId}`,
    accountIntel ? `${accountIntel.highlightDensityScore}% highlight density on account ${accountIntel.accountHandle}` : null,
    fragmentCase ? `${fragmentCase.fragmentCount} fragment stitching pattern detected` : null,
    propagationEvent?.spikeDetected ? propagationEvent.spikeReason : null
  ].filter(Boolean).join('. ');

  const packetPayload = {
    generatedAt: new Date().toISOString(),
    chainOfCustody: {
      officialAssetId: detection.officialAsset.assetId,
      crawledMediaId: detection.crawledMedia.id,
      detectionId: detection.detectionId
    },
    humanReviewRequired: true,
    note: 'HighlightGuard AI never auto-takes down content. This packet is routed to a human review queue.'
  };

  const existing = await prisma.evidencePacket.findFirst({ where: { detectionId: detection.id } });
  const data = {
    detectionId: detection.id,
    officialAssetId: detection.officialAssetId,
    detectedUrl: detection.crawledMedia.detectedUrl,
    platform: detection.crawledMedia.platform,
    accountName: detection.crawledMedia.accountName,
    matchedFrames: detection.matchedFrames,
    matchedTimestampRange: detection.matchedTimestampRange,
    similarityScore: detection.similarityScore,
    riskScore,
    riskCategory,
    highlightDensityScore: accountIntel?.highlightDensityScore || 0,
    fragmentStitchingScore: fragmentCase?.fragmentStitchingScore || 0,
    propagationSummary: toJson(propagationEvent),
    mutationLineage: toJson(mutationLineage),
    reasonForFlagging,
    recommendedAction,
    reviewStatus: existing?.reviewStatus || REVIEW_STATUSES.PENDING_REVIEW,
    packetPayload
  };

  const evidence = existing
    ? await prisma.evidencePacket.update({
      where: { id: existing.id },
      data,
      include: { detection: true, officialAsset: true, reviewCase: true }
    })
    : await prisma.evidencePacket.create({
      data: {
        evidenceId: buildPublicId('evd'),
        ...data
      },
      include: { detection: true, officialAsset: true, reviewCase: true }
    });

  await prisma.reviewCase.upsert({
    where: { evidencePacketId: evidence.id },
    update: {
      priority: riskCategory,
      status: evidence.reviewStatus
    },
    create: {
      evidencePacketId: evidence.id,
      priority: riskCategory,
      status: REVIEW_STATUSES.PENDING_REVIEW
    }
  });

  return prisma.evidencePacket.findUnique({
    where: { id: evidence.id },
    include: {
      detection: { include: { crawledMedia: true, officialAsset: true } },
      officialAsset: true,
      reviewCase: { include: { assignedTo: true, comments: true } }
    }
  });
};

const listEvidence = async (query) => {
  const { page, limit, skip } = getPagination(query);
  const where = {};
  if (query.riskCategory) where.riskCategory = query.riskCategory;
  if (query.status) where.reviewStatus = query.status;

  const [items, total] = await Promise.all([
    prisma.evidencePacket.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        officialAsset: true,
        reviewCase: { include: { assignedTo: true } }
      }
    }),
    prisma.evidencePacket.count({ where })
  ]);

  return { items, meta: buildPaginationMeta(page, limit, total) };
};

const getEvidence = async (id) => {
  const evidence = await prisma.evidencePacket.findFirst({
    where: { OR: [{ id }, { evidenceId: id }] },
    include: {
      detection: { include: { crawledMedia: true, officialAsset: true, riskScores: true } },
      officialAsset: true,
      reviewCase: { include: { assignedTo: true, comments: { include: { author: true } } } }
    }
  });

  if (!evidence) throw new ApiError(404, 'Evidence packet not found');
  return evidence;
};

const downloadEvidence = async (id) => {
  const evidence = await getEvidence(id);
  return {
    fileName: `${evidence.evidenceId}.json`,
    payload: evidence
  };
};

module.exports = {
  generateEvidence,
  listEvidence,
  getEvidence,
  downloadEvidence
};
