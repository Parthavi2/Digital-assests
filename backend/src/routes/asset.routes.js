const router = require('express').Router();
const controller = require('../controllers/asset.controller');
const validate = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth');
const { upload } = require('../config/storage');
const { ROLES } = require('../constants/roles');
const { assetSchemas, paramsSchemas } = require('../validators');

router.use(authenticate);

router.post('/upload', authorize(ROLES.ADMIN), upload.single('media'), controller.uploadAsset);
router.get('/', validate(paramsSchemas.list), controller.listAssets);
router.get('/:id', validate(paramsSchemas.id), controller.getAsset);
router.put('/:id', authorize(ROLES.ADMIN), validate(assetSchemas.update), controller.updateAsset);
router.delete('/:id', authorize(ROLES.ADMIN), validate(paramsSchemas.id), controller.deleteAsset);

module.exports = router;
