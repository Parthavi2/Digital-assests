require('dotenv').config();

const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const now = new Date();
const minutesAgo = (minutes) => new Date(now.getTime() - minutes * 60 * 1000);
const daysAgo = (days) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

const embedding = (seed) => Array.from({ length: 48 }, (_, index) => {
  const raw = Math.sin((seed + index) * 12.9898) * 43758.5453;
  return Number(((raw - Math.floor(raw)) * 2 - 1).toFixed(6));
});

const frameHashes = (prefix) => Array.from({ length: 16 }, (_, index) => ({
  frameIndex: index,
  timestamp: index * 4.5,
  pHash: `${prefix}${String(index).padStart(2, '0')}a9c4f7`,
  dHash: `${prefix}${String(index).padStart(2, '0')}e1b8d2`
}));

const cleanDatabase = async () => {
  await prisma.reviewComment.deleteMany();
  await prisma.reviewCase.deleteMany();
  await prisma.evidencePacket.deleteMany();
  await prisma.riskScore.deleteMany();

  await prisma.mutationNode.updateMany({ data: { parentNodeId: null } });
  await prisma.mutationNode.deleteMany();

  await prisma.propagationEvent.deleteMany();
  await prisma.fragmentStitchingCase.deleteMany();
  await prisma.accountIntelligence.deleteMany();
  await prisma.detectionResult.deleteMany();
  await prisma.crawledMedia.deleteMany();
  await prisma.fingerprint.deleteMany();
  await prisma.officialAsset.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.systemLog.deleteMany();
  await prisma.apiKey.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
};

