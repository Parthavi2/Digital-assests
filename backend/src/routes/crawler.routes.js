const router = require('express').Router();
const controller = require('../controllers/crawler.controller');
const validate = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth');
const { ROLES } = require('../constants/roles');
const { crawlerSchemas, paramsSchemas } = require('../validators');

router.use(authenticate, authorize(ROLES.ADMIN, ROLES.ANALYST));

router.post('/start', validate(crawlerSchemas.start), controller.start);
router.get('/jobs', controller.jobs);
router.get('/results', validate(paramsSchemas.list), controller.results);
router.get('/results/:id', validate(paramsSchemas.id), controller.resultById);

module.exports = router;
