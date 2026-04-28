const router = require('express').Router();
const controller = require('../controllers/fragment.controller');
const validate = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth');
const { ROLES } = require('../constants/roles');
const { fragmentSchemas, paramsSchemas } = require('../validators');

router.use(authenticate, authorize(ROLES.ADMIN, ROLES.ANALYST));

router.get('/', validate(paramsSchemas.list), controller.list);
router.post('/analyze', validate(fragmentSchemas.analyze), controller.analyze);
router.get('/:accountId', validate(paramsSchemas.accountId), controller.byAccount);

module.exports = router;
