const { randomUUID } = require('crypto');

const buildPublicId = (prefix) => `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 18)}`;

module.exports = { buildPublicId };
