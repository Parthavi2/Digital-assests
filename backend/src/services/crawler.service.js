const { getMongoDb, prisma } = require('../config/db');
const {
  crawlQueue,
  matchingQueue,
  addJob,
  getQueueStats
} = require('../config/queue');
const { PLATFORMS } = require('../constants/platforms');
const { getPagination, buildPaginationMeta } = require('../utils/pagination');
const { buildPublicId } = require('../utils/ids');
const { scoreBetween } = require('../utils/hash');
const { recordAudit } = require('./audit.service');
const accountIntelligenceService = require('./accountIntelligence.service');
const { cacheDelPattern } = require('../config/redis');

const accountPools = {
  YOUTUBE: [
    ['ClipRush Sports', '@cliprushsports'],
    ['GoalStorm Daily', '@goalstormdaily'],
    ['Boundary Bites', '@boundarybites']
  ],
  INSTAGRAM: [
    ['Reel Matchday', '@reelmatchday'],
    ['Viral Sixes', '@viralsixes'],
    ['Fan Cut Arena', '@fancutarena']
  ],
  X_TWITTER: [
    ['LiveSportLeaks', '@livesportleaks'],
    ['MatchPulse', '@matchpulse'],
    ['CricketNow Clips', '@cricketnowclips']
  ],
  FACEBOOK: [
    ['Sports Highlights Hub', '@sportshighlightshub'],
    ['Goal Replay Room', '@goalreplayroom']
  ],
  TELEGRAM: [
    ['Public Match Clips', '@publicmatchclips'],
    ['Sports Leak Channel', '@sportsleakchannel']
  ],
  WEBSITE: [
    ['Highlight Mirror Blog', 'highlight-mirror'],
    ['Daily Sports Embed', 'daily-sports-embed']
  ]
};

const defaultPlatforms = Object.values(PLATFORMS);

const platformUrl = (platform, handle, postId) => {
  const safeHandle = handle.replace('@', '').replace(/[^a-zA-Z0-9-_]/g, '-');
  const lower = platform.toLowerCase().replace('_', '-');
  return `https://public-demo.highlightguard.ai/${lower}/${safeHandle}/posts/${postId}`;
};

const buildCaption = (asset, platform, index) => {
  const hooks = [
    `Insane ${asset.highlightCategory} from ${asset.matchName}`,
    `${asset.teams?.[0] || 'Team A'} vs ${asset.teams?.[1] || 'Team B'} highlight everyone is sharing`,
    `Final broadcast angle leaked from ${asset.tournament}`,
    `This ${asset.sportType} moment is going viral`,
    `Compilation cut: ${asset.title}`
  ];

  return `${hooks[index % hooks.length]} #${asset.sportType.replace(/\s+/g, '')} #highlights #${platform.toLowerCase()}`;
};

const buildFallbackAsset = () => ({
  id: 'mock-official-asset',
  assetId: 'asset_mock',
  title: 'Demo Goal Highlight',
  matchName: 'Demo FC vs Sample United',
  tournament: 'Demo Cup',
  teams: ['Demo FC', 'Sample United'],
  sportType: 'Football',
  highlightCategory: 'Goal',
  duration: 75,
  mediaUrl: 'https://cdn.highlightguard.ai/demo-official.mp4'
});

const createMockCrawledItem = async (asset, platform, index) => {
  const accountPool = accountPools[platform] || accountPools.WEBSITE;
  const [accountName, accountHandle] = accountPool[index % accountPool.length];
  const postId = buildPublicId('post');
  const accountId = `${platform}:${accountHandle.toLowerCase()}`;
  const views = Math.round(scoreBetween(`${postId}:views`, 1500, 950000, 0));
  const likes = Math.round(views * scoreBetween(`${postId}:likes`, 0.015, 0.1, 4));
  const shares = Math.round(views * scoreBetween(`${postId}:shares`, 0.004, 0.045, 4));
  const uploadOffsetMinutes = Math.round(scoreBetween(`${postId}:offset`, 5, 360, 0));

  return {
    platform,
    detectedUrl: platformUrl(platform, accountHandle, postId),
    accountName,
    accountHandle,
    caption: buildCaption(asset, platform, index),
    hashtags: ['sports', 'highlights', asset.sportType.toLowerCase(), asset.highlightCategory.toLowerCase().replace(/\s+/g, '')],
    uploadTimestamp: new Date(Date.now() - uploadOffsetMinutes * 60 * 1000),
    views,
    likes,
    shares,
    mediaUrl: `https://public-demo.highlightguard.ai/media/${postId}.mp4`,
    thumbnailUrl: `https://public-demo.highlightguard.ai/thumbs/${postId}.jpg`,
    accountId,
    relatedAssetGuess: asset.assetId
  };
};

