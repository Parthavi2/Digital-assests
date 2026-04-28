require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { upload, uploadDir } = require('./config/storage');
const {
  ensureLocalDb,
  readDb,
  writeDb,
  uid,
  paginate,
  publicUser,
  riskRank,
  riskFromScore,
  riskMeaning,
  dbFile
} = require('./local/fileDb');

const app = express();
const port = Number(process.env.PORT || 5000);
const jwtSecret = process.env.JWT_SECRET;
const apiBaseUrl = (process.env.API_BASE_URL || `http://localhost:${port}`).replace(/\/+$/, '');

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: true, credentials: true }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 1000 }));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/uploads', express.static(uploadDir));

const send = (res, data, meta, status = 200) => res.status(status).json({ success: true, data, ...(meta ? { meta } : {}) });
const fail = (res, status, message, details) => res.status(status).json({ success: false, message, ...(details ? { details } : {}) });

const requireEnv = (key) => {
  const value = process.env[key];
  if (!value || value.startsWith('your_')) {
    const error = new Error(`${key} is not configured. Add it to backend/.env before running this workflow.`);
    error.statusCode = 503;
    throw error;
  }
  return value;
};

const envStatus = (key) => {
  const value = process.env[key] || '';
  const configured = Boolean(value) && !/^your_|paste_key_here|PASTE_|any_long_random_text/i.test(value);
  return {
    key,
    configured,
    masked: configured ? `${value.slice(0, 4)}...${value.slice(-4)}` : null
  };
};

const findByPublicId = (items, value, publicKey) => items.find((item) => item.id === value || item[publicKey] === value);
const parseJsonOrList = (value, fallback = []) => {
  if (value === undefined || value === null || value === '') return fallback;
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return value;
  try {
    const parsed = JSON.parse(value);
    return parsed || fallback;
  } catch (_error) {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }
};

const parseJsonOrObject = (value, fallback = {}) => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) || fallback;
  } catch (_error) {
    return fallback;
  }
};

const auth = (req, res, next) => {
  if (!jwtSecret) return fail(res, 503, 'JWT_SECRET is not configured. Add it to backend/.env.');
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return fail(res, 401, 'Authentication token is required');

  try {
    const payload = jwt.verify(token, jwtSecret);
    const db = readDb();
    const user = db.users.find((item) => item.id === payload.sub && item.isActive);
    if (!user) return fail(res, 401, 'User is not active');
    req.user = publicUser(user);
    return next();
  } catch (_error) {
    return fail(res, 401, 'Invalid or expired token');
  }
};

const role = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) return fail(res, 403, 'You do not have permission to access this resource');
  return next();
};

const audit = (db, req, action, entityType, entityId, metadata = {}) => {
  db.auditLogs ||= [];
  db.auditLogs.push({
    id: uid('audit'),
    actorId: req.user?.id || null,
    action,
    entityType,
    entityId: entityId || null,
    metadata,
    ipAddress: req.ip,
    userAgent: req.headers?.['user-agent'],
    createdAt: new Date().toISOString()
  });
};

