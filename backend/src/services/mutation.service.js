const { prisma } = require('../config/db');
const { writeMutationGraph } = require('../config/neo4j');
const ApiError = require('../utils/ApiError');
const { buildPublicId } = require('../utils/ids');
const { getPagination, buildPaginationMeta } = require('../utils/pagination');
const { scoreBetween } = require('../utils/hash');

const findAsset = async (assetId) => prisma.officialAsset.findFirst({
  where: { OR: [{ id: assetId }, { assetId }] }
});

const inferTransformation = (media, index) => {
  const caption = media.caption.toLowerCase();
  if (caption.includes('meme')) return 'MEME_EDIT';
  if (caption.includes('compilation')) return 'COMPILATION';
  if (caption.includes('music')) return 'MUSIC_OVERLAY_REPOST';
  if (index % 4 === 0) return 'CROPPED_VERSION';
  if (index % 4 === 1) return 'SPEED_ADJUSTED';
  if (index % 4 === 2) return 'WATERMARKED_REPOST';
  return 'COMPILATION';
};

const readMutationsByAsset = async (asset) => {
  const nodes = await prisma.mutationNode.findMany({
    where: { officialAssetId: asset.id },
    orderBy: { timestamp: 'asc' },
    include: { childVersions: true }
  });

  return {
    asset,
    nodes
  };
};

const buildMutationTree = async (assetId) => {
  const asset = await findAsset(assetId);
  if (!asset) throw new ApiError(404, 'Official asset not found');

  await prisma.mutationNode.deleteMany({ where: { officialAssetId: asset.id } });

  const root = await prisma.mutationNode.create({
    data: {
      mutationId: buildPublicId('mut'),
      officialAssetId: asset.id,
      platform: 'WEBSITE',
      accountName: asset.rightsOwner,
      transformationType: 'ORIGINAL_HIGHLIGHT',
      similarityScore: 100,
      mutationScore: 0,
      timestamp: asset.createdAt,
      metadata: {
        mediaUrl: asset.mediaUrl,
        title: asset.title
      }
    }
  });

  const detections = await prisma.detectionResult.findMany({
    where: { officialAssetId: asset.id },
    include: { crawledMedia: true },
    orderBy: { createdAt: 'asc' }
  });

  let parent = root;
  const nodes = [root];

  for (let index = 0; index < detections.length; index += 1) {
    const detection = detections[index];
    const transformationType = inferTransformation(detection.crawledMedia, index);
    const mutationScore = Number(Math.min(100, (100 - detection.confidenceScore) + scoreBetween(`${detection.id}:mut`, 10, 45, 2)).toFixed(2));

    const node = await prisma.mutationNode.create({
      data: {
        mutationId: buildPublicId('mut'),
        parentNodeId: parent.id,
        officialAssetId: asset.id,
        platform: detection.crawledMedia.platform,
        accountName: detection.crawledMedia.accountName,
        transformationType,
        similarityScore: detection.confidenceScore,
        mutationScore,
        timestamp: detection.crawledMedia.uploadTimestamp,
        metadata: {
          detectedUrl: detection.crawledMedia.detectedUrl,
          caption: detection.crawledMedia.caption,
          detectionId: detection.detectionId
        }
      }
    });

    nodes.push(node);
    if (index % 2 === 0) {
      parent = node;
    }
  }

  await writeMutationGraph(nodes.map((node) => {
    const parentNode = nodes.find((candidate) => candidate.id === node.parentNodeId);
    return {
      mutationId: node.mutationId,
      parentMutationId: parentNode?.mutationId || null,
      officialAssetId: node.officialAssetId,
      platform: node.platform,
      accountName: node.accountName,
      transformationType: node.transformationType,
      similarityScore: node.similarityScore,
      timestamp: node.timestamp
    };
  }));

  return readMutationsByAsset(asset);
};

const listMutations = async (query) => {
  const { page, limit, skip } = getPagination(query);

  const assetsWithDetections = await prisma.officialAsset.findMany({
    where: { detections: { some: {} } },
    select: { id: true }
  });

  for (const asset of assetsWithDetections) {
    const existingNodes = await prisma.mutationNode.count({ where: { officialAssetId: asset.id } });
    if (!existingNodes) {
      await buildMutationTree(asset.id);
    }
  }

  const [items, total] = await Promise.all([
    prisma.mutationNode.findMany({
      skip,
      take: limit,
      where: { parentNodeId: null },
      orderBy: { createdAt: 'desc' },
      include: {
        officialAsset: true,
        childVersions: true
      }
    }),
    prisma.mutationNode.count({ where: { parentNodeId: null } })
  ]);

  return { items, meta: buildPaginationMeta(page, limit, total) };
};

const getMutationsByAsset = async (assetId) => {
  const asset = await findAsset(assetId);
  if (!asset) throw new ApiError(404, 'Official asset not found');

  const existingNodes = await prisma.mutationNode.count({ where: { officialAssetId: asset.id } });
  if (!existingNodes) {
    return buildMutationTree(asset.id);
  }

  return readMutationsByAsset(asset);
};

module.exports = {
  buildMutationTree,
  listMutations,
  getMutationsByAsset
};
