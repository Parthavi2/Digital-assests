const crypto = require('crypto');

const hashString = (value) => crypto
  .createHash('sha256')
  .update(String(value))
  .digest('hex');

const hashToUnit = (value) => {
  const hash = hashString(value).slice(0, 12);
  return parseInt(hash, 16) / 0xffffffffffff;
};

const scoreBetween = (seed, min, max, decimals = 2) => {
  const score = min + (hashToUnit(seed) * (max - min));
  return Number(score.toFixed(decimals));
};

module.exports = { hashString, hashToUnit, scoreBetween };
