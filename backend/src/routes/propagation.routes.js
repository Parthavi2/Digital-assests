const router = require('express').Router();
const controller = require('../controllers/propagation.controller');
const validate = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth');
const { ROLES } = require('../constants/roles');
const { paramsSchemas } = require('../validators');

router.use(authenticate, authorize(ROLES.ADMIN, ROLES.ANALYST));

router.get('/', validate(paramsSchemas.list), controller.list);
router.get('/spikes', validate(paramsSchemas.list), controller.spikes);
router.get('/:assetId', validate(paramsSchemas.assetId), controller.byAsset);

module.exports = router;
