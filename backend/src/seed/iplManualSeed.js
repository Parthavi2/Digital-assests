const {
  ensureLocalDb,
  readDb,
  writeDb,
  uid
} = require('../local/fileDb');

const now = () => new Date().toISOString();

const officialIplHighlights = [
  {
    title: 'IPL 2024 M68: RCB vs CSK - Match Highlights',
    matchName: 'Royal Challengers Bengaluru vs Chennai Super Kings',
    tournament: 'Indian Premier League 2024',
    teams: ['Royal Challengers Bengaluru', 'Chennai Super Kings'],
    sportType: 'Cricket',
    highlightCategory: 'Final Moment',
    mediaUrl: 'https://www.iplt20.com/video/58064',
    thumbnailUrl: null,
    duration: 0
  },
  {
    title: 'IPL 2024 M29: MI vs CSK - Match Highlights',
    matchName: 'Mumbai Indians vs Chennai Super Kings',
    tournament: 'Indian Premier League 2024',
    teams: ['Mumbai Indians', 'Chennai Super Kings'],
    sportType: 'Cricket',
    highlightCategory: 'Six',
    mediaUrl: 'https://www.iplt20.com/video/54170/m29-mi-vs-csk--match-highlights',
    thumbnailUrl: null,
    duration: 0
  },
  {
    title: 'IPL 2024 M57: SRH vs LSG - Match Highlights',
    matchName: 'Sunrisers Hyderabad vs Lucknow Super Giants',
    tournament: 'Indian Premier League 2024',
    teams: ['Sunrisers Hyderabad', 'Lucknow Super Giants'],
    sportType: 'Cricket',
    highlightCategory: 'Six',
    mediaUrl: 'https://www.iplt20.com/video/57065/m57-srh-vs-lsg--match-highlights',
    thumbnailUrl: null,
    duration: 0
  },
  {
    title: 'IPL 2024 M01: CSK vs RCB - Match Highlights',
    matchName: 'Chennai Super Kings vs Royal Challengers Bengaluru',
    tournament: 'Indian Premier League 2024',
    teams: ['Chennai Super Kings', 'Royal Challengers Bengaluru'],
    sportType: 'Cricket',
    highlightCategory: 'Wicket',
    mediaUrl: 'https://www.iplt20.com/video/51508/m01-csk-vs-rcb--match-highlights',
    thumbnailUrl: null,
    duration: 0
  },
  {
    title: 'IPL 2024 M10: RCB vs KKR - Match Highlights',
    matchName: 'Royal Challengers Bengaluru vs Kolkata Knight Riders',
    tournament: 'Indian Premier League 2024',
    teams: ['Royal Challengers Bengaluru', 'Kolkata Knight Riders'],
    sportType: 'Cricket',
    highlightCategory: 'Wicket',
    mediaUrl: 'https://www.iplt20.com/video/52399',
    thumbnailUrl: null,
    duration: 0
  }
];

const seedIplManual = async () => {
  await ensureLocalDb();
  const db = readDb();
  const admin = db.users.find((user) => user.role === 'ADMIN') || db.users[0];
  const org = db.organizations[0];
  const created = [];

  db.assets ||= [];
  db.auditLogs ||= [];

  officialIplHighlights.forEach((item) => {
    const existing = db.assets.find((asset) => asset.mediaUrl === item.mediaUrl);
    if (existing) return;

    const asset = {
      id: uid('asset_db'),
      assetId: uid('asset_ipl'),
      title: item.title,
      matchName: item.matchName,
      tournament: item.tournament,
      teams: item.teams,
      sportType: item.sportType,
      highlightCategory: item.highlightCategory,
      rightsOwner: 'Indian Premier League / BCCI',
      allowedUsagePolicy: {
        source: 'Official IPLT20 public highlight page',
        downloadStored: false,
        note: 'URL-only seed. Video files are not downloaded or redistributed.'
      },
      mediaUrl: item.mediaUrl,
      thumbnailUrl: item.thumbnailUrl,
      duration: item.duration,
      uploadStatus: 'METADATA_ONLY',
      fingerprintStatus: 'NOT_GENERATED',
      uploadedById: admin?.id || null,
      organizationId: org?.id || null,
      assetFamily: item.matchName,
      workflowStatus: 'OFFICIAL_URL_BOOKMARKED',
      workflowSummary: {
        source: 'manual-official-ipl-url',
        downloadStored: false,
        fingerprintGenerated: false
      },
      createdAt: now(),
      updatedAt: now()
    };

    db.assets.push(asset);
    db.auditLogs.push({
      id: uid('audit'),
      actorId: admin?.id || null,
      action: 'MANUAL_IPL_OFFICIAL_ASSET_ADDED',
      entityType: 'OfficialAsset',
      entityId: asset.id,
      metadata: { mediaUrl: asset.mediaUrl, note: 'Official URL only; no video download or fake fingerprint.' },
      createdAt: now()
    });
    created.push(asset);
  });

  writeDb(db);
  console.log(`Manual IPL assets added: ${created.length}`);
  created.forEach((asset) => console.log(`${asset.title} -> ${asset.mediaUrl}`));
  return created;
};

if (require.main === module) {
  seedIplManual().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { seedIplManual, officialIplHighlights };
