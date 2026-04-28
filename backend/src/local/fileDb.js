const fs = require('fs');
const path = require('path');
const { createLocalSeed, dbFile } = require('../seed/localSeed');

const dataDir = path.dirname(dbFile);

const ensureLocalDb = async () => {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dbFile)) {
    const db = await createLocalSeed();
    fs.writeFileSync(dbFile, JSON.stringify(db, null, 2));
    return db;
  }

  return readDb();
};

const readDb = () => JSON.parse(fs.readFileSync(dbFile, 'utf8'));

const writeDb = (db) => {
  db.meta = {
    ...(db.meta || {}),
    updatedAt: new Date().toISOString()
  };
  fs.writeFileSync(dbFile, JSON.stringify(db, null, 2));
  return db;
};

const uid = (prefix) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const paginate = (items, query = {}) => {
  const page = Math.max(parseInt(query.page || '1', 10), 1);
  const limit = Math.min(Math.max(parseInt(query.limit || '20', 10), 1), 100);
  const start = (page - 1) * limit;
  return {
    items: items.slice(start, start + limit),
    meta: {
      page,
      limit,
      total: items.length,
      totalPages: Math.ceil(items.length / limit) || 1
    }
  };
};

const publicUser = (user) => {
  if (!user) return null;
  const { passwordHash, ...safe } = user;
  return safe;
};

const riskRank = {
  LOW_RISK: 1,
  MEDIUM_RISK: 2,
  HIGH_RISK: 3,
  CRITICAL_RISK: 4
};

const riskFromScore = (score) => {
  if (score <= 30) return 'LOW_RISK';
  if (score <= 60) return 'MEDIUM_RISK';
  if (score <= 85) return 'HIGH_RISK';
  return 'CRITICAL_RISK';
};

const riskMeaning = {
  LOW_RISK: 'fan edit, meme, short transformative content',
  MEDIUM_RISK: 'repeated partial reuse',
  HIGH_RISK: 'copied highlights, monetized misuse, suspicious account',
  CRITICAL_RISK: 'viral spread, fragment stitching, organized misuse'
};

module.exports = {
  ensureLocalDb,
  readDb,
  writeDb,
  uid,
  paginate,
  publicUser,
  riskRank,
  riskFromScore,
  riskMeaning,
  dbFile
};
