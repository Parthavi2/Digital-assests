const router = require('express').Router();
const controller = require('../controllers/settings.controller');
const validate = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth');
const { ROLES } = require('../constants/roles');
const { settingsSchemas } = require('../validators');

router.use(authenticate);

router.get('/profile', controller.profile);
router.put('/profile', validate(settingsSchemas.profile), controller.updateProfile);
router.get('/organization', controller.organization);
router.put('/organization', authorize(ROLES.ADMIN), validate(settingsSchemas.organization), controller.updateOrganization);
router.get('/notifications', controller.notifications);
router.put('/notifications', authorize(ROLES.ADMIN), validate(settingsSchemas.notifications), controller.updateNotifications);

module.exports = router;
