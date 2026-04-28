const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const fragmentService = require('../services/fragment.service');

const list = asyncHandler(async (req, res) => {
  const result = await fragmentService.listFragmentCases(req.query);
  sendSuccess(res, result.items, result.meta);
});

const byAccount = asyncHandler(async (req, res) => {
  const result = await fragmentService.getFragmentsByAccount(req.params.accountId);
  sendSuccess(res, result);
});

const analyze = asyncHandler(async (req, res) => {
  const result = await fragmentService.analyzeFragments(req.validated.body);
  sendSuccess(res, result, undefined, 202);
});

module.exports = {
  list,
  byAccount,
  analyze
};
