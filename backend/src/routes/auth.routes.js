const router = require('express').Router();
const controller = require('../controllers/auth.controller');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { authSchemas } = require('../validators');

router.post('/register', validate(authSchemas.register), controller.register);
router.post('/login', validate(authSchemas.login), controller.login);
router.get('/me', authenticate, controller.me);
router.post('/logout', authenticate, controller.logout);

module.exports = router;
