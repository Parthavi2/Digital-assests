const router = require('express').Router();
const controller = require('../controllers/review.controller');
const validate = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth');
const { ROLES } = require('../constants/roles');
const { reviewSchemas, paramsSchemas } = require('../validators');

router.use(authenticate, authorize(ROLES.ADMIN, ROLES.ANALYST));

router.get('/', validate(paramsSchemas.list), controller.list);
router.get('/:id', validate(paramsSchemas.id), controller.byId);
router.put('/:id/status', validate(reviewSchemas.status), controller.updateStatus);
router.post('/:id/comment', validate(reviewSchemas.comment), controller.comment);
router.put('/:id/assign', validate(reviewSchemas.assign), controller.assign);

module.exports = router;
