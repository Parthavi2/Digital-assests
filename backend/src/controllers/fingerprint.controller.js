const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const fingerprintService = require('../services/fingerprint.service');

const generate = asyncHandler(async (req, res) => {
  const fingerprint = await fingerprintService.generateFingerprint(req.params.assetId);
  sendSuccess(res, fingerprint, undefined, 202);
});

const getFingerprint = asyncHandler(async (req, res) => {
  const fingerprint = await fingerprintService.getFingerprint(req.params.assetId);
  sendSuccess(res, fingerprint);
});

const getStatus = asyncHandler(async (req, res) => {
  const status = await fingerprintService.getFingerprintStatus(req.params.assetId);
  sendSuccess(res, status);
});

module.exports = {
  generate,
  getFingerprint,
  getStatus
};
