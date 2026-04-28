const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const crawlerService = require('../services/crawler.service');

const start = asyncHandler(async (req, res) => {
  const result = await crawlerService.startCrawl(req.validated.body, req.user, req);
  sendSuccess(res, result, undefined, 202);
});

const jobs = asyncHandler(async (_req, res) => {
  const result = await crawlerService.listCrawlerJobs();
  sendSuccess(res, result);
});

const results = asyncHandler(async (req, res) => {
  const result = await crawlerService.listCrawlerResults(req.query);
  sendSuccess(res, result.items, result.meta);
});

const resultById = asyncHandler(async (req, res) => {
  const result = await crawlerService.getCrawlerResult(req.params.id);
  sendSuccess(res, result);
});

module.exports = {
  start,
  jobs,
  results,
  resultById
};
