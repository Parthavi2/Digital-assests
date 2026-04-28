const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const matchingService = require('../services/matching.service');

const run = asyncHandler(async (req, res) => {
  const result = await matchingService.runMatching(req.params.crawledMediaId);
  sendSuccess(res, result, undefined, 202);
});

const results = asyncHandler(async (req, res) => {
  const result = await matchingService.listMatchingResults(req.query);
  sendSuccess(res, result.items, result.meta);
});

const resultById = asyncHandler(async (req, res) => {
  const result = await matchingService.getMatchingResult(req.params.id);
  sendSuccess(res, result);
});

module.exports = {
  run,
  results,
  resultById
};
