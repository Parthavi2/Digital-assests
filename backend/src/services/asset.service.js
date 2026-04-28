const path = require('path');
const { prisma } = require('../config/db');
const ApiError = require('../utils/ApiError');
const { buildPublicId } = require('../utils/ids');
const { getPagination, buildPaginationMeta } = require('../utils/pagination');
const { ROLES } = require('../constants/roles');
const {
  FINGERPRINT_STATUSES,
  UPLOAD_STATUSES
} = require('../constants/statuses');
const { enqueueFingerprintGeneration } = require('./fingerprint.service');
const { recordAudit } = require('./audit.service');

const parseJsonField = (value, fallback) => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch (_error) {
    return fallback;
  }
};

const parseTeamsField = (value) => {
  if (value === undefined || value === null || value === '') return [];
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return value.split(',').map((team) => team.trim()).filter(Boolean);
  }
};

const publicFileUrl = (file) => {
  if (!file) return null;
  return `${process.env.API_BASE_URL || 'http://localhost:5000'}/uploads/${path.basename(file.filename)}`;
};

const uploadOfficialAsset = async (body, file, user, req = null) => {
  const mediaUrl = publicFileUrl(file) || body.mediaUrl;
  if (!mediaUrl) {
    throw new ApiError(400, 'A media file or mediaUrl is required');
  }

  const teams = parseTeamsField(body.teams);
  const allowedUsagePolicy = parseJsonField(body.allowedUsagePolicy, {
    partnerClipsAllowedSeconds: 8,
    attributionRequired: true,
    monetizationAllowed: false,
    partnerVisible: true
  });

  const asset = await prisma.officialAsset.create({
    data: {
      assetId: buildPublicId('asset'),
      title: body.title,
      matchName: body.matchName,
      tournament: body.tournament,
      teams,
      sportType: body.sportType,
      highlightCategory: body.highlightCategory,
      rightsOwner: body.rightsOwner,
      allowedUsagePolicy,
      mediaUrl,
      thumbnailUrl: body.thumbnailUrl || null,
      duration: Number(body.duration || 0),
      durationSeconds: Math.round(Number(body.durationSeconds || body.duration || 0)),
      uploadedFilePath: file?.path || null,
      uploadStatus: UPLOAD_STATUSES.PROCESSING,
      fingerprintStatus: FINGERPRINT_STATUSES.QUEUED,
      uploadedById: user.id,
      organizationId: user.organizationId,
      assetFamily: body.assetFamily || body.matchName
    },
    include: {
      uploadedBy: {
        select: { id: true, name: true, email: true, role: true }
      }
    }
  });

  await enqueueFingerprintGeneration(asset.id);

  await recordAudit({
    actorId: user.id,
    action: 'OFFICIAL_ASSET_UPLOADED',
    entityType: 'OfficialAsset',
    entityId: asset.id,
    metadata: { assetId: asset.assetId, title: asset.title },
    req
  });

  return asset;
};

const buildAssetWhere = (query, user) => {
  const where = {};

  if (query.q) {
    where.OR = [
      { title: { contains: query.q, mode: 'insensitive' } },
      { matchName: { contains: query.q, mode: 'insensitive' } },
      { tournament: { contains: query.q, mode: 'insensitive' } }
    ];
  }

  if (query.status) {
    where.uploadStatus = query.status;
  }

  if (user.role === ROLES.CREATOR_PARTNER) {
    where.organizationId = user.organizationId || '__no_org__';
  }

  return where;
};

const listAssets = async (query, user) => {
  const { page, limit, skip } = getPagination(query);
  const where = buildAssetWhere(query, user);

  const [items, total] = await Promise.all([
    prisma.officialAsset.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        uploadedBy: { select: { id: true, name: true, email: true, role: true } },
        fingerprint: { select: { id: true, status: true, updatedAt: true } }
      }
    }),
    prisma.officialAsset.count({ where })
  ]);

  return { items, meta: buildPaginationMeta(page, limit, total) };
};

const getAssetById = async (id, user) => {
  const asset = await prisma.officialAsset.findFirst({
    where: {
      OR: [{ id }, { assetId: id }]
    },
    include: {
      uploadedBy: { select: { id: true, name: true, email: true, role: true } },
      fingerprint: true
    }
  });

  if (!asset) {
    throw new ApiError(404, 'Official asset not found');
  }

  if (user.role === ROLES.CREATOR_PARTNER && asset.organizationId !== user.organizationId) {
    throw new ApiError(403, 'You do not have access to this asset');
  }

  return asset;
};

const updateAsset = async (id, payload, user, req = null) => {
  const existing = await getAssetById(id, user);

  const asset = await prisma.officialAsset.update({
    where: { id: existing.id },
    data: payload,
    include: {
      uploadedBy: { select: { id: true, name: true, email: true, role: true } },
      fingerprint: true
    }
  });

  await recordAudit({
    actorId: user.id,
    action: 'OFFICIAL_ASSET_UPDATED',
    entityType: 'OfficialAsset',
    entityId: asset.id,
    metadata: payload,
    req
  });

  return asset;
};

const deleteAsset = async (id, user, req = null) => {
  const existing = await getAssetById(id, user);

  const asset = await prisma.officialAsset.update({
    where: { id: existing.id },
    data: { uploadStatus: UPLOAD_STATUSES.ARCHIVED }
  });

  await recordAudit({
    actorId: user.id,
    action: 'OFFICIAL_ASSET_ARCHIVED',
    entityType: 'OfficialAsset',
    entityId: asset.id,
    metadata: { assetId: asset.assetId },
    req
  });

  return { archived: true, assetId: asset.assetId };
};

module.exports = {
  uploadOfficialAsset,
  listAssets,
  getAssetById,
  updateAsset,
  deleteAsset,
  parseJsonField
};
