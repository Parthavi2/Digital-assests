const router = require('express').Router();
const controller = require('../controllers/risk.controller');
const validate = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth');
const { ROLES } = require('../constants/roles');
const { paramsSchemas } = require('../validators');

router.use(authenticate, authorize(ROLES.ADMIN, ROLES.ANALYST));

router.post('/calculate/:detectionId', validate(paramsSchemas.detectionId), controller.calculate);
router.get('/results', validate(paramsSchemas.list), controller.results);
router.get('/summary', controller.summary);

module.exports = router;
