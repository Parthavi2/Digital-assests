const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const evidenceService = require('../services/evidence.service');

const generate = asyncHandler(async (req, res) => {
  const result = await evidenceService.generateEvidence(req.params.detectionId);
  sendSuccess(res, result, undefined, 201);
});

const list = asyncHandler(async (req, res) => {
  const result = await evidenceService.listEvidence(req.query);
  sendSuccess(res, result.items, result.meta);
});

const byId = asyncHandler(async (req, res) => {
  const result = await evidenceService.getEvidence(req.params.id);
  sendSuccess(res, result);
});

const download = asyncHandler(async (req, res) => {
  const { fileName, payload } = await evidenceService.downloadEvidence(req.params.id);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.status(200).json(payload);
});

module.exports = {
  generate,
  list,
  byId,
  download
};
