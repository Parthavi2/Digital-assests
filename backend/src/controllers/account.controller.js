const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const accountService = require('../services/accountIntelligence.service');

const intelligence = asyncHandler(async (req, res) => {
  const result = await accountService.listAccountIntelligence(req.query);
  sendSuccess(res, result.items, result.meta);
});

const density = asyncHandler(async (req, res) => {
  const result = await accountService.calculateHighlightDensity(req.params.accountId);
  sendSuccess(res, result);
});

const topRisky = asyncHandler(async (req, res) => {
  const result = await accountService.getTopRiskyAccounts(req.query);
  sendSuccess(res, result);
});

module.exports = {
  intelligence,
  density,
  topRisky
};
