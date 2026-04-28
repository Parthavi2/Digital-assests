const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const riskService = require('../services/risk.service');

const calculate = asyncHandler(async (req, res) => {
  const result = await riskService.calculateRiskForDetection(req.params.detectionId);
  sendSuccess(res, result, undefined, 202);
});

const results = asyncHandler(async (req, res) => {
  const result = await riskService.listRiskResults(req.query);
  sendSuccess(res, result.items, result.meta);
});

const summary = asyncHandler(async (_req, res) => {
  const result = await riskService.getRiskSummary();
  sendSuccess(res, result);
});

module.exports = {
  calculate,
  results,
  summary
};
