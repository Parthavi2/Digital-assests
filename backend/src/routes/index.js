const router = require('express').Router();

router.use('/auth', require('./auth.routes'));
router.use('/assets', require('./asset.routes'));
router.use('/fingerprints', require('./fingerprint.routes'));
router.use('/crawler', require('./crawler.routes'));
router.use('/matching', require('./matching.routes'));
router.use('/accounts', require('./account.routes'));
router.use('/fragments', require('./fragment.routes'));
router.use('/propagation', require('./propagation.routes'));
router.use('/mutations', require('./mutation.routes'));
router.use('/risk', require('./risk.routes'));
router.use('/evidence', require('./evidence.routes'));
router.use('/reviews', require('./review.routes'));
router.use('/dashboard', require('./dashboard.routes'));
router.use('/settings', require('./settings.routes'));

module.exports = router;
