const router = require('express').Router();
const controller = require('../controllers/fingerprint.controller');
const validate = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth');
const { ROLES } = require('../constants/roles');
const { paramsSchemas } = require('../validators');

router.use(authenticate, authorize(ROLES.ADMIN, ROLES.ANALYST));

router.post('/generate/:assetId', validate(paramsSchemas.assetId), controller.generate);
router.get('/status/:assetId', validate(paramsSchemas.assetId), controller.getStatus);
router.get('/:assetId', validate(paramsSchemas.assetId), controller.getFingerprint);

module.exports = router;
