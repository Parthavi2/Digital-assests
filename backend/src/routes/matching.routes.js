const router = require('express').Router();
const controller = require('../controllers/matching.controller');
const validate = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth');
const { ROLES } = require('../constants/roles');
const { paramsSchemas } = require('../validators');

router.use(authenticate, authorize(ROLES.ADMIN, ROLES.ANALYST));

router.post('/run/:crawledMediaId', validate(paramsSchemas.crawledMediaId), controller.run);
router.get('/results', validate(paramsSchemas.list), controller.results);
router.get('/results/:id', validate(paramsSchemas.id), controller.resultById);

module.exports = router;
