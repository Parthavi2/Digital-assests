const { prisma } = require('../config/db');
const logger = require('../utils/logger');

const recordAudit = async ({
  actorId,
  action,
  entityType,
  entityId,
  metadata,
  req
}) => {
  try {
    return await prisma.auditLog.create({
      data: {
        actorId: actorId || null,
        action,
        entityType,
        entityId: entityId || null,
        metadata: metadata || {},
        ipAddress: req?.ip,
        userAgent: req?.headers?.['user-agent']
      }
    });
  } catch (error) {
    logger.warn('Audit log write failed: %s', error.message);
    return null;
  }
};

module.exports = { recordAudit };
