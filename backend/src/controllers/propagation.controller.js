const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const propagationService = require('../services/propagation.service');

const list = asyncHandler(async (req, res) => {
  const result = await propagationService.listPropagationEvents(req.query);
  sendSuccess(res, result.items, result.meta);
});

const byAsset = asyncHandler(async (req, res) => {
  const result = await propagationService.getPropagationByAsset(req.params.assetId);
  sendSuccess(res, result);
});

const spikes = asyncHandler(async (req, res) => {
  const result = await propagationService.getSpikeEvents(req.query);
  sendSuccess(res, result.items, result.meta);
});

module.exports = {
  list,
  byAsset,
  spikes
};
