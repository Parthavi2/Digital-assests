const router = require('express').Router();
const controller = require('../controllers/evidence.controller');
const validate = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth');
const { ROLES } = require('../constants/roles');
const { paramsSchemas } = require('../validators');

router.use(authenticate, authorize(ROLES.ADMIN, ROLES.ANALYST));

router.post('/generate/:detectionId', validate(paramsSchemas.detectionId), controller.generate);
router.get('/', validate(paramsSchemas.list), controller.list);
router.get('/:id/download', validate(paramsSchemas.id), controller.download);
router.get('/:id', validate(paramsSchemas.id), controller.byId);

module.exports = router;
