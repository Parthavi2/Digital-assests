const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const dataDir = path.resolve(process.cwd(), 'data');
const dbFile = path.join(dataDir, 'local-demo-db.json');

const now = new Date();
const iso = (minutesAgo = 0) => new Date(now.getTime() - minutesAgo * 60 * 1000).toISOString();
const id = (prefix, index) => `${prefix}_${String(index).padStart(3, '0')}`;

const riskMeaning = {
  LOW_RISK: 'fan edit, meme, short transformative content',
  MEDIUM_RISK: 'repeated partial reuse',
  HIGH_RISK: 'copied highlights, monetized misuse, suspicious account',
  CRITICAL_RISK: 'viral spread, fragment stitching, organized misuse'
};

const createLocalSeed = async () => {
  const organization = {
    id: 'org_demo_001',
    name: 'HighlightGuard Demo League',
    slug: 'highlightguard-demo-league',
    domain: 'highlightguard.ai',
    rightsTerritories: ['IN', 'US', 'GB', 'AU'],
    notificationPreferences: {
      emailAlerts: true,
      criticalRiskAlerts: true,
      dailyDigest: true
    },
    securitySettings: {
      reviewApprovalRequiredForHighRisk: true,
      mfaRequiredForAdmins: false
    },
    createdAt: iso(7200),
    updatedAt: iso(20)
  };

  const users = [
    {
      id: 'user_admin_001',
      email: 'admin@highlightguard.ai',
      passwordHash: await bcrypt.hash('Admin@123', 10),
      name: 'Aarav Rights Admin',
      role: 'ADMIN',
      organizationId: organization.id,
      profile: { title: 'Head of Broadcast Protection', timezone: 'Asia/Kolkata' },
      isActive: true,
      createdAt: iso(7000),
      updatedAt: iso(10)
    },
    {
      id: 'user_analyst_001',
      email: 'analyst@highlightguard.ai',
      passwordHash: await bcrypt.hash('Analyst@123', 10),
      name: 'Maya Review Analyst',
      role: 'ANALYST',
      organizationId: organization.id,
      profile: { title: 'Media Intelligence Analyst' },
      isActive: true,
      createdAt: iso(6900),
      updatedAt: iso(10)
    },
    {
      id: 'user_creator_001',
      email: 'creator@highlightguard.ai',
      passwordHash: await bcrypt.hash('Creator@123', 10),
      name: 'Kabir Partner Creator',
      role: 'CREATOR_PARTNER',
      organizationId: organization.id,
      profile: { title: 'Licensed Partner', permittedUse: 'short attributed clips' },
      isActive: true,
      createdAt: iso(6800),
      updatedAt: iso(10)
    }
  ];

  return {
    meta: { generatedAt: now.toISOString(), mode: 'local-file-clean' },
    organizations: [organization],
    users,
    assets: [],
    fingerprints: [],
    crawledMedia: [],
    detections: [],
    accountIntelligence: [],
    fragmentStitchingCases: [],
    propagationEvents: [],
    mutationNodes: [],
    riskScores: [],
    evidencePackets: [],
    reviewCases: [],
    reviewComments: [],
    notifications: [],
    auditLogs: [],
    systemLogs: [
      {
        id: 'system_log_001',
        level: 'info',
        source: 'local-seed',
        message: 'Clean HighlightGuard AI database seeded with users only',
        context: { assets: 0, detections: 0 },
        createdAt: now.toISOString()
      }
    ],
    crawlerJobs: []
  };

  const assets = [
    {
      id: 'asset_db_001',
      assetId: 'asset_goal_final_001',
      title: 'Last-Minute Final Goal',
      matchName: 'Mumbai Meteors vs Delhi Dynamos',
      tournament: 'Premier Football Cup 2026',
      teams: ['Mumbai Meteors', 'Delhi Dynamos'],
      sportType: 'Football',
      highlightCategory: 'Goal',
      rightsOwner: organization.name,
      allowedUsagePolicy: { partnerClipsAllowedSeconds: 8, attributionRequired: true, monetizationAllowed: false },
      mediaUrl: 'https://cdn.highlightguard.ai/official/mumbai-delhi-final-goal.mp4',
      thumbnailUrl: 'https://cdn.highlightguard.ai/thumbs/mumbai-delhi-final-goal.jpg',
      duration: 86,
      uploadStatus: 'READY',
      fingerprintStatus: 'COMPLETED',
      uploadedById: users[0].id,
      organizationId: organization.id,
      assetFamily: 'mumbai-delhi-final',
      createdAt: iso(3600),
      updatedAt: iso(60)
    },
    {
      id: 'asset_db_002',
      assetId: 'asset_wicket_semifinal_002',
      title: 'Hat-Trick Wicket Sequence',
      matchName: 'Bengal Tigers vs Chennai Kings',
      tournament: 'Continental Cricket League 2026',
      teams: ['Bengal Tigers', 'Chennai Kings'],
      sportType: 'Cricket',
      highlightCategory: 'Wicket',
      rightsOwner: organization.name,
      allowedUsagePolicy: { partnerClipsAllowedSeconds: 6, attributionRequired: true, monetizationAllowed: false },
      mediaUrl: 'https://cdn.highlightguard.ai/official/bengal-chennai-hattrick.mp4',
      thumbnailUrl: 'https://cdn.highlightguard.ai/thumbs/bengal-chennai-hattrick.jpg',
      duration: 112,
      uploadStatus: 'READY',
      fingerprintStatus: 'COMPLETED',
      uploadedById: users[0].id,
      organizationId: organization.id,
      assetFamily: 'bengal-chennai-semifinal',
      createdAt: iso(3200),
      updatedAt: iso(60)
    },
    {
      id: 'asset_db_003',
      assetId: 'asset_full_package_003',
      title: 'Full Match Highlight Package',
      matchName: 'Mumbai Meteors vs Delhi Dynamos',
      tournament: 'Premier Football Cup 2026',
      teams: ['Mumbai Meteors', 'Delhi Dynamos'],
      sportType: 'Football',
      highlightCategory: 'Full highlight package',
      rightsOwner: organization.name,
      allowedUsagePolicy: { partnerClipsAllowedSeconds: 10, attributionRequired: true, monetizationAllowed: false },
      mediaUrl: 'https://cdn.highlightguard.ai/official/mumbai-delhi-full-package.mp4',
      thumbnailUrl: 'https://cdn.highlightguard.ai/thumbs/mumbai-delhi-full-package.jpg',
      duration: 420,
      uploadStatus: 'READY',
      fingerprintStatus: 'COMPLETED',
      uploadedById: users[0].id,
      organizationId: organization.id,
      assetFamily: 'mumbai-delhi-final',
      createdAt: iso(3000),
      updatedAt: iso(60)
    }
  ];

  const fingerprints = assets.map((asset, index) => ({
    id: id('fingerprint', index + 1),
    officialAssetId: asset.id,
    keyframeManifest: Array.from({ length: 10 }, (_, frameIndex) => ({
      index: frameIndex,
      timestamp: Number((frameIndex * asset.duration / 10).toFixed(2)),
      extractor: 'local-demo-ffmpeg-placeholder',
      path: `generated/keyframes/${asset.assetId}/frame_${frameIndex}.jpg`
    })),
    frameHashes: Array.from({ length: 10 }, (_, frameIndex) => ({
      frameIndex,
      timestamp: Number((frameIndex * asset.duration / 10).toFixed(2)),
      pHash: `phash_${asset.assetId}_${frameIndex}`,
      dHash: `dhash_${asset.assetId}_${frameIndex}`
    })),
    audioFingerprint: `audfp_${asset.assetId}`,
    videoEmbedding: Array.from({ length: 16 }, (_, dim) => Number(Math.sin(dim + index).toFixed(4))),
    audioEmbedding: Array.from({ length: 16 }, (_, dim) => Number(Math.cos(dim + index).toFixed(4))),
    vectorIds: {
      videoVectorId: `local_vector_video_${asset.id}`,
      audioVectorId: `local_vector_audio_${asset.id}`
    },
    status: 'COMPLETED',
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt
  }));

  const crawledMedia = [
    ['YOUTUBE', '@cliprushsports', 'ClipRush Sports', assets[0], 284000, 19100, 4200, 42],
    ['INSTAGRAM', '@reelmatchday', 'Reel Matchday', assets[0], 612000, 48200, 12900, 35],
    ['X_TWITTER', '@livesportleaks', 'LiveSportLeaks', assets[0], 171000, 7300, 5100, 58],
    ['TELEGRAM', '@publicmatchclips', 'Public Match Clips', assets[2], 88000, 1200, 8400, 24],
    ['TELEGRAM', '@publicmatchclips', 'Public Match Clips', assets[2], 91000, 1300, 7900, 20],
    ['TELEGRAM', '@publicmatchclips', 'Public Match Clips', assets[2], 94000, 1400, 8200, 16],
    ['FACEBOOK', '@sportshighlightshub', 'Sports Highlights Hub', assets[1], 233000, 9700, 3600, 128],
    ['WEBSITE', 'highlight-mirror', 'Highlight Mirror Blog', assets[2], 47000, 350, 900, 75]
  ].map(([platform, handle, name, asset, views, likes, shares, age], index) => ({
    id: id('crawl', index + 1),
    platform,
    detectedUrl: `https://public-demo.highlightguard.ai/${platform.toLowerCase()}/${handle.replace('@', '')}/${index + 1}`,
    accountName: name,
    accountHandle: handle,
    caption: `${asset.highlightCategory} clip from ${asset.matchName} reposted for fast engagement`,
    hashtags: ['sports', 'highlights', asset.sportType.toLowerCase(), asset.highlightCategory.toLowerCase().replace(/\s+/g, '')],
    uploadTimestamp: iso(age),
    views,
    likes,
    shares,
    mediaUrl: `https://public-demo.highlightguard.ai/media/crawl_${index + 1}.mp4`,
    thumbnailUrl: `https://public-demo.highlightguard.ai/thumbs/crawl_${index + 1}.jpg`,
    crawlTimestamp: iso(age - 3),
    accountId: `${platform}:${handle}`
  }));

  const detectionInputs = [
    [crawledMedia[0], assets[0], 91.4, 31, 'NEEDS_REVIEW'],
    [crawledMedia[1], assets[0], 88.9, 26, 'NEEDS_REVIEW'],
    [crawledMedia[2], assets[0], 85.1, 18, 'MATCHED'],
    [crawledMedia[3], assets[2], 82.9, 42, 'MATCHED'],
    [crawledMedia[4], assets[2], 84.2, 39, 'MATCHED'],
    [crawledMedia[5], assets[2], 85.8, 45, 'MATCHED'],
    [crawledMedia[6], assets[1], 89.5, 44, 'NEEDS_REVIEW'],
    [crawledMedia[7], assets[2], 77.1, 180, 'MATCHED']
  ];

  const detections = detectionInputs.map(([media, asset, confidence, duration, status], index) => ({
    id: id('detection', index + 1),
    detectionId: id('det', index + 1),
    crawledMediaId: media.id,
    officialAssetId: asset.id,
    videoSimilarityScore: Number((confidence + 2.1).toFixed(2)),
    audioSimilarityScore: Number((confidence - 3.2).toFixed(2)),
    frameHashSimilarity: Number((confidence - 1.1).toFixed(2)),
    embeddingSimilarity: Number((confidence + 0.8).toFixed(2)),
    similarityScore: confidence,
    confidenceScore: confidence,
    matchedDuration: duration,
    matchedTimestampRange: { start: index * 12, end: index * 12 + duration },
    matchedFrames: Array.from({ length: 5 }, (_, frameIndex) => ({
      officialFrameIndex: frameIndex * 4,
      detectedFrameIndex: frameIndex * 4 + 1,
      similarity: Number((confidence - 4 + frameIndex).toFixed(2))
    })),
    matchedSegments: [{ officialStart: index * 12, officialEnd: index * 12 + duration, detectedStart: 0, detectedEnd: duration }],
    detectionStatus: status,
    createdAt: iso(70 - index * 6),
    updatedAt: iso(20)
  }));

  const accountIntelligence = [
    {
      id: 'acct_intel_001',
      accountId: 'TELEGRAM:@publicmatchclips',
      platform: 'TELEGRAM',
      accountName: 'Public Match Clips',
      accountHandle: '@publicmatchclips',
      totalPostsScanned: 18,
      highlightPosts: 15,
      copiedContentCount: 9,
      repeatedMatchContentPercentage: 88.9,
      postingFrequency: 12.6,
      highRiskDetectionCount: 5,
      highlightDensityScore: 83.33,
      accountHistoryScore: 86.4,
      monetizationSignalScore: 41.2,
      accountRiskLevel: 'CRITICAL_RISK',
      signals: { pattern: 'fragment farming' },
      lastCalculatedAt: iso(10)
    },
    {
      id: 'acct_intel_002',
      accountId: 'YOUTUBE:@cliprushsports',
      platform: 'YOUTUBE',
      accountName: 'ClipRush Sports',
      accountHandle: '@cliprushsports',
      totalPostsScanned: 27,
      highlightPosts: 16,
      copiedContentCount: 7,
      repeatedMatchContentPercentage: 57.1,
      postingFrequency: 4.9,
      highRiskDetectionCount: 2,
      highlightDensityScore: 59.26,
      accountHistoryScore: 67.8,
      monetizationSignalScore: 72.4,
      accountRiskLevel: 'HIGH_RISK',
      signals: { pattern: 'monetized highlight reposts' },
      lastCalculatedAt: iso(12)
    },
    {
      id: 'acct_intel_003',
      accountId: 'INSTAGRAM:@reelmatchday',
      platform: 'INSTAGRAM',
      accountName: 'Reel Matchday',
      accountHandle: '@reelmatchday',
      totalPostsScanned: 35,
      highlightPosts: 18,
      copiedContentCount: 6,
      repeatedMatchContentPercentage: 50,
      postingFrequency: 7.2,
      highRiskDetectionCount: 1,
      highlightDensityScore: 51.43,
      accountHistoryScore: 61.5,
      monetizationSignalScore: 82.1,
      accountRiskLevel: 'HIGH_RISK',
      signals: { pattern: 'short-form clipping' },
      lastCalculatedAt: iso(14)
    }
  ];

  const fragmentStitchingCases = [
    {
      id: 'fragment_case_001',
      accountId: 'TELEGRAM:@publicmatchclips',
      officialAssetId: assets[2].id,
      matchName: assets[2].matchName,
      assetFamily: assets[2].assetFamily,
      fragmentCount: 7,
      reconstructedTimeline: [
        { start: 0, end: 42 },
        { start: 43, end: 82 },
        { start: 83, end: 128 },
        { start: 129, end: 188 }
      ],
      reconstructedHighlightPercentage: 68,
      fragmentStitchingScore: 93.4,
      stitchingRiskReason: 'This account uploaded 7 fragments from the same match within 18 minutes, reconstructing 68% of the official highlight package.',
      firstFragmentAt: iso(24),
      lastFragmentAt: iso(6),
      createdAt: iso(5),
      updatedAt: iso(5)
    }
  ];

  const propagationEvents = [
    {
      id: 'propagation_001',
      officialAssetId: assets[0].id,
      repostCount: 14,
      viewVelocity: 48700,
      crossPlatformAppearances: 5,
      firstDetectedUnauthorizedUpload: iso(58),
      relatedAccounts: ['YOUTUBE:@cliprushsports', 'INSTAGRAM:@reelmatchday', 'X_TWITTER:@livesportleaks'],
      timeToSpikeMinutes: 21,
      propagationVelocityScore: 91.8,
      viralRiskScore: 94.2,
      spikeDetected: true,
      spikeReason: 'Unauthorized final-goal clip crossed 1M estimated views across 5 platforms in under one hour.',
      createdAt: iso(4),
      updatedAt: iso(4)
    }
  ];

  const mutationNodes = [
    {
      id: 'mutation_001',
      mutationId: 'mut_seed_root_goal',
      parentNodeId: null,
      officialAssetId: assets[0].id,
      platform: 'WEBSITE',
      accountName: organization.name,
      transformationType: 'ORIGINAL_HIGHLIGHT',
      similarityScore: 100,
      mutationScore: 0,
      timestamp: assets[0].createdAt,
      childVersions: ['mutation_002']
    },
    {
      id: 'mutation_002',
      mutationId: 'mut_seed_cropped_goal',
      parentNodeId: 'mutation_001',
      officialAssetId: assets[0].id,
      platform: 'INSTAGRAM',
      accountName: 'Reel Matchday',
      transformationType: 'CROPPED_VERSION',
      similarityScore: 90.1,
      mutationScore: 29.6,
      timestamp: iso(35),
      childVersions: ['mutation_003']
    },
    {
      id: 'mutation_003',
      mutationId: 'mut_seed_meme_goal',
      parentNodeId: 'mutation_002',
      officialAssetId: assets[0].id,
      platform: 'X_TWITTER',
      accountName: 'LiveSportLeaks',
      transformationType: 'MEME_EDIT',
      similarityScore: 87.3,
      mutationScore: 43.2,
      timestamp: iso(29),
      childVersions: []
    }
  ];

  const riskScores = [
    [detections[0], 91.5, 'CRITICAL_RISK', 92, 59.26, 0, 91.8, 31, 67.8, 72.4],
    [detections[1], 84.7, 'HIGH_RISK', 92, 51.43, 0, 91.8, 42, 61.5, 82.1],
    [detections[3], 88.9, 'CRITICAL_RISK', 100, 83.33, 93.4, 65.3, 20, 86.4, 41.2],
    [detections[6], 72.6, 'HIGH_RISK', 88, 0, 0, 44.5, 18, 52, 33.4]
  ].map(([detection, finalScore, riskCategory, priority, density, fragmentScore, propagationScore, mutationScore, historyScore, monetizationScore], index) => ({
    id: id('risk', index + 1),
    detectionId: detection.id,
    similarityScore: detection.confidenceScore,
    highlightPriorityScore: priority,
    highlightDensityScore: density,
    fragmentStitchingScore: fragmentScore,
    propagationVelocityScore: propagationScore,
    mutationScore,
    accountHistoryScore: historyScore,
    monetizationSignalScore: monetizationScore,
    finalScore,
    riskCategory,
    riskMeaning: riskMeaning[riskCategory],
    explainability: { source: 'local-demo-file-db' },
    createdAt: iso(15 - index),
    updatedAt: iso(15 - index)
  }));

  const evidencePackets = [
    {
      id: 'evidence_001',
      evidenceId: 'evd_seed_goal_critical',
      detectionId: detections[0].id,
      officialAssetId: assets[0].id,
      detectedUrl: crawledMedia[0].detectedUrl,
      platform: crawledMedia[0].platform,
      accountName: crawledMedia[0].accountName,
      matchedFrames: detections[0].matchedFrames,
      matchedTimestampRange: detections[0].matchedTimestampRange,
      similarityScore: detections[0].similarityScore,
      riskScore: riskScores[0].finalScore,
      riskCategory: riskScores[0].riskCategory,
      highlightDensityScore: 59.26,
      fragmentStitchingScore: 0,
      propagationSummary: propagationEvents[0],
      mutationLineage: mutationNodes,
      reasonForFlagging: 'High-confidence copied final goal clip with viral cross-platform propagation and monetized account behavior.',
      recommendedAction: 'ESCALATE_LEGAL',
      reviewStatus: 'PENDING_REVIEW',
      packetPayload: { humanReviewRequired: true, note: 'No automated takedown is performed.' },
      createdAt: iso(12),
      updatedAt: iso(12)
    },
    {
      id: 'evidence_002',
      evidenceId: 'evd_seed_fragment_package',
      detectionId: detections[3].id,
      officialAssetId: assets[2].id,
      detectedUrl: crawledMedia[3].detectedUrl,
      platform: crawledMedia[3].platform,
      accountName: crawledMedia[3].accountName,
      matchedFrames: detections[3].matchedFrames,
      matchedTimestampRange: detections[3].matchedTimestampRange,
      similarityScore: detections[3].similarityScore,
      riskScore: riskScores[2].finalScore,
      riskCategory: riskScores[2].riskCategory,
      highlightDensityScore: 83.33,
      fragmentStitchingScore: 93.4,
      propagationSummary: { spikeDetected: false, reason: 'Concentrated fragment spread detected.' },
      mutationLineage: [],
      reasonForFlagging: fragmentStitchingCases[0].stitchingRiskReason,
      recommendedAction: 'PREPARE_TAKEDOWN',
      reviewStatus: 'UNDER_INVESTIGATION',
      packetPayload: { humanReviewRequired: true, note: 'Analyst review required before external action.' },
      createdAt: iso(9),
      updatedAt: iso(9)
    }
  ];

  const reviewCases = [
    {
      id: 'review_001',
      evidencePacketId: evidencePackets[0].id,
      status: 'PENDING_REVIEW',
      assignedToId: users[1].id,
      priority: 'CRITICAL_RISK',
      decisionSummary: null,
      createdAt: iso(11),
      updatedAt: iso(11)
    },
    {
      id: 'review_002',
      evidencePacketId: evidencePackets[1].id,
      status: 'UNDER_INVESTIGATION',
      assignedToId: users[1].id,
      priority: 'CRITICAL_RISK',
      decisionSummary: 'Checking partner exceptions before recommendation.',
      createdAt: iso(8),
      updatedAt: iso(8)
    }
  ];

  return {
    meta: { generatedAt: now.toISOString(), mode: 'local-file-demo' },
    organizations: [organization],
    users,
    assets,
    fingerprints,
    crawledMedia,
    detections,
    accountIntelligence,
    fragmentStitchingCases,
    propagationEvents,
    mutationNodes,
    riskScores,
    evidencePackets,
    reviewCases,
    reviewComments: [
      {
        id: 'comment_001',
        reviewCaseId: reviewCases[1].id,
        authorId: users[1].id,
        comment: 'Fragment timeline reconstructs a meaningful portion of the official package. No license found yet.',
        createdAt: iso(7)
      }
    ],
    notifications: [
      {
        id: 'notification_001',
        userId: users[1].id,
        type: 'CRITICAL_RISK_ALERT',
        title: 'Critical evidence packet ready',
        body: 'Final goal evidence packet has been routed for human review.',
        readAt: null,
        metadata: { evidenceId: evidencePackets[0].evidenceId, reviewCaseId: reviewCases[0].id },
        createdAt: iso(10)
      }
    ],
    auditLogs: [],
    systemLogs: [
      {
        id: 'system_log_001',
        level: 'info',
        source: 'local-seed',
        message: 'Local HighlightGuard AI demo database seeded successfully',
        context: { assets: assets.length, detections: detections.length },
        createdAt: now.toISOString()
      }
    ]
  };
};

const seedLocal = async () => {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = await createLocalSeed();
  fs.writeFileSync(dbFile, JSON.stringify(db, null, 2));
  console.log(`Local demo database written to ${dbFile}`);
  console.log('Admin: admin@highlightguard.ai / Admin@123');
  console.log('Analyst: analyst@highlightguard.ai / Analyst@123');
  console.log('Creator: creator@highlightguard.ai / Creator@123');
  return db;
};

if (require.main === module) {
  seedLocal().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { createLocalSeed, seedLocal, dbFile };
