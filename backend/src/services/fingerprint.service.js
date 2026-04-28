const { prisma } = require('../config/db');
const { fingerprintQueue, addJob } = require('../config/queue');
const vectorDb = require('../config/vectorDb');
const ApiError = require('../utils/ApiError');
const {
  FINGERPRINT_STATUSES,
  UPLOAD_STATUSES
} = require('../constants/statuses');
const mediaProcessing = require('./mediaProcessing.service');

const findAsset = async (assetId) => prisma.officialAsset.findFirst({
  where: {
    OR: [
      { id: assetId },
      { assetId }
    ]
  }
});

const enqueueFingerprintGeneration = async (assetId) => {
  await prisma.officialAsset.update({
    where: { id: assetId },
    data: {
      fingerprintStatus: FINGERPRINT_STATUSES.QUEUED,
      uploadStatus: UPLOAD_STATUSES.PROCESSING
    }
  });

  return addJob(fingerprintQueue, 'generate-fingerprint', { assetId });
};

const generateFingerprint = async (assetId) => {
  const asset = await findAsset(assetId);
  if (!asset) {
    throw new ApiError(404, 'Official asset not found');
  }

  await prisma.officialAsset.update({
    where: { id: asset.id },
    data: {
      fingerprintStatus: FINGERPRINT_STATUSES.PROCESSING,
      uploadStatus: UPLOAD_STATUSES.PROCESSING
    }
  });

  try {
    const keyframes = await mediaProcessing.extractKeyframes(asset);
    const frameHashes = await mediaProcessing.generatePerceptualHashes(asset, keyframes);
    const audioFingerprint = await mediaProcessing.extractAudioFingerprint(asset);
    const videoEmbedding = await mediaProcessing.generateVideoEmbedding(asset);
    const audioEmbedding = await mediaProcessing.generateAudioEmbedding(asset);
    const vectorIds = await vectorDb.upsertAssetVectors(asset.id, {
      videoEmbedding,
      audioEmbedding
    });

    const fingerprint = await prisma.fingerprint.upsert({
      where: { officialAssetId: asset.id },
      update: {
        keyframeManifest: keyframes,
        frameHashes,
        frameHash: frameHashes.map((frame) => frame.pHash).join(':').slice(0, 255),
        audioFingerprint,
        audioHash: audioFingerprint,
        videoEmbedding,
        audioEmbedding,
        vectorIds,
        status: FINGERPRINT_STATUSES.COMPLETED,
        processingStatus: 'READY',
        processingLog: {
          steps: ['UPLOADED', 'EXTRACTING_FRAMES', 'AUDIO_FINGERPRINTING', 'EMBEDDING_GENERATED', 'READY'],
          aiProvider: 'placeholder-ready-for-opencv-ffmpeg-faiss'
        },
        generatedAt: new Date()
      },
      create: {
        officialAssetId: asset.id,
        keyframeManifest: keyframes,
        frameHashes,
        frameHash: frameHashes.map((frame) => frame.pHash).join(':').slice(0, 255),
        audioFingerprint,
        audioHash: audioFingerprint,
        videoEmbedding,
        audioEmbedding,
        vectorIds,
        status: FINGERPRINT_STATUSES.COMPLETED,
        processingStatus: 'READY',
        processingLog: {
          steps: ['UPLOADED', 'EXTRACTING_FRAMES', 'AUDIO_FINGERPRINTING', 'EMBEDDING_GENERATED', 'READY'],
          aiProvider: 'placeholder-ready-for-opencv-ffmpeg-faiss'
        },
        generatedAt: new Date()
      }
    });

    await prisma.officialAsset.update({
      where: { id: asset.id },
      data: {
        fingerprintStatus: FINGERPRINT_STATUSES.COMPLETED,
        uploadStatus: UPLOAD_STATUSES.READY
      }
    });

    return fingerprint;
  } catch (error) {
    await prisma.officialAsset.update({
      where: { id: asset.id },
      data: {
        fingerprintStatus: FINGERPRINT_STATUSES.FAILED,
        uploadStatus: UPLOAD_STATUSES.FAILED
      }
    });
    throw error;
  }
};

const getFingerprint = async (assetId) => {
  const asset = await findAsset(assetId);
  if (!asset) {
    throw new ApiError(404, 'Official asset not found');
  }

  const fingerprint = await prisma.fingerprint.findUnique({
    where: { officialAssetId: asset.id },
    include: { officialAsset: true }
  });

  if (!fingerprint) {
    throw new ApiError(404, 'Fingerprint has not been generated yet');
  }

  return fingerprint;
};

const getFingerprintStatus = async (assetId) => {
  const asset = await findAsset(assetId);
  if (!asset) {
    throw new ApiError(404, 'Official asset not found');
  }

  return {
    assetId: asset.assetId,
    uploadStatus: asset.uploadStatus,
    fingerprintStatus: asset.fingerprintStatus
  };
};

module.exports = {
  enqueueFingerprintGeneration,
  generateFingerprint,
  getFingerprint,
  getFingerprintStatus
};
