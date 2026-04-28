const router = require('express').Router();
const controller = require('../controllers/dashboard.controller');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { paramsSchemas } = require('../validators');

router.use(authenticate);

router.get('/summary', controller.summary);
router.get('/risk-distribution', controller.riskDistribution);
router.get('/platform-detections', controller.platformDetections);
router.get('/timeline', controller.timeline);
router.get('/top-accounts', validate(paramsSchemas.list), controller.topAccounts);

module.exports = router;
