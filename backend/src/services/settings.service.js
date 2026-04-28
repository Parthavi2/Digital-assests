const bcrypt = require('bcryptjs');
const { randomBytes } = require('crypto');
const { prisma } = require('../config/db');
const ApiError = require('../utils/ApiError');
const { recordAudit } = require('./audit.service');
const { sanitizeUser } = require('./auth.service');

const getProfile = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { organization: true, notifications: { orderBy: { createdAt: 'desc' }, take: 20 } }
  });
  return sanitizeUser(user);
};

const updateProfile = async (userId, payload, req = null) => {
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(payload.name ? { name: payload.name } : {}),
      ...(payload.email ? { email: payload.email.toLowerCase() } : {}),
      ...(payload.profile ? { profile: payload.profile } : {})
    },
    include: { organization: true }
  });

  await recordAudit({
    actorId: userId,
    action: 'PROFILE_UPDATED',
    entityType: 'User',
    entityId: userId,
    metadata: payload,
    req
  });

  return sanitizeUser(user);
};

const getOrganizationSettings = async (user) => {
  if (!user.organizationId) throw new ApiError(404, 'User is not attached to an organization');

  return prisma.organization.findUnique({
    where: { id: user.organizationId },
    include: {
      users: {
        select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true }
      },
      apiKeys: {
        select: { id: true, keyId: true, label: true, scopes: true, lastUsedAt: true, createdAt: true, revokedAt: true }
      }
    }
  });
};

const updateOrganizationSettings = async (user, payload, req = null) => {
  if (!user.organizationId) throw new ApiError(404, 'User is not attached to an organization');

  const organization = await prisma.organization.update({
    where: { id: user.organizationId },
    data: payload,
    include: {
      users: {
        select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true }
      },
      apiKeys: {
        select: { id: true, keyId: true, label: true, scopes: true, lastUsedAt: true, createdAt: true, revokedAt: true }
      }
    }
  });

  await recordAudit({
    actorId: user.id,
    action: 'ORGANIZATION_SETTINGS_UPDATED',
    entityType: 'Organization',
    entityId: user.organizationId,
    metadata: payload,
    req
  });

  return organization;
};

const getNotificationPreferences = async (user) => {
  const organization = await getOrganizationSettings(user);
  return organization.notificationPreferences || {};
};

const updateNotificationPreferences = async (user, payload, req = null) => {
  if (!user.organizationId) throw new ApiError(404, 'User is not attached to an organization');

  const organization = await prisma.organization.update({
    where: { id: user.organizationId },
    data: { notificationPreferences: payload }
  });

  await recordAudit({
    actorId: user.id,
    action: 'NOTIFICATION_PREFERENCES_UPDATED',
    entityType: 'Organization',
    entityId: user.organizationId,
    metadata: payload,
    req
  });

  return organization.notificationPreferences;
};

const createApiKey = async (user, label, scopes = ['dashboard:read']) => {
  if (!user.organizationId) throw new ApiError(404, 'User is not attached to an organization');

  const rawKey = `hg_${randomBytes(24).toString('hex')}`;
  const keyId = `key_${randomBytes(8).toString('hex')}`;
  const hashedKey = await bcrypt.hash(rawKey, 12);

  const apiKey = await prisma.apiKey.create({
    data: {
      keyId,
      hashedKey,
      label,
      scopes,
      organizationId: user.organizationId,
      createdById: user.id
    }
  });

  return {
    apiKey: {
      id: apiKey.id,
      keyId: apiKey.keyId,
      label: apiKey.label,
      scopes: apiKey.scopes,
      createdAt: apiKey.createdAt
    },
    secret: rawKey
  };
};

module.exports = {
  getProfile,
  updateProfile,
  getOrganizationSettings,
  updateOrganizationSettings,
  getNotificationPreferences,
  updateNotificationPreferences,
  createApiKey
};
