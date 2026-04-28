const { prisma } = require('../config/db');
const ApiError = require('../utils/ApiError');
const { getPagination, buildPaginationMeta } = require('../utils/pagination');

const mergeSegments = (detections) => detections
  .flatMap((detection) => detection.matchedSegments || [])
  .sort((a, b) => a.officialStart - b.officialStart)
  .map((segment) => ({
    start: segment.officialStart,
    end: segment.officialEnd,
    sourceDetectionId: segment.sourceDetectionId
  }));

const analyzeFragments = async ({ accountId, windowMinutes = 30 } = {}) => {
  if (accountId) {
    await prisma.fragmentStitchingCase.deleteMany({ where: { accountId } });
  }

  const detections = await prisma.detectionResult.findMany({
    where: accountId ? { crawledMedia: { accountId } } : {},
    include: {
      crawledMedia: true,
      officialAsset: true
    },
    orderBy: { createdAt: 'asc' }
  });

  const grouped = new Map();
  for (const detection of detections) {
    if (detection.matchedDuration > Math.min(60, detection.officialAsset.duration * 0.45)) {
      continue;
    }

    const key = [
      detection.crawledMedia.accountId,
      detection.officialAsset.matchName,
      detection.officialAsset.assetFamily || detection.officialAsset.assetId
    ].join('::');

    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(detection);
  }

  const cases = [];
  for (const group of grouped.values()) {
    if (group.length < 3) continue;

    const first = group[0].crawledMedia.uploadTimestamp;
    const last = group[group.length - 1].crawledMedia.uploadTimestamp;
    const window = (last.getTime() - first.getTime()) / (60 * 1000);
    if (window > windowMinutes) continue;

    const officialAsset = group[0].officialAsset;
    const reconstructedTimeline = mergeSegments(group);
    const matchedSeconds = group.reduce((sum, detection) => sum + detection.matchedDuration, 0);
    const reconstructedHighlightPercentage = Number(Math.min(100, (matchedSeconds / officialAsset.duration) * 100).toFixed(2));
    const fragmentStitchingScore = Number(Math.min(100, group.length * 11 + reconstructedHighlightPercentage * 0.72).toFixed(2));
    const stitchingRiskReason = `This account uploaded ${group.length} fragments from ${officialAsset.matchName} within ${Math.round(window)} minutes, reconstructing ${reconstructedHighlightPercentage}% of the official highlight package.`;

    cases.push(await prisma.fragmentStitchingCase.create({
      data: {
        accountId: group[0].crawledMedia.accountId,
        officialAssetId: officialAsset.id,
        matchName: officialAsset.matchName,
        assetFamily: officialAsset.assetFamily,
        fragmentCount: group.length,
        reconstructedTimeline,
        reconstructedHighlightPercentage,
        fragmentStitchingScore,
        stitchingRiskReason,
        firstFragmentAt: first,
        lastFragmentAt: last
      },
      include: { officialAsset: true }
    }));
  }

  return {
    analyzedDetections: detections.length,
    casesCreated: cases.length,
    cases
  };
};

const listFragmentCases = async (query) => {
  const { page, limit, skip } = getPagination(query);
  const [items, total] = await Promise.all([
    prisma.fragmentStitchingCase.findMany({
      skip,
      take: limit,
      orderBy: { fragmentStitchingScore: 'desc' },
      include: { officialAsset: true }
    }),
    prisma.fragmentStitchingCase.count()
  ]);

  return { items, meta: buildPaginationMeta(page, limit, total) };
};

const getFragmentsByAccount = async (accountId) => {
  const cases = await prisma.fragmentStitchingCase.findMany({
    where: { accountId },
    orderBy: { fragmentStitchingScore: 'desc' },
    include: { officialAsset: true }
  });

  if (cases.length === 0) {
    throw new ApiError(404, 'No fragment stitching cases found for this account');
  }

  return cases;
};

module.exports = {
  analyzeFragments,
  listFragmentCases,
  getFragmentsByAccount
};
