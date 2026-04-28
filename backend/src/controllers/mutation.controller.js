const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const mutationService = require('../services/mutation.service');

const list = asyncHandler(async (req, res) => {
  const result = await mutationService.listMutations(req.query);
  sendSuccess(res, result.items, result.meta);
});

const byAsset = asyncHandler(async (req, res) => {
  const result = await mutationService.getMutationsByAsset(req.params.assetId);
  sendSuccess(res, result);
});

const buildTree = asyncHandler(async (req, res) => {
  const result = await mutationService.buildMutationTree(req.validated.body.assetId);
  sendSuccess(res, result, undefined, 202);
});

module.exports = {
  list,
  byAsset,
  buildTree
};
