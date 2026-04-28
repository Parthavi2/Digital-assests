const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const dashboardService = require('../services/dashboard.service');

const summary = asyncHandler(async (_req, res) => {
  sendSuccess(res, await dashboardService.getDashboardSummary());
});

const riskDistribution = asyncHandler(async (_req, res) => {
  sendSuccess(res, await dashboardService.getRiskDistribution());
});

const platformDetections = asyncHandler(async (_req, res) => {
  sendSuccess(res, await dashboardService.getPlatformDetections());
});

const timeline = asyncHandler(async (_req, res) => {
  sendSuccess(res, await dashboardService.getDetectionTimeline());
});

const topAccounts = asyncHandler(async (req, res) => {
  sendSuccess(res, await dashboardService.getTopAccounts(req.query));
});

module.exports = {
  summary,
  riskDistribution,
  platformDetections,
  timeline,
  topAccounts
};
