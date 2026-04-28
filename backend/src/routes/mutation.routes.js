const router = require('express').Router();
const controller = require('../controllers/mutation.controller');
const validate = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth');
const { ROLES } = require('../constants/roles');
const { mutationSchemas, paramsSchemas } = require('../validators');

router.use(authenticate, authorize(ROLES.ADMIN, ROLES.ANALYST));

router.get('/', validate(paramsSchemas.list), controller.list);
router.post('/build-tree', validate(mutationSchemas.buildTree), controller.buildTree);
router.get('/:assetId', validate(paramsSchemas.assetId), controller.byAsset);

module.exports = router;
