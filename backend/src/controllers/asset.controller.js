const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const ApiError = require('../utils/ApiError');
const assetService = require('../services/asset.service');

const requiredUploadFields = [
  'title',
  'matchName',
  'tournament',
  'sportType',
  'highlightCategory',
  'rightsOwner',
  'duration'
];

const uploadAsset = asyncHandler(async (req, res) => {
  const missing = requiredUploadFields.filter((field) => !req.body[field]);
  if (missing.length) {
    throw new ApiError(400, `Missing required fields: ${missing.join(', ')}`);
  }

  const asset = await assetService.uploadOfficialAsset(req.body, req.file, req.user, req);
  sendSuccess(res, asset, undefined, 201);
});

const listAssets = asyncHandler(async (req, res) => {
  const result = await assetService.listAssets(req.query, req.user);
  sendSuccess(res, result.items, result.meta);
});

const getAsset = asyncHandler(async (req, res) => {
  const asset = await assetService.getAssetById(req.params.id, req.user);
  sendSuccess(res, asset);
});

const updateAsset = asyncHandler(async (req, res) => {
  const asset = await assetService.updateAsset(req.params.id, req.validated.body, req.user, req);
  sendSuccess(res, asset);
});

const deleteAsset = asyncHandler(async (req, res) => {
  const result = await assetService.deleteAsset(req.params.id, req.user, req);
  sendSuccess(res, result);
});

module.exports = {
  uploadAsset,
  listAssets,
  getAsset,
  updateAsset,
  deleteAsset
};
