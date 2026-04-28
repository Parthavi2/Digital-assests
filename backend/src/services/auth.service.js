const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');
const { prisma } = require('../config/db');
const { redis } = require('../config/redis');
const ApiError = require('../utils/ApiError');
const { ROLES } = require('../constants/roles');
const { recordAudit } = require('./audit.service');

const sanitizeUser = (user) => {
  if (!user) return null;
  const { passwordHash, ...safeUser } = user;
  return safeUser;
};

const createSlug = (name) => name
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/(^-|-$)/g, '')
  .slice(0, 60);

const signToken = (user) => {
  const jti = randomUUID();
  const token = jwt.sign(
    {
      sub: user.id,
      role: user.role,
      organizationId: user.organizationId,
      jti
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

  return { token, jti };
};

const resolveRegistrationRole = async (requestedRole, actor) => {
  const userCount = await prisma.user.count();
  if (userCount === 0) {
    return requestedRole || ROLES.ADMIN;
  }

  if (actor?.role === ROLES.ADMIN) {
    return requestedRole || ROLES.CREATOR_PARTNER;
  }

  return ROLES.CREATOR_PARTNER;
};

const register = async (payload, actor = null, req = null) => {
  const existing = await prisma.user.findUnique({ where: { email: payload.email.toLowerCase() } });
  if (existing) {
    throw new ApiError(409, 'A user with this email already exists');
  }

  const role = await resolveRegistrationRole(payload.role, actor);
  const passwordHash = await bcrypt.hash(payload.password, Number(process.env.BCRYPT_SALT_ROUNDS || 12));

  const organizationName = payload.organizationName || 'HighlightGuard Demo League';
  const organizationSlug = payload.organizationSlug || createSlug(organizationName);

  const organization = await prisma.organization.upsert({
    where: { slug: organizationSlug },
    update: {},
    create: {
      name: organizationName,
      slug: organizationSlug,
      rightsTerritories: ['IN', 'US', 'GB'],
      notificationPreferences: {
        emailAlerts: true,
        criticalRiskAlerts: true,
        dailyDigest: true
      },
      securitySettings: {
        mfaRequiredForAdmins: false,
        sessionReviewDays: 30
      }
    }
  });

  const user = await prisma.user.create({
    data: {
      email: payload.email.toLowerCase(),
      passwordHash,
      name: payload.name,
      role,
      organizationId: organization.id,
      profile: {
        title: role === ROLES.ADMIN ? 'Rights Protection Admin' : 'Media Protection User'
      }
    },
    include: { organization: true }
  });

  await recordAudit({
    actorId: actor?.id || user.id,
    action: 'USER_REGISTERED',
    entityType: 'User',
    entityId: user.id,
    metadata: { role },
    req
  });

  return sanitizeUser(user);
};

const login = async ({ email, password }, req = null) => {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: { organization: true }
  });

  if (!user || !user.isActive) {
    throw new ApiError(401, 'Invalid credentials');
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    throw new ApiError(401, 'Invalid credentials');
  }

  const { token } = signToken(user);
  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
    include: { organization: true }
  });

  await recordAudit({
    actorId: user.id,
    action: 'USER_LOGIN',
    entityType: 'User',
    entityId: user.id,
    metadata: { email: user.email },
    req
  });

  return {
    token,
    user: sanitizeUser(updatedUser)
  };
};

const logout = async (user, req = null) => {
  if (user?.tokenJti) {
    const decodedTtl = Math.max(60, 7 * 24 * 60 * 60);
    await redis.set(`auth:blacklist:${user.tokenJti}`, '1', 'EX', decodedTtl);
  }

  await recordAudit({
    actorId: user?.id,
    action: 'USER_LOGOUT',
    entityType: 'User',
    entityId: user?.id,
    metadata: {},
    req
  });

  return { loggedOut: true };
};

const getCurrentUser = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { organization: true }
  });

  return sanitizeUser(user);
};

module.exports = {
  register,
  login,
  logout,
  getCurrentUser,
  sanitizeUser
};
