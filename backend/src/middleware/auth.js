const jwt = require('jsonwebtoken');
const { prisma } = require('../config/db');
const { redis } = require('../config/redis');
const ApiError = require('../utils/ApiError');

const authenticate = async (req, _res, next) => {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
      throw new ApiError(401, 'Authentication token is required');
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const blacklisted = await redis.get(`auth:blacklist:${payload.jti}`);
    if (blacklisted) {
      throw new ApiError(401, 'Token has been revoked');
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: { organization: true }
    });

    if (!user || !user.isActive) {
      throw new ApiError(401, 'User is not active');
    }

    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      organizationId: user.organizationId,
      organization: user.organization,
      tokenJti: payload.jti
    };

    next();
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }

    return next(new ApiError(401, 'Invalid or expired token'));
  }
};

const authorize = (...roles) => (req, _res, next) => {
  if (!req.user) {
    return next(new ApiError(401, 'Authentication is required'));
  }

  if (!roles.includes(req.user.role)) {
    return next(new ApiError(403, 'You do not have permission to access this resource'));
  }

  next();
};

module.exports = {
  authenticate,
  authorize
};
