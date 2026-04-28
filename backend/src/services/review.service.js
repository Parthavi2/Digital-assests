const { prisma } = require('../config/db');
const ApiError = require('../utils/ApiError');
const { getPagination, buildPaginationMeta } = require('../utils/pagination');
const { recordAudit } = require('./audit.service');

const listReviews = async (query) => {
  const { page, limit, skip } = getPagination(query);
  const where = {};
  if (query.status) where.status = query.status;
  if (query.riskCategory) where.priority = query.riskCategory;

  const [items, total] = await Promise.all([
    prisma.reviewCase.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        assignedTo: true,
        evidencePacket: {
          include: {
            officialAsset: true,
            detection: { include: { crawledMedia: true } }
          }
        },
        comments: {
          include: { author: true },
          orderBy: { createdAt: 'desc' },
          take: 5
        }
      }
    }),
    prisma.reviewCase.count({ where })
  ]);

  return { items, meta: buildPaginationMeta(page, limit, total) };
};

const getReview = async (id) => {
  const review = await prisma.reviewCase.findUnique({
    where: { id },
    include: {
      assignedTo: true,
      evidencePacket: {
        include: {
          officialAsset: true,
          detection: { include: { crawledMedia: true, riskScores: true } }
        }
      },
      comments: {
        include: { author: true },
        orderBy: { createdAt: 'asc' }
      }
    }
  });

  if (!review) throw new ApiError(404, 'Review case not found');
  return review;
};

const updateReviewStatus = async (id, payload, user, req = null) => {
  const existing = await getReview(id);
  const review = await prisma.reviewCase.update({
    where: { id: existing.id },
    data: {
      status: payload.status,
      decisionSummary: payload.decisionSummary
    },
    include: {
      evidencePacket: true,
      assignedTo: true
    }
  });

  await prisma.evidencePacket.update({
    where: { id: existing.evidencePacketId },
    data: { reviewStatus: payload.status }
  });

  await recordAudit({
    actorId: user.id,
    action: 'REVIEW_STATUS_UPDATED',
    entityType: 'ReviewCase',
    entityId: review.id,
    metadata: payload,
    req
  });

  return getReview(review.id);
};

const addReviewComment = async (id, payload, user, req = null) => {
  await getReview(id);
  const comment = await prisma.reviewComment.create({
    data: {
      reviewCaseId: id,
      authorId: user.id,
      comment: payload.comment
    },
    include: { author: true }
  });

  await recordAudit({
    actorId: user.id,
    action: 'REVIEW_COMMENT_ADDED',
    entityType: 'ReviewCase',
    entityId: id,
    metadata: { commentId: comment.id },
    req
  });

  return comment;
};

const assignReviewer = async (id, payload, user, req = null) => {
  await getReview(id);
  const assignee = await prisma.user.findUnique({ where: { id: payload.assignedToId } });
  if (!assignee) throw new ApiError(404, 'Reviewer not found');

  const review = await prisma.reviewCase.update({
    where: { id },
    data: {
      assignedToId: assignee.id
    },
    include: {
      assignedTo: true,
      evidencePacket: true
    }
  });

  await prisma.notification.create({
    data: {
      userId: assignee.id,
      type: 'REVIEW_ASSIGNED',
      title: 'Review case assigned',
      body: `You have been assigned review case ${review.id}.`,
      metadata: { reviewCaseId: review.id }
    }
  });

  await recordAudit({
    actorId: user.id,
    action: 'REVIEW_ASSIGNED',
    entityType: 'ReviewCase',
    entityId: review.id,
    metadata: { assignedToId: assignee.id },
    req
  });

  return getReview(review.id);
};

module.exports = {
  listReviews,
  getReview,
  updateReviewStatus,
  addReviewComment,
  assignReviewer
};
