const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const reviewService = require('../services/review.service');

const list = asyncHandler(async (req, res) => {
  const result = await reviewService.listReviews(req.query);
  sendSuccess(res, result.items, result.meta);
});

const byId = asyncHandler(async (req, res) => {
  const result = await reviewService.getReview(req.params.id);
  sendSuccess(res, result);
});

const updateStatus = asyncHandler(async (req, res) => {
  const result = await reviewService.updateReviewStatus(req.params.id, req.validated.body, req.user, req);
  sendSuccess(res, result);
});

const comment = asyncHandler(async (req, res) => {
  const result = await reviewService.addReviewComment(req.params.id, req.validated.body, req.user, req);
  sendSuccess(res, result, undefined, 201);
});

const assign = asyncHandler(async (req, res) => {
  const result = await reviewService.assignReviewer(req.params.id, req.validated.body, req.user, req);
  sendSuccess(res, result);
});

module.exports = {
  list,
  byId,
  updateStatus,
  comment,
  assign
};
