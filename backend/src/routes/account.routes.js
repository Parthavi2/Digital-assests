const router = require('express').Router();
const controller = require('../controllers/account.controller');
const validate = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth');
const { ROLES } = require('../constants/roles');
const { paramsSchemas } = require('../validators');

router.use(authenticate, authorize(ROLES.ADMIN, ROLES.ANALYST));

router.get('/intelligence', validate(paramsSchemas.list), controller.intelligence);
router.get('/top-risky', validate(paramsSchemas.list), controller.topRisky);
router.get('/:accountId/highlight-density', validate(paramsSchemas.accountId), controller.density);

module.exports = router;