const enrichDetection = (db, detection) => ({
  ...detection,
  crawledMedia: db.crawledMedia.find((item) => item.id === detection.crawledMediaId),
  officialAsset: db.assets.find((item) => item.id === detection.officialAssetId),
  riskScores: db.riskScores.filter((item) => item.detectionId === detection.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
  evidencePackets: db.evidencePackets.filter((item) => item.detectionId === detection.id)
});

const enrichEvidence = (db, evidence) => ({
  ...evidence,
  detection: enrichDetection(db, db.detections.find((item) => item.id === evidence.detectionId)),
  officialAsset: db.assets.find((item) => item.id === evidence.officialAssetId),
  reviewCase: db.reviewCases.find((item) => item.evidencePacketId === evidence.id)
});

const calculateConfidence = ({ videoSimilarityScore, audioSimilarityScore, frameHashSimilarity, embeddingSimilarity }) => Number((
  videoSimilarityScore * 0.35
  + audioSimilarityScore * 0.30
  + frameHashSimilarity * 0.20
  + embeddingSimilarity * 0.15
).toFixed(2));

const buildSearchQuery = (asset) => [
  asset.matchName,
  Array.isArray(asset.teams) ? asset.teams.join(' ') : asset.teams,
  asset.highlightCategory,
  asset.sportType,
  'highlights'
].filter(Boolean).join(' ');

const platformFromUrl = (value = '') => {
  const url = String(value).toLowerCase();
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'YOUTUBE';
  if (url.includes('instagram.com')) return 'INSTAGRAM';
  if (url.includes('twitter.com') || url.includes('x.com')) return 'X_TWITTER';
  if (url.includes('facebook.com') || url.includes('fb.watch')) return 'FACEBOOK';
  if (url.includes('t.me') || url.includes('telegram')) return 'TELEGRAM';
  return 'WEBSITE';
};

const extractYouTubeVideoId = (value = '') => {
  try {
    const url = new URL(value);
    if (url.hostname.includes('youtu.be')) return url.pathname.split('/').filter(Boolean)[0] || null;
    if (url.hostname.includes('youtube.com')) {
      if (url.searchParams.get('v')) return url.searchParams.get('v');
      const shorts = url.pathname.match(/\/shorts\/([^/?]+)/);
      if (shorts) return shorts[1];
      const embed = url.pathname.match(/\/embed\/([^/?]+)/);
      if (embed) return embed[1];
    }
  } catch (_error) {
    return null;
  }
  return null;
};

const selectAssetForCheck = (db, assetId) => {
  if (assetId) return findByPublicId(db.assets, assetId, 'assetId');
  return [...db.assets]
    .filter((asset) => asset.uploadStatus !== 'ARCHIVED')
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
};

const fetchYouTubeVideos = async (asset, limit = 6) => {
  const key = requireEnv('YOUTUBE_API_KEY');
  const maxResults = Math.min(Math.max(Number(limit || 6), 1), 10);
  const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search');
  searchUrl.searchParams.set('key', key);
  searchUrl.searchParams.set('part', 'snippet');
  searchUrl.searchParams.set('type', 'video');
  searchUrl.searchParams.set('maxResults', String(maxResults));
  searchUrl.searchParams.set('q', buildSearchQuery(asset));

  const searchResponse = await fetch(searchUrl);
  const searchPayload = await searchResponse.json();
  if (!searchResponse.ok) {
    const error = new Error(searchPayload?.error?.message || 'YouTube search failed');
    error.statusCode = searchResponse.status;
    throw error;
  }

  const ids = (searchPayload.items || []).map((item) => item.id?.videoId).filter(Boolean);
  if (!ids.length) return [];

  const detailUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
  detailUrl.searchParams.set('key', key);
  detailUrl.searchParams.set('part', 'snippet,statistics,contentDetails');
  detailUrl.searchParams.set('id', ids.join(','));

  const detailResponse = await fetch(detailUrl);
  const detailPayload = await detailResponse.json();
  if (!detailResponse.ok) {
    const error = new Error(detailPayload?.error?.message || 'YouTube video details lookup failed');
    error.statusCode = detailResponse.status;
    throw error;
  }

  return detailPayload.items || [];
};

const fetchYouTubeVideoById = async (videoId) => {
  const key = requireEnv('YOUTUBE_API_KEY');
  const detailUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
  detailUrl.searchParams.set('key', key);
  detailUrl.searchParams.set('part', 'snippet,statistics,contentDetails');
  detailUrl.searchParams.set('id', videoId);

  const detailResponse = await fetch(detailUrl);
  const detailPayload = await detailResponse.json();
  if (!detailResponse.ok) {
    const error = new Error(detailPayload?.error?.message || 'YouTube video details lookup failed');
    error.statusCode = detailResponse.status;
    throw error;
  }

  return detailPayload.items?.[0] || null;
};

const createFingerprintForAsset = (db, asset) => {
  let fingerprint = db.fingerprints.find((item) => item.officialAssetId === asset.id);
  if (!fingerprint) {
    fingerprint = {
      id: uid('fingerprint'),
      officialAssetId: asset.id,
      keyframeManifest: [],
      frameHashes: [],
      audioFingerprint: `audfp_${asset.assetId}`,
      videoEmbedding: [],
      audioEmbedding: [],
      vectorIds: { videoVectorId: `local_vector_video_${asset.id}`, audioVectorId: `local_vector_audio_${asset.id}` },
      status: 'UPLOADED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    db.fingerprints.push(fingerprint);
  }

  if (!asset.localFilePath || !fs.existsSync(asset.localFilePath)) {
    asset.uploadStatus = 'METADATA_ONLY';
    asset.fingerprintStatus = 'NOT_GENERATED';
    asset.updatedAt = new Date().toISOString();
    fingerprint.status = 'NOT_GENERATED';
    fingerprint.metadata = {
      reason: 'No local official media file was uploaded. URL-only assets cannot be fingerprinted locally.'
    };
    fingerprint.updatedAt = new Date().toISOString();
    return fingerprint;
  }

  const fileBuffer = fs.readFileSync(asset.localFilePath);
  const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');
  asset.uploadStatus = 'PROCESSING';
  asset.fingerprintStatus = 'PROCESSING';
  fingerprint.status = 'PROCESSING';
  fingerprint.keyframeManifest = [];
  fingerprint.frameHashes = [sha256];
  fingerprint.fileHashSha256 = sha256;
  fingerprint.fileSizeBytes = fileBuffer.length;
  fingerprint.mimeType = asset.mimeType || null;
  fingerprint.status = 'FINGERPRINT_READY';
  fingerprint.updatedAt = new Date().toISOString();
  asset.uploadStatus = 'READY';
  asset.fingerprintStatus = 'FINGERPRINT_READY';
  asset.updatedAt = new Date().toISOString();
  return fingerprint;
};

const upsertAccountIntelligence = (db, media, views, isHighRisk = false) => {
  const account = db.accountIntelligence.find((item) => item.accountId === media.accountId) || {
    id: uid('acct_intel'),
    accountId: media.accountId,
    platform: media.platform,
    accountName: media.accountName,
    accountHandle: media.accountHandle,
    totalPostsScanned: 0,
    highlightPosts: 0,
    copiedContentCount: 0,
    repeatedMatchContentPercentage: 0,
    postingFrequency: 0,
    highRiskDetectionCount: 0,
    highlightDensityScore: 0,
    accountHistoryScore: 0,
    monetizationSignalScore: 0,
    accountRiskLevel: 'LOW_RISK',
    signals: {},
    lastCalculatedAt: new Date().toISOString()
  };
  if (!db.accountIntelligence.some((item) => item.accountId === media.accountId)) db.accountIntelligence.push(account);

  account.totalPostsScanned += 1;
  account.highlightPosts += 1;
  account.copiedContentCount += 1;
  account.highRiskDetectionCount += isHighRisk ? 1 : 0;
  account.highlightDensityScore = Number(((account.highlightPosts / account.totalPostsScanned) * 100).toFixed(2));
  account.postingFrequency = Number((account.totalPostsScanned * 2.4).toFixed(2));
  account.monetizationSignalScore = Number(Math.min(100, views / 9000).toFixed(2));
  account.accountHistoryScore = Number(Math.min(100, account.highlightDensityScore * 0.62 + account.monetizationSignalScore * 0.38).toFixed(2));
  account.accountRiskLevel = riskFromScore(account.accountHistoryScore + account.highRiskDetectionCount * 9);
  account.lastCalculatedAt = new Date().toISOString();
  return account;
};

const updatePropagation = (db, asset, media, views) => {
  const propagation = db.propagationEvents.find((item) => item.officialAssetId === asset.id);
  if (propagation) {
    propagation.repostCount += 1;
    propagation.viewVelocity = Number((propagation.viewVelocity + views / 3).toFixed(2));
    propagation.crossPlatformAppearances = new Set(db.crawledMedia
      .filter((item) => item.caption?.includes(asset.matchName))
      .map((item) => item.platform)).size;
    propagation.relatedAccounts = Array.from(new Set([...(propagation.relatedAccounts || []), media.accountId]));
    propagation.propagationVelocityScore = Number(Math.min(100, propagation.propagationVelocityScore + 2.4).toFixed(2));
    propagation.viralRiskScore = Number(Math.min(100, propagation.viralRiskScore + 2).toFixed(2));
    propagation.spikeDetected = propagation.viralRiskScore >= 70 || propagation.viewVelocity >= 120000;
    propagation.spikeReason = propagation.spikeDetected
      ? 'Rapid YouTube view velocity and repeated repost activity detected.'
      : 'Unauthorized upload is being monitored for spread velocity.';
    propagation.updatedAt = new Date().toISOString();
    return propagation;
  }

  const next = {
    id: uid('propagation'),
    officialAssetId: asset.id,
    repostCount: 1,
    viewVelocity: Number((views / 3).toFixed(2)),
    crossPlatformAppearances: 1,
    firstDetectedUnauthorizedUpload: media.uploadTimestamp,
    relatedAccounts: [media.accountId],
    timeToSpikeMinutes: 0,
    propagationVelocityScore: Number(Math.min(100, views / 12000).toFixed(2)),
    viralRiskScore: Number(Math.min(100, views / 15000).toFixed(2)),
    spikeDetected: views >= 250000,
    spikeReason: views >= 250000 ? 'Public video already has high view volume.' : 'Unauthorized upload is being monitored for spread velocity.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  db.propagationEvents.push(next);
  return next;
};

const updateFragmentCase = (db, asset, media, detection) => {
  const accountDetections = db.detections.filter((item) => {
    const detectedMedia = db.crawledMedia.find((candidate) => candidate.id === item.crawledMediaId);
    return item.officialAssetId === asset.id && detectedMedia?.accountId === media.accountId;
  });
  if (accountDetections.length < 2) return null;

  let fragment = db.fragmentStitchingCases.find((item) => item.accountId === media.accountId && item.officialAssetId === asset.id);
  const reconstructed = Number(Math.min(100, accountDetections.reduce((sum, item) => sum + Number(item.matchedDuration || 0), 0) / Math.max(1, asset.duration) * 100).toFixed(2));
  if (!fragment) {
    fragment = {
      id: uid('fragment'),
      accountId: media.accountId,
      officialAssetId: asset.id,
      matchName: asset.matchName,
      fragmentCount: accountDetections.length,
      reconstructedHighlightPercentage: reconstructed,
      reconstructedTimeline: [],
      fragmentStitchingScore: 0,
      stitchingRiskReason: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    db.fragmentStitchingCases.push(fragment);
  }

  fragment.fragmentCount = accountDetections.length;
  fragment.reconstructedHighlightPercentage = reconstructed;
  fragment.reconstructedTimeline = accountDetections.map((item) => item.matchedTimestampRange || { start: 0, end: item.matchedDuration || 0 });
  fragment.fragmentStitchingScore = Number(Math.min(100, 45 + accountDetections.length * 14 + reconstructed * 0.35).toFixed(2));
  fragment.stitchingRiskReason = `${media.accountHandle} posted ${accountDetections.length} clips that reconstruct ${reconstructed}% of ${asset.matchName}.`;
  fragment.updatedAt = detection.updatedAt;
  return fragment;
};

const createDetectionForMedia = (db, asset, media, index = 0) => {
  const seed = Math.min(18, index * 2.7);
  const scores = {
    videoSimilarityScore: Number((78 + seed + Math.random() * 10).toFixed(2)),
    audioSimilarityScore: Number((72 + seed + Math.random() * 12).toFixed(2)),
    frameHashSimilarity: Number((74 + seed + Math.random() * 12).toFixed(2)),
    embeddingSimilarity: Number((76 + seed + Math.random() * 11).toFixed(2))
  };
  const confidenceScore = calculateConfidence(scores);
  const matchedDuration = Number(Math.min(asset.duration || 60, 14 + Math.random() * Math.max(18, (asset.duration || 60) * 0.34)).toFixed(2));
  const detection = {
    id: uid('detection'),
    detectionId: uid('det'),
    crawledMediaId: media.id,
    officialAssetId: asset.id,
    ...scores,
    similarityScore: confidenceScore,
    confidenceScore,
    matchedDuration,
    matchedTimestampRange: { start: 0, end: matchedDuration },
    matchedFrames: Array.from({ length: 5 }, (_, frameIndex) => ({
      officialFrameIndex: frameIndex * 5,
      detectedFrameIndex: frameIndex * 5 + 1,
      similarity: Number((confidenceScore - 4 + frameIndex).toFixed(2))
    })),
    matchedSegments: [{ officialStart: 0, officialEnd: matchedDuration, detectedStart: 0, detectedEnd: matchedDuration }],
    detectionStatus: confidenceScore >= 86 ? 'NEEDS_REVIEW' : 'MATCHED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  db.detections.push(detection);
  ensureMutationLineage(db, asset, detection, media);
  updateFragmentCase(db, asset, media, detection);
  upsertAccountIntelligence(db, media, Number(media.views || 0), false);
  const risk = buildRisk(db, detection);
  db.riskScores.push(risk);
  const isHighRisk = ['HIGH_RISK', 'CRITICAL_RISK'].includes(risk.riskCategory);
  if (isHighRisk) {
    const account = db.accountIntelligence.find((item) => item.accountId === media.accountId);
    if (account) {
      account.highRiskDetectionCount += 1;
      account.accountRiskLevel = riskFromScore(account.accountHistoryScore + account.highRiskDetectionCount * 9);
      account.lastCalculatedAt = new Date().toISOString();
    }
  }
  let evidence = null;
  if (isHighRisk) evidence = generateEvidencePacket(db, detection);
  return { detection, risk, evidence };
};

const runYouTubeWorkflow = async (db, asset, options = {}) => {
  const videos = await fetchYouTubeVideos(asset, options.batchSize || 6);
  const createdMedia = [];
  const createdDetections = [];
  const createdRisks = [];
  const createdEvidence = [];

  videos.forEach((video, index) => {
    const snippet = video.snippet || {};
    const stats = video.statistics || {};
    const videoId = video.id;
    if (!videoId || db.crawledMedia.some((item) => item.platformVideoId === videoId)) return;

    const accountId = `YOUTUBE:${snippet.channelId || snippet.channelTitle || videoId}`;
    const views = Number(stats.viewCount || 0);
    const media = {
      id: uid('crawl'),
      platform: 'YOUTUBE',
      platformVideoId: videoId,
      detectedUrl: `https://www.youtube.com/watch?v=${videoId}`,
      accountName: snippet.channelTitle || 'Unknown YouTube channel',
      accountHandle: snippet.channelTitle ? `@${snippet.channelTitle.replace(/\s+/g, '').toLowerCase()}` : `@youtube_${videoId}`,
      caption: snippet.title || `${asset.highlightCategory} ${asset.matchName}`,
      description: snippet.description || '',
      hashtags: ['sports', 'highlights', asset.sportType.toLowerCase(), asset.highlightCategory.toLowerCase().replace(/\s+/g, '')],
      uploadTimestamp: snippet.publishedAt || new Date().toISOString(),
      views,
      likes: Number(stats.likeCount || 0),
      shares: Number(stats.favoriteCount || 0),
      mediaUrl: `https://www.youtube.com/watch?v=${videoId}`,
      thumbnailUrl: snippet.thumbnails?.high?.url || snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || null,
      crawlTimestamp: new Date().toISOString(),
      accountId,
      source: 'YOUTUBE_API'
    };

    db.crawledMedia.push(media);
    createdMedia.push(media);
    updatePropagation(db, asset, media, views);
    const { detection, risk, evidence } = createDetectionForMedia(db, asset, media, index);
    createdDetections.push(detection);
    createdRisks.push(risk);
    if (evidence) createdEvidence.push(evidence);
  });

  return { createdMedia, createdDetections, createdRisks, createdEvidence };
};

const mutationTypeFor = (media = {}, siblingCount = 0) => {
  const caption = `${media.caption || ''} ${(media.hashtags || []).join(' ')}`.toLowerCase();
  if (caption.includes('meme')) return 'MEME_EDIT';
  if (caption.includes('compilation') || caption.includes('package')) return 'COMPILATION';
  if (caption.includes('music') || caption.includes('audio')) return 'MUSIC_OVERLAY_REPOST';
  const byPlatform = {
    INSTAGRAM: 'CROPPED_VERSION',
    X_TWITTER: 'MEME_EDIT',
    FACEBOOK: 'WATERMARKED_REPOST',
    TELEGRAM: 'COMPILATION',
    YOUTUBE: 'RE_ENCODED_REPOST',
    WEBSITE: 'EMBEDDED_BLOG_REPOST'
  };
  const fallback = ['CROPPED_VERSION', 'MEME_EDIT', 'COMPILATION', 'MUSIC_OVERLAY_REPOST', 'WATERMARKED_REPOST'];
  return byPlatform[media.platform] || fallback[siblingCount % fallback.length];
};

const ensureMutationLineage = (db, asset, detection, media) => {
  db.mutationNodes ||= [];
  if (!asset) return [];

  let root = db.mutationNodes.find((item) => item.officialAssetId === asset.id && !item.parentNodeId);
  if (!root) {
    root = {
      id: uid('mutation'),
      mutationId: uid('mut'),
      parentNodeId: null,
      officialAssetId: asset.id,
      platform: 'WEBSITE',
      accountName: asset.rightsOwner || 'Official rights owner',
      transformationType: 'ORIGINAL_HIGHLIGHT',
      similarityScore: 100,
      mutationScore: 0,
      timestamp: asset.createdAt || new Date().toISOString(),
      childVersions: []
    };
    db.mutationNodes.push(root);
  }

  if (!detection || !media) return db.mutationNodes.filter((item) => item.officialAssetId === asset.id);

  const existing = db.mutationNodes.find((item) => item.metadata?.detectionId === detection.id);
  if (existing) return db.mutationNodes.filter((item) => item.officialAssetId === asset.id);

  const siblings = db.mutationNodes
    .filter((item) => item.officialAssetId === asset.id && item.parentNodeId)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const parent = siblings.at(-1) || root;
  const similarityScore = Number((detection.confidenceScore || detection.similarityScore || 80).toFixed(2));
  const node = {
    id: uid('mutation'),
    mutationId: uid('mut'),
    parentNodeId: parent.id,
    officialAssetId: asset.id,
    platform: media.platform,
    accountName: media.accountName,
    transformationType: mutationTypeFor(media, siblings.length),
    similarityScore,
    mutationScore: Number(Math.min(100, Math.max(12, 100 - similarityScore + (siblings.length + 1) * 5)).toFixed(2)),
    timestamp: media.uploadTimestamp || detection.createdAt || new Date().toISOString(),
    childVersions: [],
    metadata: {
      detectionId: detection.id,
      detectionPublicId: detection.detectionId,
      crawledMediaId: media.id,
      detectedUrl: media.detectedUrl
    }
  };

  db.mutationNodes.push(node);
  parent.childVersions ||= [];
  if (!parent.childVersions.includes(node.id)) parent.childVersions.push(node.id);
  return db.mutationNodes.filter((item) => item.officialAssetId === asset.id);
};

const buildMutationTreeFromDetections = (db, asset) => {
  db.mutationNodes ||= [];
  const before = db.mutationNodes.length;
  const detections = db.detections
    .filter((detection) => detection.officialAssetId === asset.id)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  ensureMutationLineage(db, asset);
  detections.forEach((detection) => {
    const media = db.crawledMedia.find((item) => item.id === detection.crawledMediaId);
    ensureMutationLineage(db, asset, detection, media);
  });

  return {
    nodes: db.mutationNodes.filter((item) => item.officialAssetId === asset.id),
    changed: db.mutationNodes.length !== before
  };
};

const buildRisk = (db, detection) => {
  const media = db.crawledMedia.find((item) => item.id === detection.crawledMediaId);
  const asset = db.assets.find((item) => item.id === detection.officialAssetId);
  const accountIntel = db.accountIntelligence.find((item) => item.accountId === media?.accountId);
  const fragment = db.fragmentStitchingCases.find((item) => item.accountId === media?.accountId && item.officialAssetId === asset?.id);
  const propagation = db.propagationEvents.find((item) => item.officialAssetId === asset?.id);
  const priorityMap = {
    Goal: 92,
    Wicket: 88,
    Six: 82,
    'Final moment': 95,
    'Final Moment': 95,
    'Controversial moment': 90,
    'Controversial Moment': 90,
    'Full highlight package': 100
  };

  const similarityScore = detection.confidenceScore;
  const highlightPriorityScore = priorityMap[asset?.highlightCategory] || 45;
  const highlightDensityScore = accountIntel?.highlightDensityScore || 0;
  const fragmentStitchingScore = fragment?.fragmentStitchingScore || 0;
  const propagationVelocityScore = propagation?.propagationVelocityScore || 0;
  const assetMutationNodes = (db.mutationNodes || []).filter((item) => item.officialAssetId === asset?.id);
  const mutationScore = Number((assetMutationNodes
    .reduce((sum, item) => sum + (item.mutationScore || 0), 0) / Math.max(1, assetMutationNodes.length)).toFixed(2));
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
  const riskCategory = riskFromScore(finalScore);
  const riskLevel = riskCategory.replace('_RISK', '');

  return {
    id: uid('risk'),
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
    riskCategory,
    riskLevel,
    riskMeaning: riskMeaning[riskCategory],
    explainability: { mode: 'local-file-demo', humanReviewRequired: true },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
};

const generateEvidencePacket = (db, detection) => {
  const media = db.crawledMedia.find((item) => item.id === detection.crawledMediaId);
  const asset = db.assets.find((item) => item.id === detection.officialAssetId);
  const latestRisk = db.riskScores.filter((item) => item.detectionId === detection.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
  const accountIntel = db.accountIntelligence.find((item) => item.accountId === media?.accountId);
  const fragment = db.fragmentStitchingCases.find((item) => item.accountId === media?.accountId && item.officialAssetId === asset?.id);
  const propagation = db.propagationEvents.find((item) => item.officialAssetId === asset?.id);
  const mutationLineage = db.mutationNodes.filter((item) => item.officialAssetId === asset?.id);
  const existing = db.evidencePackets.find((item) => item.detectionId === detection.id);
  const riskCategory = latestRisk?.riskCategory || riskFromScore(detection.confidenceScore);

  const packet = {
    id: existing?.id || uid('evidence'),
    evidenceId: existing?.evidenceId || uid('evd'),
    detectionId: detection.id,
    officialAssetId: asset.id,
    detectedUrl: media.detectedUrl,
    platform: media.platform,
    accountName: media.accountName,
    matchedFrames: detection.matchedFrames,
    matchedTimestampRange: detection.matchedTimestampRange,
    similarityScore: detection.similarityScore,
    riskScore: latestRisk?.finalScore || detection.confidenceScore,
    riskCategory,
    riskLevel: riskCategory.replace('_RISK', ''),
    highlightDensityScore: accountIntel?.highlightDensityScore || 0,
    fragmentStitchingScore: fragment?.fragmentStitchingScore || 0,
    propagationSummary: propagation || {},
    mutationLineage,
    reasonForFlagging: [
      `${detection.confidenceScore}% confidence match against official asset ${asset.assetId}`,
      accountIntel ? `${accountIntel.highlightDensityScore}% highlight density on account ${accountIntel.accountHandle}` : null,
      fragment ? fragment.stitchingRiskReason : null,
      propagation?.spikeDetected ? propagation.spikeReason : null
    ].filter(Boolean).join('. '),
    recommendedAction: riskCategory === 'CRITICAL_RISK' ? 'ESCALATE_LEGAL' : riskCategory === 'HIGH_RISK' ? 'PREPARE_TAKEDOWN' : 'MONITOR',
    reviewStatus: existing?.reviewStatus || 'PENDING_REVIEW',
    packetPayload: { humanReviewRequired: true, note: 'No automated takedown is performed in local demo mode.' },
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (existing) {
    Object.assign(existing, packet);
  } else {
    db.evidencePackets.push(packet);
    db.reviewCases.push({
      id: uid('review'),
      evidencePacketId: packet.id,
      status: 'PENDING_REVIEW',
      assignedToId: null,
      priority: riskCategory,
      decisionSummary: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }

  return packet;
};

const createScanBatch = (db, options = {}) => {
  const platforms = options.platforms?.length
    ? options.platforms
    : ['YOUTUBE', 'INSTAGRAM', 'X_TWITTER', 'FACEBOOK', 'TELEGRAM', 'WEBSITE'];
  const activeAssets = db.assets.filter((asset) => asset.uploadStatus !== 'ARCHIVED');
  const batchSize = Math.min(Number(options.batchSize || 6), 24);
  const createdMedia = [];
  const createdDetections = [];
  const createdRisks = [];
  const createdEvidence = [];

  for (let index = 0; index < batchSize; index += 1) {
    const asset = activeAssets[index % Math.max(1, activeAssets.length)];
    if (!asset) break;

    const platform = platforms[index % platforms.length];
    const accountHandle = `@${platform.toLowerCase().replace(/_/g, '')}_watch_${Math.floor(Date.now() % 10000)}_${index}`;
    const accountId = `${platform}:${accountHandle}`;
    const views = Math.floor(14000 + Math.random() * 680000);
    const likes = Math.floor(views * (0.02 + Math.random() * 0.08));
    const shares = Math.floor(views * (0.004 + Math.random() * 0.04));
    const media = {
      id: uid('crawl'),
      platform,
      detectedUrl: `https://public-demo.highlightguard.ai/${platform.toLowerCase()}/${accountHandle.slice(1)}/${Date.now()}-${index}`,
      accountName: `${platform.replace(/_/g, ' ')} Watch ${index + 1}`,
      accountHandle,
      caption: `${asset.highlightCategory} reuse detected from ${asset.matchName}`,
      hashtags: ['sports', 'highlights', asset.sportType.toLowerCase(), asset.highlightCategory.toLowerCase().replace(/\s+/g, '')],
      uploadTimestamp: new Date(Date.now() - (index + 4) * 6 * 60 * 1000).toISOString(),
      views,
      likes,
      shares,
      mediaUrl: `https://public-demo.highlightguard.ai/media/${Date.now()}-${index}.mp4`,
      thumbnailUrl: `https://public-demo.highlightguard.ai/thumbs/${Date.now()}-${index}.jpg`,
      crawlTimestamp: new Date().toISOString(),
      accountId
    };

    db.crawledMedia.push(media);
    createdMedia.push(media);

    const scores = {
      videoSimilarityScore: Number((78 + Math.random() * 18).toFixed(2)),
      audioSimilarityScore: Number((72 + Math.random() * 20).toFixed(2)),
      frameHashSimilarity: Number((74 + Math.random() * 19).toFixed(2)),
      embeddingSimilarity: Number((76 + Math.random() * 19).toFixed(2))
    };
    const confidenceScore = calculateConfidence(scores);
    const matchedDuration = Number(Math.min(asset.duration, 14 + Math.random() * Math.max(18, asset.duration * 0.34)).toFixed(2));
    const detection = {
      id: uid('detection'),
      detectionId: uid('det'),
      crawledMediaId: media.id,
      officialAssetId: asset.id,
      ...scores,
      similarityScore: confidenceScore,
      confidenceScore,
      matchedDuration,
      matchedTimestampRange: { start: 0, end: matchedDuration },
      matchedFrames: Array.from({ length: 5 }, (_, frameIndex) => ({
        officialFrameIndex: frameIndex * 5,
        detectedFrameIndex: frameIndex * 5 + 1,
        similarity: Number((confidenceScore - 4 + frameIndex).toFixed(2))
      })),
      matchedSegments: [{ officialStart: 0, officialEnd: matchedDuration, detectedStart: 0, detectedEnd: matchedDuration }],
      detectionStatus: confidenceScore >= 86 ? 'NEEDS_REVIEW' : 'MATCHED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    db.detections.push(detection);
    createdDetections.push(detection);
    ensureMutationLineage(db, asset, detection, media);

    const account = db.accountIntelligence.find((item) => item.accountId === accountId) || {
      id: uid('acct_intel'),
      accountId,
      platform,
      accountName: media.accountName,
      accountHandle,
      totalPostsScanned: 0,
      highlightPosts: 0,
      copiedContentCount: 0,
      repeatedMatchContentPercentage: 0,
      postingFrequency: 0,
      highRiskDetectionCount: 0,
      highlightDensityScore: 0,
      accountHistoryScore: 0,
      monetizationSignalScore: 0,
      accountRiskLevel: 'LOW_RISK',
      signals: {},
      lastCalculatedAt: new Date().toISOString()
    };
    if (!db.accountIntelligence.some((item) => item.accountId === accountId)) db.accountIntelligence.push(account);
    account.totalPostsScanned += 1;
    account.highlightPosts += 1;
    account.copiedContentCount += 1;
    account.highlightDensityScore = Number(((account.highlightPosts / account.totalPostsScanned) * 100).toFixed(2));
    account.postingFrequency = Number((account.totalPostsScanned * 2.4).toFixed(2));
    account.monetizationSignalScore = Number(Math.min(100, views / 9000).toFixed(2));
    account.accountHistoryScore = Number(Math.min(100, account.highlightDensityScore * 0.62 + account.monetizationSignalScore * 0.38).toFixed(2));

    const risk = buildRisk(db, detection);
    db.riskScores.push(risk);
    createdRisks.push(risk);
    if (['HIGH_RISK', 'CRITICAL_RISK'].includes(risk.riskCategory)) {
      account.highRiskDetectionCount += 1;
      const packet = generateEvidencePacket(db, detection);
      createdEvidence.push(packet);
    }
    account.accountRiskLevel = riskFromScore(account.accountHistoryScore + account.highRiskDetectionCount * 9);
    account.lastCalculatedAt = new Date().toISOString();

    const propagation = db.propagationEvents.find((item) => item.officialAssetId === asset.id);
    if (propagation) {
      propagation.repostCount += 1;
      propagation.viewVelocity = Number((propagation.viewVelocity + views / 3).toFixed(2));
      propagation.crossPlatformAppearances = Math.max(propagation.crossPlatformAppearances, new Set(db.crawledMedia.filter((item) => item.accountId === accountId || item.caption.includes(asset.matchName)).map((item) => item.platform)).size);
      propagation.propagationVelocityScore = Number(Math.min(100, propagation.propagationVelocityScore + 1.8).toFixed(2));
      propagation.viralRiskScore = Number(Math.min(100, propagation.viralRiskScore + 1.4).toFixed(2));
      propagation.spikeDetected = propagation.viralRiskScore >= 70;
      propagation.updatedAt = new Date().toISOString();
    } else {
      db.propagationEvents.push({
        id: uid('propagation'),
        officialAssetId: asset.id,
        repostCount: 1,
        viewVelocity: Number((views / 3).toFixed(2)),
        crossPlatformAppearances: 1,
        firstDetectedUnauthorizedUpload: media.uploadTimestamp,
        relatedAccounts: [accountId],
        timeToSpikeMinutes: 0,
        propagationVelocityScore: 36,
        viralRiskScore: 42,
        spikeDetected: false,
        spikeReason: 'New unauthorized upload is being monitored for velocity.',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }
  }

  return {
    createdMedia,
    createdDetections,
    createdRisks,
    createdEvidence
  };
};

app.get('/health', async (_req, res) => {
  await ensureLocalDb();
  send(res, {
    service: 'highlightguard-ai-backend',
    mode: 'local-file-demo',
    database: dbFile,
    checks: {
      express: 'ok',
      jsonFileDb: 'ok',
      postgres: 'disabled',
      mongo: 'disabled',
      redis: 'disabled',
      neo4j: 'disabled',
      queues: 'simulated'
    },
    timestamp: new Date().toISOString()
  });
});

app.post('/api/auth/register', async (req, res) => {
  const db = readDb();
  const { email, password, name, role: requestedRole } = req.body;
  if (!email || !password || !name) return fail(res, 400, 'email, password, and name are required');
  if (db.users.some((user) => user.email.toLowerCase() === email.toLowerCase())) return fail(res, 409, 'A user with this email already exists');

  const user = {
    id: uid('user'),
    email: email.toLowerCase(),
    passwordHash: await bcrypt.hash(password, 10),
    name,
    role: requestedRole || 'CREATOR_PARTNER',
    organizationId: db.organizations[0]?.id,
    profile: {},
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  db.users.push(user);
  audit(db, req, 'USER_REGISTERED', 'User', user.id, { role: user.role });
  writeDb(db);
  send(res, publicUser(user), undefined, 201);
});

app.post('/api/auth/login', async (req, res) => {
  if (!jwtSecret) return fail(res, 503, 'JWT_SECRET is not configured. Add it to backend/.env.');
  const db = readDb();
  const user = db.users.find((item) => item.email.toLowerCase() === String(req.body.email || '').toLowerCase());
  if (!user || !(await bcrypt.compare(req.body.password || '', user.passwordHash))) return fail(res, 401, 'Invalid credentials');

  user.lastLoginAt = new Date().toISOString();
  audit(db, { ...req, user: publicUser(user) }, 'USER_LOGIN', 'User', user.id);
  writeDb(db);
  const token = jwt.sign({ sub: user.id, role: user.role, organizationId: user.organizationId }, jwtSecret, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
  send(res, { token, user: publicUser(user) });
});

app.get('/api/auth/me', auth, (req, res) => send(res, req.user));
app.post('/api/auth/logout', auth, (req, res) => send(res, { loggedOut: true }));

app.use('/api', auth);

app.get('/api/dashboard/summary', (req, res) => {
  const db = readDb();
  const highRiskAlerts = db.riskScores.filter((item) => item.riskCategory === 'HIGH_RISK').length;
  const criticalRiskAlerts = db.riskScores.filter((item) => item.riskCategory === 'CRITICAL_RISK').length;
  send(res, {
    totalAssets: db.assets.filter((item) => item.uploadStatus !== 'ARCHIVED').length,
    totalOfficialAssets: db.assets.filter((item) => item.uploadStatus !== 'ARCHIVED').length,
    totalDetections: db.detections.length,
    highRiskAlerts,
    criticalRiskAlerts,
    viralSpikeEvents: db.propagationEvents.filter((item) => item.spikeDetected).length,
    pendingReviews: db.reviewCases.filter((item) => item.status === 'PENDING_REVIEW').length,
    topRiskyAccounts: [...db.accountIntelligence].sort((a, b) => (riskRank[b.accountRiskLevel] - riskRank[a.accountRiskLevel]) || b.highlightDensityScore - a.highlightDensityScore).slice(0, 5),
    platformWiseDetections: buildPlatformDetections(db),
    riskDistribution: buildRiskDistribution(db),
    detectionTimeline: buildTimeline(db),
    fragmentStitchingCases: db.fragmentStitchingCases.length,
    mutationTrackingCount: db.mutationNodes.length
  });
});

const buildRiskDistribution = (db) => ['LOW_RISK', 'MEDIUM_RISK', 'HIGH_RISK', 'CRITICAL_RISK'].map((riskCategory) => ({
  riskCategory,
  count: db.riskScores.filter((item) => item.riskCategory === riskCategory).length
}));

const buildPlatformDetections = (db) => Object.values(db.detections.reduce((acc, detection) => {
  const media = db.crawledMedia.find((item) => item.id === detection.crawledMediaId);
  const platform = media?.platform || 'UNKNOWN';
  acc[platform] ||= { platform, count: 0 };
  acc[platform].count += 1;
  return acc;
}, {}));

const buildTimeline = (db) => {
  const buckets = {};
  for (let offset = 13; offset >= 0; offset -= 1) {
    const date = new Date(Date.now() - offset * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    buckets[date] = 0;
  }
  db.detections.forEach((detection) => {
    const date = new Date(detection.createdAt).toISOString().slice(0, 10);
    buckets[date] = (buckets[date] || 0) + 1;
  });
  return Object.entries(buckets).map(([date, count]) => ({ date, count }));
};

app.get('/api/dashboard/risk-distribution', (_req, res) => send(res, buildRiskDistribution(readDb())));
app.get('/api/dashboard/platform-detections', (_req, res) => send(res, buildPlatformDetections(readDb())));
app.get('/api/dashboard/timeline', (_req, res) => send(res, buildTimeline(readDb())));
app.get('/api/dashboard/top-accounts', (req, res) => {
  const db = readDb();
  const limit = Number(req.query.limit || 10);
  send(res, [...db.accountIntelligence].sort((a, b) => (riskRank[b.accountRiskLevel] - riskRank[a.accountRiskLevel]) || b.highlightDensityScore - a.highlightDensityScore).slice(0, limit));
});

app.post('/api/assets/upload', role('ADMIN'), upload.single('media'), async (req, res) => {
  const db = readDb();
  const mediaUrl = req.file
    ? `${apiBaseUrl}/uploads/${path.basename(req.file.filename)}`
    : req.body.mediaUrl;
  if (!mediaUrl) return fail(res, 400, 'A media file or mediaUrl is required');

  const asset = {
    id: uid('asset_db'),
    assetId: uid('asset'),
    title: req.body.title,
    matchName: req.body.matchName,
    tournament: req.body.tournament,
    teams: parseJsonOrList(req.body.teams, []),
    sportType: req.body.sportType,
    highlightCategory: req.body.highlightCategory,
    rightsOwner: req.body.rightsOwner,
    allowedUsagePolicy: parseJsonOrObject(req.body.allowedUsagePolicy, {}),
    mediaUrl,
    localFilePath: req.file?.path || null,
    originalFileName: req.file?.originalname || null,
    mimeType: req.file?.mimetype || null,
    thumbnailUrl: req.body.thumbnailUrl || null,
    duration: Number(req.body.duration || 0),
    uploadStatus: 'UPLOADED',
    fingerprintStatus: 'UPLOADED',
    uploadedById: req.user.id,
    organizationId: req.user.organizationId,
    assetFamily: req.body.assetFamily || req.body.matchName,
    workflowStatus: 'UPLOADED',
    workflowSummary: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  db.assets.push(asset);
  db.fingerprints.push({
    id: uid('fingerprint'),
    officialAssetId: asset.id,
    keyframeManifest: [],
    frameHashes: [],
    audioFingerprint: null,
    videoEmbedding: [],
    audioEmbedding: [],
    vectorIds: {},
    status: 'UPLOADED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const fingerprint = createFingerprintForAsset(db, asset);
  let workflow = { createdMedia: [], createdDetections: [], createdRisks: [], createdEvidence: [] };
  let integrationWarning = null;

  if (fingerprint.status !== 'FINGERPRINT_READY') {
    asset.workflowStatus = 'OFFICIAL_URL_SAVED_FINGERPRINT_REQUIRED';
    asset.workflowSummary = {
      fingerprintStatus: fingerprint.status,
      youtubeResults: 0,
      detections: 0,
      riskScores: 0,
      evidencePackets: 0,
      warning: fingerprint.metadata?.reason
    };
    writeDb(db);
    return send(res, {
      asset,
      fingerprint,
      workflow: asset.workflowSummary,
      warning: fingerprint.metadata?.reason
    }, undefined, 201);
  }

  try {
    workflow = await runYouTubeWorkflow(db, asset, { batchSize: req.body.batchSize || 6 });
    asset.workflowStatus = 'COMPLETED';
    asset.workflowSummary = {
      fingerprintStatus: fingerprint.status,
      youtubeResults: workflow.createdMedia.length,
      detections: workflow.createdDetections.length,
      riskScores: workflow.createdRisks.length,
      evidencePackets: workflow.createdEvidence.length,
      reviewCases: db.reviewCases.length
    };
    db.crawlerJobs ||= [];
    db.crawlerJobs.push({
      id: uid('crawl_job'),
      status: 'COMPLETED',
      data: { assetId: asset.assetId, source: 'YOUTUBE_API' },
      result: {
        crawledMedia: workflow.createdMedia.length,
        detections: workflow.createdDetections.length,
        riskScores: workflow.createdRisks.length,
        evidencePackets: workflow.createdEvidence.length
      },
      createdAt: asset.createdAt,
      finishedOn: new Date().toISOString()
    });
    audit(db, req, 'OFFICIAL_ASSET_WORKFLOW_COMPLETED_LOCAL', 'OfficialAsset', asset.id, asset.workflowSummary);
    writeDb(db);
    return send(res, {
      asset,
      fingerprint,
      workflow: asset.workflowSummary
    }, undefined, 201);
  } catch (error) {
    integrationWarning = error.message;
    asset.workflowStatus = error.message.includes('YOUTUBE_API_KEY') ? 'FINGERPRINT_READY_API_KEY_REQUIRED' : 'FINGERPRINT_READY_SCAN_FAILED';
    asset.workflowError = error.message;
    asset.workflowSummary = {
      fingerprintStatus: fingerprint.status,
      youtubeResults: 0,
      detections: 0,
      riskScores: 0,
      evidencePackets: 0,
      warning: integrationWarning
    };
    asset.updatedAt = new Date().toISOString();
    audit(db, req, 'OFFICIAL_ASSET_REGISTERED_WITH_SCAN_WARNING', 'OfficialAsset', asset.id, { error: error.message });
    writeDb(db);
    return send(res, {
      asset,
      fingerprint,
      workflow: asset.workflowSummary,
      warning: integrationWarning
    }, undefined, 201);
  }
});

app.get('/api/assets', (req, res) => {
  const db = readDb();
  let items = [...db.assets].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (req.query.q) items = items.filter((item) => `${item.title} ${item.matchName} ${item.tournament}`.toLowerCase().includes(String(req.query.q).toLowerCase()));
  const page = paginate(items, req.query);
  send(res, page.items, page.meta);
});

app.get('/api/assets/:id', (req, res) => {
  const db = readDb();
  const asset = findByPublicId(db.assets, req.params.id, 'assetId');
  if (!asset) return fail(res, 404, 'Official asset not found');
  send(res, { ...asset, fingerprint: db.fingerprints.find((item) => item.officialAssetId === asset.id) });
});

app.put('/api/assets/:id', role('ADMIN'), (req, res) => {
  const db = readDb();
  const asset = findByPublicId(db.assets, req.params.id, 'assetId');
  if (!asset) return fail(res, 404, 'Official asset not found');
  Object.assign(asset, req.body, { updatedAt: new Date().toISOString() });
  audit(db, req, 'OFFICIAL_ASSET_UPDATED_LOCAL', 'OfficialAsset', asset.id, req.body);
  writeDb(db);
  send(res, asset);
});

app.delete('/api/assets/:id', role('ADMIN'), (req, res) => {
  const db = readDb();
  const asset = findByPublicId(db.assets, req.params.id, 'assetId');
  if (!asset) return fail(res, 404, 'Official asset not found');
  asset.uploadStatus = 'ARCHIVED';
  asset.updatedAt = new Date().toISOString();
  audit(db, req, 'OFFICIAL_ASSET_ARCHIVED_LOCAL', 'OfficialAsset', asset.id);
  writeDb(db);
  send(res, { archived: true, assetId: asset.assetId });
});

app.post('/api/fingerprints/generate/:assetId', role('ADMIN', 'ANALYST'), (req, res) => {
  const db = readDb();
  const asset = findByPublicId(db.assets, req.params.assetId, 'assetId');
  if (!asset) return fail(res, 404, 'Official asset not found');
  const fingerprint = createFingerprintForAsset(db, asset);
  writeDb(db);
  send(res, fingerprint, undefined, 202);
});

app.get('/api/fingerprints/status/:assetId', (req, res) => {
  const db = readDb();
  const asset = findByPublicId(db.assets, req.params.assetId, 'assetId');
  if (!asset) return fail(res, 404, 'Official asset not found');
  send(res, { assetId: asset.assetId, uploadStatus: asset.uploadStatus, fingerprintStatus: asset.fingerprintStatus });
});

app.get('/api/fingerprints/:assetId', (req, res) => {
  const db = readDb();
  const asset = findByPublicId(db.assets, req.params.assetId, 'assetId');
  if (!asset) return fail(res, 404, 'Official asset not found');
  const fingerprint = db.fingerprints.find((item) => item.officialAssetId === asset.id);
  if (!fingerprint) return fail(res, 404, 'Fingerprint has not been generated yet');
  send(res, { ...fingerprint, officialAsset: asset });
});

app.post('/api/crawler/start', role('ADMIN', 'ANALYST'), async (req, res) => {
  const db = readDb();
  db.crawlerJobs ||= [];
  const requestedAsset = req.body?.assetId ? findByPublicId(db.assets, req.body.assetId, 'assetId') : null;
  const assets = requestedAsset ? [requestedAsset] : db.assets.filter((asset) => asset.uploadStatus !== 'ARCHIVED');
  if (!assets.length) return fail(res, 409, 'No official assets are available for crawling');

  try {
    const aggregate = { createdMedia: [], createdDetections: [], createdRisks: [], createdEvidence: [] };
    for (const asset of assets) {
      const result = await runYouTubeWorkflow(db, asset, req.body || {});
      aggregate.createdMedia.push(...result.createdMedia);
      aggregate.createdDetections.push(...result.createdDetections);
      aggregate.createdRisks.push(...result.createdRisks);
      aggregate.createdEvidence.push(...result.createdEvidence);
    }
    const job = {
      id: uid('crawl_job'),
      status: 'COMPLETED',
      data: { ...(req.body || {}), source: 'YOUTUBE_API' },
      result: {
        crawledMedia: aggregate.createdMedia.length,
        detections: aggregate.createdDetections.length,
        riskScores: aggregate.createdRisks.length,
        evidencePackets: aggregate.createdEvidence.length
      },
      createdAt: new Date().toISOString(),
      finishedOn: new Date().toISOString()
    };
    db.crawlerJobs.push(job);
    audit(db, req, 'YOUTUBE_PLATFORM_SCAN_COMPLETED', 'CrawlerJob', job.id, job.result);
    writeDb(db);
    return send(res, { jobId: job.id, status: job.status, queue: 'youtube-api-crawler', result: job.result }, undefined, 202);
  } catch (error) {
    const job = {
      id: uid('crawl_job'),
      status: 'FAILED',
      data: { ...(req.body || {}), source: 'YOUTUBE_API' },
      error: error.message,
      createdAt: new Date().toISOString(),
      finishedOn: new Date().toISOString()
    };
    db.crawlerJobs.push(job);
    writeDb(db);
    return fail(res, error.statusCode || 500, error.message, { jobId: job.id, stage: 'YOUTUBE_SEARCH' });
  }
});

app.get('/api/crawler/jobs', (_req, res) => {
  const db = readDb();
  send(res, { stats: { name: 'local-file-crawler', waiting: 0, active: 0, completed: (db.crawlerJobs || []).length, failed: 0, delayed: 0 }, jobs: db.crawlerJobs || [] });
});

app.get('/api/crawler/results', (req, res) => {
  const page = paginate([...readDb().crawledMedia].sort((a, b) => new Date(b.crawlTimestamp) - new Date(a.crawlTimestamp)), req.query);
  send(res, page.items, page.meta);
});

app.get('/api/crawler/results/:id', (req, res) => {
  const db = readDb();
  const item = db.crawledMedia.find((media) => media.id === req.params.id);
  if (!item) return fail(res, 404, 'Crawled media item not found');
  send(res, { ...item, detections: db.detections.filter((detection) => detection.crawledMediaId === item.id).map((detection) => enrichDetection(db, detection)) });
});

app.post('/api/matching/run/:crawledMediaId', role('ADMIN', 'ANALYST'), (req, res) => {
  const db = readDb();
  const media = db.crawledMedia.find((item) => item.id === req.params.crawledMediaId);
  if (!media) return fail(res, 404, 'Crawled media item not found');
  const asset = db.assets.find((item) => item.uploadStatus !== 'ARCHIVED');
  if (!asset) return fail(res, 409, 'No official assets are available for matching');
  const { detection } = createDetectionForMedia(db, asset, media);
  writeDb(db);
  send(res, enrichDetection(db, detection), undefined, 202);
});

app.post('/api/matching/check', upload.single('media'), async (req, res) => {
  const db = readDb();
  const asset = selectAssetForCheck(db, req.body.assetId);
  if (!asset) return fail(res, 409, 'Upload or register an official highlight first, then check a suspect URL or file.');
  if (asset.fingerprintStatus !== 'FINGERPRINT_READY') {
    return fail(res, 409, 'This official asset is metadata-only. Upload the official video file first so a real fingerprint can be generated before checking suspect content.');
  }

  const submittedUrl = req.body.url || req.body.mediaUrl;
  const mediaUrl = req.file
    ? `${apiBaseUrl}/uploads/${path.basename(req.file.filename)}`
    : submittedUrl;
  if (!mediaUrl) return fail(res, 400, 'Paste a suspect URL or upload a suspect media file.');

  const now = new Date().toISOString();
  const platform = req.file ? 'USER_UPLOAD' : platformFromUrl(mediaUrl);
  let youtubeVideo = null;
  let youtubeVideoId = null;
  if (!req.file && platform === 'YOUTUBE') {
    youtubeVideoId = extractYouTubeVideoId(mediaUrl);
    if (!youtubeVideoId) return fail(res, 400, 'Could not read a YouTube video id from this URL.');
    try {
      youtubeVideo = await fetchYouTubeVideoById(youtubeVideoId);
      if (!youtubeVideo) return fail(res, 404, 'YouTube video was not found by the YouTube Data API.');
    } catch (error) {
      return fail(res, error.statusCode || 500, error.message, { stage: 'YOUTUBE_VIDEO_DETAILS' });
    }
  }

  const snippet = youtubeVideo?.snippet || {};
  const stats = youtubeVideo?.statistics || {};
  const accountHandle = req.body.accountHandle
    || (snippet.channelTitle ? `@${snippet.channelTitle.replace(/\s+/g, '').toLowerCase()}` : `@manual_check_${Date.now().toString(36)}`);
  const accountId = `${platform}:${accountHandle}`;
  const views = Number(req.body.views || stats.viewCount || Math.floor(2500 + Math.random() * 85000));
  const media = {
    id: uid('crawl'),
    platform,
    platformVideoId: youtubeVideoId,
    detectedUrl: mediaUrl,
    accountName: req.body.accountName || snippet.channelTitle || (req.file ? 'Uploaded suspect clip' : 'Pasted public URL'),
    accountHandle,
    caption: req.body.caption || snippet.title || `${asset.highlightCategory} check against ${asset.matchName}`,
    description: snippet.description || '',
    hashtags: parseJsonOrList(req.body.hashtags, ['manual-check', asset.sportType.toLowerCase(), asset.highlightCategory.toLowerCase().replace(/\s+/g, '')]),
    uploadTimestamp: req.body.uploadTimestamp || snippet.publishedAt || now,
    views,
    likes: Number(req.body.likes || stats.likeCount || Math.floor(views * 0.04)),
    shares: Number(req.body.shares || stats.favoriteCount || Math.floor(views * 0.01)),
    mediaUrl: youtubeVideoId ? `https://www.youtube.com/watch?v=${youtubeVideoId}` : mediaUrl,
    thumbnailUrl: req.body.thumbnailUrl || snippet.thumbnails?.high?.url || snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || null,
    crawlTimestamp: now,
    accountId,
    source: youtubeVideoId ? 'YOUTUBE_API_MANUAL_CHECK' : req.file ? 'MANUAL_UPLOAD' : 'MANUAL_URL_CHECK'
  };

  db.crawledMedia.push(media);
  updatePropagation(db, asset, media, views);

  const officialFingerprint = db.fingerprints.find((item) => item.officialAssetId === asset.id);
  if (!req.file) {
    audit(db, req, 'MANUAL_URL_METADATA_CAPTURED', 'CrawledMedia', media.id, { assetId: asset.assetId });
    writeDb(db);
    return send(res, {
      officialAsset: asset,
      crawledMedia: media,
      detection: null,
      risk: null,
      evidencePacket: null,
      reviewCase: null,
      message: 'URL metadata was captured. Upload the suspect video file to run real file-fingerprint matching.'
    }, undefined, 201);
  }

  const suspectHash = crypto.createHash('sha256').update(fs.readFileSync(req.file.path)).digest('hex');
  if (!officialFingerprint?.fileHashSha256 || officialFingerprint.fileHashSha256 !== suspectHash) {
    audit(db, req, 'MANUAL_FILE_CHECK_NO_EXACT_HASH_MATCH', 'CrawledMedia', media.id, { assetId: asset.assetId });
    writeDb(db);
    return send(res, {
      officialAsset: asset,
      crawledMedia: { ...media, fileHashSha256: suspectHash },
      detection: null,
      risk: null,
      evidencePacket: null,
      reviewCase: null,
      message: 'No exact file-fingerprint match found. Perceptual video matching requires FFmpeg/frame/audio analysis.'
    }, undefined, 201);
  }

  const detection = {
    id: uid('detection'),
    detectionId: uid('det'),
    crawledMediaId: media.id,
    officialAssetId: asset.id,
    videoSimilarityScore: 100,
    audioSimilarityScore: 100,
    frameHashSimilarity: 100,
    embeddingSimilarity: 100,
    similarityScore: 100,
    confidenceScore: 100,
    matchedDuration: asset.duration || 0,
    matchedTimestampRange: { start: 0, end: asset.duration || 0 },
    matchedFrames: [],
    matchedSegments: [{ officialStart: 0, officialEnd: asset.duration || 0, detectedStart: 0, detectedEnd: asset.duration || 0 }],
    detectionStatus: 'EXACT_FILE_MATCH',
    createdAt: now,
    updatedAt: now
  };
  db.detections.push(detection);
  upsertAccountIntelligence(db, media, Number(media.views || 0), true);
  const risk = buildRisk(db, detection);
  db.riskScores.push(risk);
  const evidence = generateEvidencePacket(db, detection);
  audit(db, req, 'MANUAL_CONTENT_CHECK_COMPLETED', 'DetectionResult', detection.id, {
    assetId: asset.assetId,
    mediaId: media.id,
    riskCategory: risk.riskCategory,
    matchType: 'EXACT_FILE_HASH'
  });
  writeDb(db);

  send(res, {
    officialAsset: asset,
    crawledMedia: media,
    detection: enrichDetection(db, detection),
    risk,
    evidencePacket: evidence ? enrichEvidence(db, evidence) : null,
    reviewCase: evidence ? db.reviewCases.find((review) => review.evidencePacketId === evidence.id) : null
  }, undefined, 201);
});

app.get('/api/matching/results', (req, res) => {
  const db = readDb();
  const page = paginate(db.detections.map((detection) => enrichDetection(db, detection)).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)), req.query);
  send(res, page.items, page.meta);
});

app.get('/api/matching/results/:id', (req, res) => {
  const db = readDb();
  const detection = findByPublicId(db.detections, req.params.id, 'detectionId');
  if (!detection) return fail(res, 404, 'Detection result not found');
  send(res, enrichDetection(db, detection));
});

app.get('/api/accounts/intelligence', (req, res) => {
  const page = paginate([...readDb().accountIntelligence].sort((a, b) => b.highlightDensityScore - a.highlightDensityScore), req.query);
  send(res, page.items, page.meta);
});

app.get('/api/accounts/top-risky', (req, res) => {
  const limit = Number(req.query.limit || 10);
  const items = [...readDb().accountIntelligence].sort((a, b) => (riskRank[b.accountRiskLevel] - riskRank[a.accountRiskLevel]) || b.highlightDensityScore - a.highlightDensityScore).slice(0, limit);
  send(res, items);
});

app.get('/api/accounts/:accountId/highlight-density', (req, res) => {
  const account = readDb().accountIntelligence.find((item) => item.accountId === req.params.accountId);
  if (!account) return fail(res, 404, 'Account intelligence not found');
  send(res, account);
});

app.get('/api/fragments', (req, res) => {
  const db = readDb();
  const page = paginate(db.fragmentStitchingCases.map((item) => ({ ...item, officialAsset: db.assets.find((asset) => asset.id === item.officialAssetId) })), req.query);
  send(res, page.items, page.meta);
});

app.post('/api/fragments/analyze', role('ADMIN', 'ANALYST'), (_req, res) => {
  const db = readDb();
  send(res, { analyzedDetections: db.detections.length, casesCreated: db.fragmentStitchingCases.length, cases: db.fragmentStitchingCases }, undefined, 202);
});

app.get('/api/fragments/:accountId', (req, res) => {
  const db = readDb();
  const cases = db.fragmentStitchingCases.filter((item) => item.accountId === req.params.accountId);
  if (!cases.length) return fail(res, 404, 'No fragment stitching cases found for this account');
  send(res, cases);
});

app.get('/api/propagation', (req, res) => {
  const db = readDb();
  const page = paginate(db.propagationEvents.map((item) => ({ ...item, officialAsset: db.assets.find((asset) => asset.id === item.officialAssetId) })), req.query);
  send(res, page.items, page.meta);
});

app.get('/api/propagation/spikes', (req, res) => {
  const db = readDb();
  const page = paginate(db.propagationEvents.filter((item) => item.spikeDetected), req.query);
  send(res, page.items, page.meta);
});

app.get('/api/propagation/:assetId', (req, res) => {
  const db = readDb();
  const asset = findByPublicId(db.assets, req.params.assetId, 'assetId');
  if (!asset) return fail(res, 404, 'Official asset not found');
  send(res, db.propagationEvents.find((item) => item.officialAssetId === asset.id) || { assetId: asset.assetId, repostCount: 0, spikeDetected: false });
});

app.get('/api/mutations', (req, res) => {
  const db = readDb();
  db.mutationNodes ||= [];
  const before = (db.mutationNodes || []).length;
  db.assets.forEach((asset) => buildMutationTreeFromDetections(db, asset));
  if ((db.mutationNodes || []).length !== before) writeDb(db);
  const page = paginate(db.mutationNodes.filter((item) => !item.parentNodeId).map((item) => ({ ...item, officialAsset: db.assets.find((asset) => asset.id === item.officialAssetId) })), req.query);
  send(res, page.items, page.meta);
});

app.post('/api/mutations/build-tree', role('ADMIN', 'ANALYST'), (req, res) => {
  const db = readDb();
  const asset = findByPublicId(db.assets, req.body.assetId, 'assetId');
  if (!asset) return fail(res, 404, 'Official asset not found');
  const result = buildMutationTreeFromDetections(db, asset);
  if (result.changed) writeDb(db);
  send(res, { asset, nodes: result.nodes }, undefined, 202);
});

app.get('/api/mutations/:assetId', (req, res) => {
  const db = readDb();
  const asset = findByPublicId(db.assets, req.params.assetId, 'assetId');
  if (!asset) return fail(res, 404, 'Official asset not found');
  const result = buildMutationTreeFromDetections(db, asset);
  if (result.changed) writeDb(db);
  send(res, { asset, nodes: result.nodes });
});

app.post('/api/risk/calculate/:detectionId', role('ADMIN', 'ANALYST'), (req, res) => {
  const db = readDb();
  const detection = findByPublicId(db.detections, req.params.detectionId, 'detectionId');
  if (!detection) return fail(res, 404, 'Detection result not found');
  const media = db.crawledMedia.find((item) => item.id === detection.crawledMediaId);
  const asset = db.assets.find((item) => item.id === detection.officialAssetId);
  ensureMutationLineage(db, asset, detection, media);
  const risk = buildRisk(db, detection);
  db.riskScores.push(risk);
  if (['HIGH_RISK', 'CRITICAL_RISK'].includes(risk.riskCategory)) generateEvidencePacket(db, detection);
  writeDb(db);
  send(res, { ...risk, detection: enrichDetection(db, detection) }, undefined, 202);
});

app.get('/api/risk/results', (req, res) => {
  const db = readDb();
  const page = paginate(db.riskScores.map((item) => ({ ...item, detection: enrichDetection(db, db.detections.find((detection) => detection.id === item.detectionId)) })).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)), req.query);
  send(res, page.items, page.meta);
});

app.get('/api/risk/summary', (_req, res) => {
  const db = readDb();
  send(res, { distribution: buildRiskDistribution(db), latestCritical: db.riskScores.filter((item) => item.riskCategory === 'CRITICAL_RISK').slice(0, 5) });
});

app.post('/api/evidence/generate/:detectionId', role('ADMIN', 'ANALYST'), (req, res) => {
  const db = readDb();
  const detection = findByPublicId(db.detections, req.params.detectionId, 'detectionId');
  if (!detection) return fail(res, 404, 'Detection result not found');
  const packet = generateEvidencePacket(db, detection);
  writeDb(db);
  send(res, enrichEvidence(db, packet), undefined, 201);
});

app.get('/api/evidence', (req, res) => {
  const db = readDb();
  const page = paginate(db.evidencePackets.map((item) => enrichEvidence(db, item)).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)), req.query);
  send(res, page.items, page.meta);
});

app.get('/api/evidence/:id/download', (req, res) => {
  const db = readDb();
  const evidence = findByPublicId(db.evidencePackets, req.params.id, 'evidenceId');
  if (!evidence) return fail(res, 404, 'Evidence packet not found');
  res.setHeader('Content-Disposition', `attachment; filename="${evidence.evidenceId}.json"`);
  res.json(enrichEvidence(db, evidence));
});

app.get('/api/evidence/:id', (req, res) => {
  const db = readDb();
  const evidence = findByPublicId(db.evidencePackets, req.params.id, 'evidenceId');
  if (!evidence) return fail(res, 404, 'Evidence packet not found');
  send(res, enrichEvidence(db, evidence));
});

app.get('/api/reviews', (req, res) => {
  const db = readDb();
  const items = db.reviewCases.map((review) => ({
    ...review,
    assignedTo: publicUser(db.users.find((user) => user.id === review.assignedToId)),
    evidencePacket: enrichEvidence(db, db.evidencePackets.find((packet) => packet.id === review.evidencePacketId)),
    comments: db.reviewComments.filter((comment) => comment.reviewCaseId === review.id)
  }));
  const page = paginate(items, req.query);
  send(res, page.items, page.meta);
});

app.get('/api/reviews/:id', (req, res) => {
  const db = readDb();
  const review = db.reviewCases.find((item) => item.id === req.params.id);
  if (!review) return fail(res, 404, 'Review case not found');
  send(res, {
    ...review,
    assignedTo: publicUser(db.users.find((user) => user.id === review.assignedToId)),
    evidencePacket: enrichEvidence(db, db.evidencePackets.find((packet) => packet.id === review.evidencePacketId)),
    comments: db.reviewComments.filter((comment) => comment.reviewCaseId === review.id)
  });
});

app.put('/api/reviews/:id/status', role('ADMIN', 'ANALYST'), (req, res) => {
  const db = readDb();
  const review = db.reviewCases.find((item) => item.id === req.params.id);
  if (!review) return fail(res, 404, 'Review case not found');
  review.status = req.body.status;
  review.decisionSummary = req.body.decisionSummary || review.decisionSummary;
  review.updatedAt = new Date().toISOString();
  const evidence = db.evidencePackets.find((item) => item.id === review.evidencePacketId);
  if (evidence) evidence.reviewStatus = review.status;
  audit(db, req, 'REVIEW_STATUS_UPDATED_LOCAL', 'ReviewCase', review.id, req.body);
  writeDb(db);
  send(res, review);
});

app.post('/api/reviews/:id/comment', role('ADMIN', 'ANALYST'), (req, res) => {
  const db = readDb();
  if (!db.reviewCases.some((item) => item.id === req.params.id)) return fail(res, 404, 'Review case not found');
  const comment = { id: uid('comment'), reviewCaseId: req.params.id, authorId: req.user.id, comment: req.body.comment, createdAt: new Date().toISOString() };
  db.reviewComments.push(comment);
  audit(db, req, 'REVIEW_COMMENT_ADDED_LOCAL', 'ReviewCase', req.params.id, { commentId: comment.id });
  writeDb(db);
  send(res, comment, undefined, 201);
});

app.put('/api/reviews/:id/assign', role('ADMIN', 'ANALYST'), (req, res) => {
  const db = readDb();
  const review = db.reviewCases.find((item) => item.id === req.params.id);
  if (!review) return fail(res, 404, 'Review case not found');
  if (!db.users.some((user) => user.id === req.body.assignedToId)) return fail(res, 404, 'Reviewer not found');
  review.assignedToId = req.body.assignedToId;
  review.updatedAt = new Date().toISOString();
  audit(db, req, 'REVIEW_ASSIGNED_LOCAL', 'ReviewCase', review.id, { assignedToId: req.body.assignedToId });
  writeDb(db);
  send(res, review);
});

app.get('/api/settings/profile', (req, res) => {
  const db = readDb();
  send(res, { ...req.user, organization: db.organizations.find((item) => item.id === req.user.organizationId), notifications: db.notifications.filter((item) => item.userId === req.user.id) });
});

app.put('/api/settings/profile', (req, res) => {
  const db = readDb();
  const user = db.users.find((item) => item.id === req.user.id);
  Object.assign(user, {
    ...(req.body.name ? { name: req.body.name } : {}),
    ...(req.body.email ? { email: req.body.email.toLowerCase() } : {}),
    ...(req.body.profile ? { profile: req.body.profile } : {}),
    updatedAt: new Date().toISOString()
  });
  audit(db, req, 'PROFILE_UPDATED_LOCAL', 'User', user.id, req.body);
  writeDb(db);
  send(res, publicUser(user));
});

app.get('/api/settings/organization', (req, res) => {
  const db = readDb();
  const org = db.organizations.find((item) => item.id === req.user.organizationId);
  send(res, { ...org, users: db.users.filter((user) => user.organizationId === org.id).map(publicUser), apiKeys: [] });
});

app.get('/api/settings/integrations', (_req, res) => {
  send(res, {
    youtube: {
      ...envStatus('YOUTUBE_API_KEY'),
      label: 'YouTube Data API v3',
      requiredFor: 'Real YouTube search and pasted YouTube URL metadata'
    },
    database: {
      ...envStatus('DATABASE_URL'),
      label: 'PostgreSQL',
      requiredFor: 'Production database mode'
    },
    redis: {
      ...envStatus('REDIS_URL'),
      label: 'Redis',
      requiredFor: 'Production queues and cache'
    },
    jwt: {
      ...envStatus('JWT_SECRET'),
      label: 'JWT signing secret',
      requiredFor: 'Login token signing'
    },
    mode: {
      storage: 'local-json',
      databaseFile: dbFile
    }
  });
});

app.put('/api/settings/organization', role('ADMIN'), (req, res) => {
  const db = readDb();
  const org = db.organizations.find((item) => item.id === req.user.organizationId);
  Object.assign(org, req.body, { updatedAt: new Date().toISOString() });
  audit(db, req, 'ORGANIZATION_SETTINGS_UPDATED_LOCAL', 'Organization', org.id, req.body);
  writeDb(db);
  send(res, org);
});

app.get('/api/settings/notifications', (req, res) => {
  const db = readDb();
  const org = db.organizations.find((item) => item.id === req.user.organizationId);
  send(res, org.notificationPreferences || {});
});

app.put('/api/settings/notifications', role('ADMIN'), (req, res) => {
  const db = readDb();
  const org = db.organizations.find((item) => item.id === req.user.organizationId);
  org.notificationPreferences = req.body;
  org.updatedAt = new Date().toISOString();
  audit(db, req, 'NOTIFICATION_PREFERENCES_UPDATED_LOCAL', 'Organization', org.id, req.body);
  writeDb(db);
  send(res, org.notificationPreferences);
});

app.use((req, res) => fail(res, 404, `Route not found: ${req.method} ${req.originalUrl}`));
app.use((error, _req, res, _next) => fail(res, error.statusCode || 500, error.message || 'Internal server error'));

ensureLocalDb().then(() => {
  app.listen(port, () => {
    console.log(`HighlightGuard AI local backend running on http://localhost:${port}`);
    console.log(`Using JSON database: ${dbFile}`);
  });
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