const storeRawPayload = async (media, payload) => {
  const mongo = getMongoDb();
  if (!mongo) return null;

  const result = await mongo.collection('raw_crawl_items').insertOne({
    crawledMediaId: media.id,
    payload,
    createdAt: new Date()
  });

  await prisma.crawledMedia.update({
    where: { id: media.id },
    data: { rawPayloadId: result.insertedId.toString() }
  });

  return result.insertedId.toString();
};

const runMockCrawl = async (options = {}) => {
  const batchSize = Number(options.batchSize || 24);
  const platforms = options.platforms?.length ? options.platforms : defaultPlatforms;
  const assets = await prisma.officialAsset.findMany({
    where: { uploadStatus: { not: 'ARCHIVED' } },
    take: 20,
    orderBy: { createdAt: 'desc' }
  });
  if (assets.length === 0) {
    return {
      createdCount: 0,
      items: [],
      message: 'No official assets exist yet. Upload an asset before running platform monitoring.'
    };
  }
  const assetPool = assets;

  const created = [];

  for (let index = 0; index < batchSize; index += 1) {
    const platform = platforms[index % platforms.length];
    const asset = assetPool[index % assetPool.length];
    const payload = await createMockCrawledItem(asset, platform, index);
    const media = await prisma.crawledMedia.create({ data: payload });

    await storeRawPayload(media, {
      source: 'mock-platform-crawler',
      assetHint: asset.assetId,
      htmlSnapshotHash: buildPublicId('raw'),
      payload
    });

    if (options.runInlineMatching) {
      const matchingService = require('./matching.service');
      await matchingService.runMatching(media.id).catch(() => null);
    } else {
      await addJob(matchingQueue, 'match-crawled-media', { crawledMediaId: media.id });
    }

    created.push(media);
  }

  const accountIds = [...new Set(created.map((item) => item.accountId))];
  for (const accountId of accountIds) {
    await accountIntelligenceService.calculateHighlightDensity(accountId).catch(() => null);
  }

  await cacheDelPattern('dashboard:*').catch(() => null);

  return {
    createdCount: created.length,
    items: created
  };
};

const startCrawl = async (payload, user, req = null) => {
  if (payload.runInline) {
    const result = await runMockCrawl(payload);
    await recordAudit({
      actorId: user.id,
      action: 'CRAWLER_RUN_INLINE',
      entityType: 'CrawlerJob',
      metadata: payload,
      req
    });
    return { mode: 'inline', result };
  }

  const job = await addJob(crawlQueue, 'mock-platform-crawl', payload);
  await recordAudit({
    actorId: user.id,
    action: 'CRAWLER_STARTED',
    entityType: 'CrawlerJob',
    entityId: String(job.id),
    metadata: payload,
    req
  });

  return {
    jobId: job.id,
    status: 'QUEUED',
    queue: crawlQueue.name
  };
};

const listCrawlerJobs = async () => {
  const stats = await getQueueStats(crawlQueue);
  const jobs = await crawlQueue.getJobs(['waiting', 'active', 'completed', 'failed', 'delayed'], 0, 25, true);

  return {
    stats,
    jobs: jobs.map((job) => ({
      id: job.id,
      name: job.name,
      data: job.data,
      progress: job.progress,
      failedReason: job.failedReason,
      timestamp: job.timestamp,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn
    }))
  };
};

const listCrawlerResults = async (query) => {
  const { page, limit, skip } = getPagination(query);
  const where = {};
  if (query.platform) where.platform = query.platform;
  if (query.q) {
    where.OR = [
      { accountName: { contains: query.q, mode: 'insensitive' } },
      { accountHandle: { contains: query.q, mode: 'insensitive' } },
      { caption: { contains: query.q, mode: 'insensitive' } }
    ];
  }

  const [items, total] = await Promise.all([
    prisma.crawledMedia.findMany({
      where,
      skip,
      take: limit,
      orderBy: { crawlTimestamp: 'desc' },
      include: {
        detections: {
          select: {
            id: true,
            detectionId: true,
            confidenceScore: true,
            detectionStatus: true
          }
        }
      }
    }),
    prisma.crawledMedia.count({ where })
  ]);

  return { items, meta: buildPaginationMeta(page, limit, total) };
};

const getCrawlerResult = async (id) => {
  const item = await prisma.crawledMedia.findFirst({
    where: { id },
    include: {
      detections: {
        include: {
          officialAsset: true,
          riskScores: { orderBy: { createdAt: 'desc' }, take: 1 }
        }
      }
    }
  });

  if (!item) {
    const ApiError = require('../utils/ApiError');
    throw new ApiError(404, 'Crawled media item not found');
  }

  return item;
};

module.exports = {
  startCrawl,
  runMockCrawl,
  listCrawlerJobs,
  listCrawlerResults,
  getCrawlerResult
};