const seed = async () => {
  const existingAdmin = await prisma.user.findUnique({
    where: { email: 'admin@highlightguard.ai' }
  });

  if (existingAdmin) {
    console.log('Seed data already exists. Skipping production seed.');
    return;
  }

  await cleanDatabase();

  const organization = await prisma.organization.create({
    data: {
      name: 'HighlightGuard Demo League',
      slug: 'highlightguard-demo-league',
      domain: 'highlightguard.ai',
      rightsTerritories: ['IN', 'US', 'GB', 'AU'],
      notificationPreferences: {
        emailAlerts: true,
        criticalRiskAlerts: true,
        dailyDigest: true,
        webhookUrl: 'https://frontend-demo.highlightguard.ai/hooks/reviews'
      },
      securitySettings: {
        mfaRequiredForAdmins: false,
        allowedIpRanges: ['0.0.0.0/0'],
        reviewApprovalRequiredForHighRisk: true
      }
    }
  });

  const [adminHash, analystHash, creatorHash] = await Promise.all([
    bcrypt.hash('Admin@123', 12),
    bcrypt.hash('Analyst@123', 12),
    bcrypt.hash('Creator@123', 12)
  ]);

  const admin = await prisma.user.create({
    data: {
      email: 'admin@highlightguard.ai',
      passwordHash: adminHash,
      name: 'Aarav Rights Admin',
      role: 'ADMIN',
      organizationId: organization.id,
      profile: { title: 'Head of Broadcast Protection', timezone: 'Asia/Kolkata' }
    }
  });

  const analyst = await prisma.user.create({
    data: {
      email: 'analyst@highlightguard.ai',
      passwordHash: analystHash,
      name: 'Maya Review Analyst',
      role: 'ANALYST',
      organizationId: organization.id,
      profile: { title: 'Media Intelligence Analyst', queueFocus: 'high-risk detections' }
    }
  });

  const creator = await prisma.user.create({
    data: {
      email: 'creator@highlightguard.ai',
      passwordHash: creatorHash,
      name: 'Kabir Partner Creator',
      role: 'CREATOR_PARTNER',
      organizationId: organization.id,
      profile: { title: 'Licensed Partner', permittedUse: 'short attributed clips' }
    }
  });

  const assets = await Promise.all([
    prisma.officialAsset.create({
      data: {
        assetId: 'asset_goal_final_001',
        title: 'Last-Minute Final Goal',
        matchName: 'Mumbai Meteors vs Delhi Dynamos',
        tournament: 'Premier Football Cup 2026',
        teams: ['Mumbai Meteors', 'Delhi Dynamos'],
        sportType: 'Football',
        highlightCategory: 'Goal',
        rightsOwner: 'HighlightGuard Demo League',
        allowedUsagePolicy: {
          partnerClipsAllowedSeconds: 8,
          attributionRequired: true,
          monetizationAllowed: false,
          territories: ['IN', 'US']
        },
        mediaUrl: 'https://cdn.highlightguard.ai/official/mumbai-delhi-final-goal.mp4',
        thumbnailUrl: 'https://cdn.highlightguard.ai/thumbs/mumbai-delhi-final-goal.jpg',
        duration: 86,
        uploadStatus: 'READY',
        fingerprintStatus: 'COMPLETED',
        uploadedById: admin.id,
        organizationId: organization.id,
        assetFamily: 'mumbai-delhi-final'
      }
    }),
    prisma.officialAsset.create({
      data: {
        assetId: 'asset_wicket_semifinal_002',
        title: 'Hat-Trick Wicket Sequence',
        matchName: 'Bengal Tigers vs Chennai Kings',
        tournament: 'Continental Cricket League 2026',
        teams: ['Bengal Tigers', 'Chennai Kings'],
        sportType: 'Cricket',
        highlightCategory: 'Wicket',
        rightsOwner: 'HighlightGuard Demo League',
        allowedUsagePolicy: {
          partnerClipsAllowedSeconds: 6,
          attributionRequired: true,
          monetizationAllowed: false,
          territories: ['IN', 'GB', 'AU']
        },
        mediaUrl: 'https://cdn.highlightguard.ai/official/bengal-chennai-hattrick.mp4',
        thumbnailUrl: 'https://cdn.highlightguard.ai/thumbs/bengal-chennai-hattrick.jpg',
        duration: 112,
        uploadStatus: 'READY',
        fingerprintStatus: 'COMPLETED',
        uploadedById: admin.id,
        organizationId: organization.id,
        assetFamily: 'bengal-chennai-semifinal'
      }
    }),
    prisma.officialAsset.create({
      data: {
        assetId: 'asset_full_package_003',
        title: 'Full Match Highlight Package',
        matchName: 'Mumbai Meteors vs Delhi Dynamos',
        tournament: 'Premier Football Cup 2026',
        teams: ['Mumbai Meteors', 'Delhi Dynamos'],
        sportType: 'Football',
        highlightCategory: 'Full highlight package',
        rightsOwner: 'HighlightGuard Demo League',
        allowedUsagePolicy: {
          partnerClipsAllowedSeconds: 10,
          attributionRequired: true,
          monetizationAllowed: false,
          territories: ['IN', 'US', 'GB']
        },
        mediaUrl: 'https://cdn.highlightguard.ai/official/mumbai-delhi-full-package.mp4',
        thumbnailUrl: 'https://cdn.highlightguard.ai/thumbs/mumbai-delhi-full-package.jpg',
        duration: 420,
        uploadStatus: 'READY',
        fingerprintStatus: 'COMPLETED',
        uploadedById: admin.id,
        organizationId: organization.id,
        assetFamily: 'mumbai-delhi-final'
      }
    })
  ]);

  for (let index = 0; index < assets.length; index += 1) {
    const asset = assets[index];
    await prisma.fingerprint.create({
      data: {
        officialAssetId: asset.id,
        keyframeManifest: frameHashes(`kf${index}`).map((frame) => ({
          index: frame.frameIndex,
          timestamp: frame.timestamp,
          extractor: 'seeded-ffmpeg-placeholder',
          path: `generated/keyframes/${asset.assetId}/frame_${frame.frameIndex}.jpg`
        })),
        frameHashes: frameHashes(`fh${index}`),
        audioFingerprint: `audfp_seed_${asset.assetId}`,
        videoEmbedding: embedding(index + 11),
        audioEmbedding: embedding(index + 27),
        vectorIds: {
          videoVectorId: `faiss_video_${asset.id}`,
          audioVectorId: `faiss_audio_${asset.id}`
        },
        status: 'COMPLETED',
        processingLog: {
          seeded: true,
          pipeline: ['ffmpeg-placeholder', 'perceptual-hash', 'audio-fingerprint', 'embedding', 'vector-index']
        }
      }
    });
  }

  const crawled = await Promise.all([
    prisma.crawledMedia.create({
      data: {
        platform: 'YOUTUBE',
        detectedUrl: 'https://youtube.com/watch?v=hg-demo-goal-1',
        accountName: 'ClipRush Sports',
        accountHandle: '@cliprushsports',
        caption: 'Insane last minute Mumbai Meteors goal. Full broadcast angle.',
        hashtags: ['football', 'goal', 'highlights', 'mumbaimeteors'],
        uploadTimestamp: minutesAgo(42),
        views: 284000,
        likes: 19100,
        shares: 4200,
        mediaUrl: 'https://public-demo.highlightguard.ai/media/goal-repost-1.mp4',
        thumbnailUrl: 'https://public-demo.highlightguard.ai/thumbs/goal-repost-1.jpg',
        accountId: 'YOUTUBE:@cliprushsports',
        crawlTimestamp: minutesAgo(36)
      }
    }),
    prisma.crawledMedia.create({
      data: {
        platform: 'INSTAGRAM',
        detectedUrl: 'https://instagram.com/reel/hg-demo-goal-2',
        accountName: 'Reel Matchday',
        accountHandle: '@reelmatchday',
        caption: 'Mumbai vs Delhi final goal cropped for reels.',
        hashtags: ['reels', 'football', 'goal'],
        uploadTimestamp: minutesAgo(35),
        views: 612000,
        likes: 48200,
        shares: 12900,
        mediaUrl: 'https://public-demo.highlightguard.ai/media/goal-repost-2.mp4',
        thumbnailUrl: 'https://public-demo.highlightguard.ai/thumbs/goal-repost-2.jpg',
        accountId: 'INSTAGRAM:@reelmatchday',
        crawlTimestamp: minutesAgo(31)
      }
    }),
    prisma.crawledMedia.create({
      data: {
        platform: 'X_TWITTER',
        detectedUrl: 'https://x.com/livesportleaks/status/hg-demo-goal-3',
        accountName: 'LiveSportLeaks',
        accountHandle: '@livesportleaks',
        caption: 'Goal clip before official upload. Mirror while it lasts.',
        hashtags: ['football', 'leak', 'goal'],
        uploadTimestamp: minutesAgo(58),
        views: 171000,
        likes: 7300,
        shares: 5100,
        mediaUrl: 'https://public-demo.highlightguard.ai/media/goal-repost-3.mp4',
        thumbnailUrl: 'https://public-demo.highlightguard.ai/thumbs/goal-repost-3.jpg',
        accountId: 'X_TWITTER:@livesportleaks',
        crawlTimestamp: minutesAgo(52)
      }
    }),
    prisma.crawledMedia.create({
      data: {
        platform: 'TELEGRAM',
        detectedUrl: 'https://t.me/publicmatchclips/8821',
        accountName: 'Public Match Clips',
        accountHandle: '@publicmatchclips',
        caption: 'Seven part Mumbai Delhi final highlight pack, part 1.',
        hashtags: ['football', 'fullmatch', 'highlights'],
        uploadTimestamp: minutesAgo(24),
        views: 88000,
        likes: 1200,
        shares: 8400,
        mediaUrl: 'https://public-demo.highlightguard.ai/media/package-fragment-1.mp4',
        thumbnailUrl: 'https://public-demo.highlightguard.ai/thumbs/package-fragment-1.jpg',
        accountId: 'TELEGRAM:@publicmatchclips',
        crawlTimestamp: minutesAgo(21)
      }
    }),
    prisma.crawledMedia.create({
      data: {
        platform: 'TELEGRAM',
        detectedUrl: 'https://t.me/publicmatchclips/8822',
        accountName: 'Public Match Clips',
        accountHandle: '@publicmatchclips',
        caption: 'Seven part Mumbai Delhi final highlight pack, part 2.',
        hashtags: ['football', 'fullmatch', 'highlights'],
        uploadTimestamp: minutesAgo(20),
        views: 91000,
        likes: 1300,
        shares: 7900,
        mediaUrl: 'https://public-demo.highlightguard.ai/media/package-fragment-2.mp4',
        thumbnailUrl: 'https://public-demo.highlightguard.ai/thumbs/package-fragment-2.jpg',
        accountId: 'TELEGRAM:@publicmatchclips',
        crawlTimestamp: minutesAgo(18)
      }
    }),
    prisma.crawledMedia.create({
      data: {
        platform: 'TELEGRAM',
        detectedUrl: 'https://t.me/publicmatchclips/8823',
        accountName: 'Public Match Clips',
        accountHandle: '@publicmatchclips',
        caption: 'Seven part Mumbai Delhi final highlight pack, part 3.',
        hashtags: ['football', 'fullmatch', 'highlights'],
        uploadTimestamp: minutesAgo(16),
        views: 94000,
        likes: 1400,
        shares: 8200,
        mediaUrl: 'https://public-demo.highlightguard.ai/media/package-fragment-3.mp4',
        thumbnailUrl: 'https://public-demo.highlightguard.ai/thumbs/package-fragment-3.jpg',
        accountId: 'TELEGRAM:@publicmatchclips',
        crawlTimestamp: minutesAgo(13)
      }
    }),
    prisma.crawledMedia.create({
      data: {
        platform: 'FACEBOOK',
        detectedUrl: 'https://facebook.com/sportshighlightshub/videos/hg-demo-wicket',
        accountName: 'Sports Highlights Hub',
        accountHandle: '@sportshighlightshub',
        caption: 'Bengal Tigers hat trick wickets with music overlay.',
        hashtags: ['cricket', 'wicket', 'hattrick'],
        uploadTimestamp: minutesAgo(128),
        views: 233000,
        likes: 9700,
        shares: 3600,
        mediaUrl: 'https://public-demo.highlightguard.ai/media/wicket-repost-1.mp4',
        thumbnailUrl: 'https://public-demo.highlightguard.ai/thumbs/wicket-repost-1.jpg',
        accountId: 'FACEBOOK:@sportshighlightshub',
        crawlTimestamp: minutesAgo(120)
      }
    }),
    prisma.crawledMedia.create({
      data: {
        platform: 'WEBSITE',
        detectedUrl: 'https://highlight-mirror.example/blog/mumbai-delhi-final-compilation',
        accountName: 'Highlight Mirror Blog',
        accountHandle: 'highlight-mirror',
        caption: 'Embedded compilation of the full Mumbai Delhi highlight package.',
        hashtags: ['football', 'compilation', 'embed'],
        uploadTimestamp: minutesAgo(75),
        views: 47000,
        likes: 350,
        shares: 900,
        mediaUrl: 'https://public-demo.highlightguard.ai/media/full-package-embed.mp4',
        thumbnailUrl: 'https://public-demo.highlightguard.ai/thumbs/full-package-embed.jpg',
        accountId: 'WEBSITE:highlight-mirror',
        crawlTimestamp: minutesAgo(69)
      }
    })
  ]);

  const detectionRows = [
    [crawled[0], assets[0], 94.4, 88.2, 91.5, 93.1, 31, { start: 48, end: 79 }],
    [crawled[1], assets[0], 90.1, 84.5, 88.7, 89.8, 26, { start: 52, end: 78 }],
    [crawled[2], assets[0], 87.3, 81.2, 85.9, 86.1, 18, { start: 58, end: 76 }],
    [crawled[3], assets[2], 83.8, 79.6, 81.9, 84.4, 42, { start: 0, end: 42 }],
    [crawled[4], assets[2], 85.1, 80.9, 83.3, 85.7, 39, { start: 43, end: 82 }],
    [crawled[5], assets[2], 86.7, 82.4, 84.8, 87.6, 45, { start: 83, end: 128 }],
    [crawled[6], assets[1], 91.2, 86.1, 89.5, 90.7, 44, { start: 21, end: 65 }],
    [crawled[7], assets[2], 78.4, 74.9, 76.2, 80.1, 180, { start: 0, end: 180 }]
  ];

  const detections = [];
  for (let index = 0; index < detectionRows.length; index += 1) {
    const [media, asset, video, audio, frame, embeddingScore, duration, range] = detectionRows[index];
    const confidence = Number((video * 0.35 + audio * 0.30 + frame * 0.20 + embeddingScore * 0.15).toFixed(2));
    detections.push(await prisma.detectionResult.create({
      data: {
        detectionId: `det_seed_${String(index + 1).padStart(3, '0')}`,
        crawledMediaId: media.id,
        officialAssetId: asset.id,
        videoSimilarityScore: video,
        audioSimilarityScore: audio,
        frameHashSimilarity: frame,
        embeddingSimilarity: embeddingScore,
        similarityScore: confidence,
        confidenceScore: confidence,
        matchedDuration: duration,
        matchedTimestampRange: range,
        matchedFrames: Array.from({ length: 6 }, (_, frameIndex) => ({
          officialFrameIndex: frameIndex * 4,
          detectedFrameIndex: frameIndex * 4 + 1,
          similarity: 84 + frameIndex * 2
        })),
        matchedSegments: [{
          officialStart: range.start,
          officialEnd: range.end,
          detectedStart: 0,
          detectedEnd: duration
        }],
        detectionStatus: confidence >= 86 ? 'NEEDS_REVIEW' : 'MATCHED',
        createdAt: minutesAgo(65 - index * 6)
      }
    }));
  }

  await Promise.all([
    prisma.accountIntelligence.create({
      data: {
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
        signals: { pattern: 'fragment farming', monetization: 'channel subscription bait' }
      }
    }),
    prisma.accountIntelligence.create({
      data: {
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
        signals: { pattern: 'monetized highlight reposts' }
      }
    }),
    prisma.accountIntelligence.create({
      data: {
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
        signals: { pattern: 'short-form clipping' }
      }
    })
  ]);

  const fragmentCase = await prisma.fragmentStitchingCase.create({
    data: {
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
      firstFragmentAt: minutesAgo(24),
      lastFragmentAt: minutesAgo(6)
    }
  });

  const propagation = await prisma.propagationEvent.create({
    data: {
      officialAssetId: assets[0].id,
      repostCount: 14,
      viewVelocity: 48700,
      crossPlatformAppearances: 5,
      firstDetectedUnauthorizedUpload: minutesAgo(58),
      relatedAccounts: [
        'YOUTUBE:@cliprushsports',
        'INSTAGRAM:@reelmatchday',
        'X_TWITTER:@livesportleaks',
        'TELEGRAM:@publicmatchclips'
      ],
      timeToSpikeMinutes: 21,
      propagationVelocityScore: 91.8,
      viralRiskScore: 94.2,
      spikeDetected: true,
      spikeReason: 'Unauthorized final-goal clip crossed 1M estimated views across 5 platforms in under one hour.'
    }
  });

  const rootMutation = await prisma.mutationNode.create({
    data: {
      mutationId: 'mut_seed_root_goal',
      officialAssetId: assets[0].id,
      platform: 'WEBSITE',
      accountName: 'HighlightGuard Demo League',
      transformationType: 'ORIGINAL_HIGHLIGHT',
      similarityScore: 100,
      mutationScore: 0,
      timestamp: assets[0].createdAt,
      metadata: { source: 'official_asset' }
    }
  });

  const croppedMutation = await prisma.mutationNode.create({
    data: {
      mutationId: 'mut_seed_cropped_goal',
      parentNodeId: rootMutation.id,
      officialAssetId: assets[0].id,
      platform: 'INSTAGRAM',
      accountName: 'Reel Matchday',
      transformationType: 'CROPPED_VERSION',
      similarityScore: 90.1,
      mutationScore: 29.6,
      timestamp: minutesAgo(35),
      metadata: { detectedUrl: crawled[1].detectedUrl }
    }
  });

  await prisma.mutationNode.create({
    data: {
      mutationId: 'mut_seed_meme_goal',
      parentNodeId: croppedMutation.id,
      officialAssetId: assets[0].id,
      platform: 'X_TWITTER',
      accountName: 'LiveSportLeaks',
      transformationType: 'MEME_EDIT',
      similarityScore: 87.3,
      mutationScore: 43.2,
      timestamp: minutesAgo(29),
      metadata: { detectedUrl: crawled[2].detectedUrl }
    }
  });

  const riskScores = [];
  const riskRows = [
    [detections[0], 91.5, 'CRITICAL_RISK', 92, 59.26, 0, propagation.propagationVelocityScore, 31, 67.8, 72.4],
    [detections[1], 84.7, 'HIGH_RISK', 92, 51.43, 0, propagation.propagationVelocityScore, 42, 61.5, 82.1],
    [detections[3], 88.9, 'CRITICAL_RISK', 100, 83.33, fragmentCase.fragmentStitchingScore, 65.3, 20, 86.4, 41.2],
    [detections[6], 72.6, 'HIGH_RISK', 88, 0, 0, 44.5, 18, 52, 33.4]
  ];

  for (const [detection, finalScore, riskCategory, priority, density, fragmentScore, propagationScore, mutationScore, historyScore, monetizationScore] of riskRows) {
    riskScores.push(await prisma.riskScore.create({
      data: {
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
        riskMeaning: riskCategory === 'CRITICAL_RISK'
          ? 'viral spread, fragment stitching, organized misuse'
          : 'copied highlights, monetized misuse, suspicious account',
        explainability: {
          seeded: true,
          formula: 'weighted media intelligence risk score'
        }
      }
    }));
  }

  const evidenceOne = await prisma.evidencePacket.create({
    data: {
      evidenceId: 'evd_seed_goal_critical',
      detectionId: detections[0].id,
      officialAssetId: assets[0].id,
      detectedUrl: crawled[0].detectedUrl,
      platform: crawled[0].platform,
      accountName: crawled[0].accountName,
      matchedFrames: detections[0].matchedFrames,
      matchedTimestampRange: detections[0].matchedTimestampRange,
      similarityScore: detections[0].similarityScore,
      riskScore: riskScores[0].finalScore,
      riskCategory: riskScores[0].riskCategory,
      highlightDensityScore: 59.26,
      fragmentStitchingScore: 0,
      propagationSummary: {
        spikeDetected: true,
        viralRiskScore: propagation.viralRiskScore,
        spikeReason: propagation.spikeReason
      },
      mutationLineage: [
        { mutationId: 'mut_seed_root_goal', transformationType: 'ORIGINAL_HIGHLIGHT' },
        { mutationId: 'mut_seed_cropped_goal', transformationType: 'CROPPED_VERSION' }
      ],
      reasonForFlagging: 'High-confidence copied final goal clip with viral cross-platform propagation and monetized account behavior.',
      recommendedAction: 'ESCALATE_LEGAL',
      reviewStatus: 'PENDING_REVIEW',
      packetPayload: {
        generatedAt: now.toISOString(),
        humanReviewRequired: true,
        note: 'No automated takedown is performed.'
      }
    }
  });

  const evidenceTwo = await prisma.evidencePacket.create({
    data: {
      evidenceId: 'evd_seed_fragment_package',
      detectionId: detections[3].id,
      officialAssetId: assets[2].id,
      detectedUrl: crawled[3].detectedUrl,
      platform: crawled[3].platform,
      accountName: crawled[3].accountName,
      matchedFrames: detections[3].matchedFrames,
      matchedTimestampRange: detections[3].matchedTimestampRange,
      similarityScore: detections[3].similarityScore,
      riskScore: riskScores[2].finalScore,
      riskCategory: riskScores[2].riskCategory,
      highlightDensityScore: 83.33,
      fragmentStitchingScore: fragmentCase.fragmentStitchingScore,
      propagationSummary: {
        spikeDetected: false,
        reason: 'Fragment propagation is concentrated in Telegram but reconstructs high-value package content.'
      },
      mutationLineage: [],
      reasonForFlagging: fragmentCase.stitchingRiskReason,
      recommendedAction: 'PREPARE_TAKEDOWN',
      reviewStatus: 'UNDER_INVESTIGATION',
      packetPayload: {
        generatedAt: now.toISOString(),
        humanReviewRequired: true,
        note: 'Analyst review required before external action.'
      }
    }
  });

  const reviewOne = await prisma.reviewCase.create({
    data: {
      evidencePacketId: evidenceOne.id,
      status: 'PENDING_REVIEW',
      assignedToId: analyst.id,
      priority: 'CRITICAL_RISK'
    }
  });

  const reviewTwo = await prisma.reviewCase.create({
    data: {
      evidencePacketId: evidenceTwo.id,
      status: 'UNDER_INVESTIGATION',
      assignedToId: analyst.id,
      priority: 'CRITICAL_RISK',
      decisionSummary: 'Checking partner exceptions before recommendation.'
    }
  });

  await prisma.reviewComment.create({
    data: {
      reviewCaseId: reviewTwo.id,
      authorId: analyst.id,
      comment: 'Fragment timeline reconstructs a meaningful portion of the official package. No license found yet.'
    }
  });

  await prisma.notification.create({
    data: {
      userId: analyst.id,
      type: 'CRITICAL_RISK_ALERT',
      title: 'Critical evidence packet ready',
      body: 'Final goal evidence packet has been routed for human review.',
      metadata: { evidenceId: evidenceOne.evidenceId, reviewCaseId: reviewOne.id }
    }
  });

  await prisma.auditLog.createMany({
    data: [
      {
        actorId: admin.id,
        action: 'SEED_OFFICIAL_ASSETS_CREATED',
        entityType: 'OfficialAsset',
        metadata: { count: assets.length },
        createdAt: now
      },
      {
        actorId: analyst.id,
        action: 'SEED_REVIEW_CASE_CREATED',
        entityType: 'ReviewCase',
        entityId: reviewOne.id,
        metadata: { riskCategory: 'CRITICAL_RISK' },
        createdAt: now
      }
    ]
  });

  await prisma.systemLog.create({
    data: {
      level: 'info',
      source: 'seed',
      message: 'HighlightGuard AI demo data seeded successfully',
      context: {
        users: 3,
        assets: assets.length,
        crawledMedia: crawled.length,
        detections: detections.length,
        evidencePackets: 2
      }
    }
  });

  await prisma.apiKey.create({
    data: {
      keyId: 'key_demo_readonly',
      hashedKey: await bcrypt.hash('hg_demo_readonly_secret', 12),
      label: 'Demo Dashboard Read Only',
      scopes: ['dashboard:read', 'assets:read'],
      organizationId: organization.id,
      createdById: admin.id
    }
  });

  console.log('HighlightGuard AI seed completed.');
  console.log('Admin: admin@highlightguard.ai / Admin@123');
  console.log('Analyst: analyst@highlightguard.ai / Analyst@123');
  console.log('Creator: creator@highlightguard.ai / Creator@123');
};

seed()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
