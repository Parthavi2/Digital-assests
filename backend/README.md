# HighlightGuard AI Backend

HighlightGuard AI is a sports media protection backend that detects unauthorized reuse of official highlights, tracks propagation and mutations, scores risk, generates evidence packets, and routes every action through human review.

## Stack

- Node.js and Express.js
- PostgreSQL with Prisma ORM
- MongoDB for raw crawl and media intelligence payloads
- Redis for cache, counters, and BullMQ queues
- BullMQ background workers for fingerprinting, crawling, matching, and risk scoring
- JWT, bcrypt-compatible hashing, RBAC, audit logs
- Multer uploads with media validation
- FFmpeg/OpenCV, FAISS/Milvus, and Neo4j service placeholders
- Winston structured logging
- Zod validation, Helmet, CORS, rate limiting

## Quick Start Without Docker

Use this mode for hackathon demos and frontend integration when Docker/PostgreSQL are not available. It uses `data/local-demo-db.json` as a local JSON database and exposes the same API shape.

```bash
cd highlightguard-ai/backend
cp .env.example .env
npm install
npm run seed:local
npm run dev:local
```

The API runs at `http://localhost:5000`.

The local prototype is connected end-to-end: uploading an asset stores it, generates a fingerprint, searches YouTube with `YOUTUBE_API_KEY`, stores real YouTube search results as crawled media, runs simulated matching/risk intelligence, creates evidence packets for high or critical risk, and opens human review cases.

Health check:

```bash
curl http://localhost:5000/health
```

## Production Stack Quick Start

```bash
cd highlightguard-ai/backend
cp .env.example .env
npm install
npx prisma generate
npx prisma db push
npm run seed
npm run dev
```

Run `npx prisma db push` again after pulling these changes because the Prisma schema now includes uploaded file path, duration seconds, crawler asset guess, fingerprint aliases, and risk action/reason fields.

Or run the full local stack:

```bash
docker compose up --build
```

The API runs at `http://localhost:5000`.

## Demo Credentials

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@highlightguard.ai` | `Admin@123` |
| Analyst | `analyst@highlightguard.ai` | `Analyst@123` |
| Creator/Partner | `creator@highlightguard.ai` | `Creator@123` |

## API Key Configuration

Create `backend/.env` from `.env.example` and fill in your own values. Do not commit real secrets.

Required backend values:

```env
PORT=5000
JWT_SECRET=your_jwt_secret
DATABASE_URL=your_postgresql_url
YOUTUBE_API_KEY=your_youtube_api_key
REDIS_URL=your_redis_url
UPLOAD_DIR=uploads
NODE_ENV=development
```

`YOUTUBE_API_KEY` must be a real YouTube Data API v3 key for crawling. If it is missing or still set to a placeholder, upload and crawler workflows return a clear configuration error instead of fabricating YouTube results.

## Main Flow

1. Log in and receive a JWT.
2. Upload official sports highlights as an admin.
3. Upload status moves from `UPLOADED` to `PROCESSING` to `FINGERPRINT_READY`.
4. The backend searches YouTube using match name, teams, sport, and highlight category.
5. Real YouTube results are stored as crawled media records.
6. Simulated audio/video/hash matching creates detection results with confidence scores.
7. Highlight priority, account density, fragment stitching, propagation, and mutation signals feed risk scoring.
8. High or critical risk detections generate evidence packets and human review cases.
9. The dashboard refreshes from backend APIs only.

## Frontend Integration

The React/Next.js dashboard should not keep hardcoded mock arrays. Use seed data only for demo startup, then hydrate every page from API responses:

- Overview cards and charts: `GET /api/dashboard/summary`, `/risk-distribution`, `/platform-detections`, `/timeline`, `/top-accounts`
- Detection feed: `GET /api/matching/results`
- Upload pipeline: `POST /api/assets/upload`, then `GET /api/fingerprints/status/:assetId`
- Propagation graph: `GET /api/propagation/:assetId`
- Mutation tree: `GET /api/mutations/:assetId`
- Fragment stitching: `GET /api/fragments` and `POST /api/fragments/analyze`
- Highlight density: `GET /api/accounts/intelligence`
- Evidence packets: `GET /api/evidence`
- Human review kanban: `GET /api/reviews`
- Settings: `GET /api/settings/profile`, `/organization`, `/notifications`

## API Groups

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `POST /api/assets/upload`
- `GET /api/assets`
- `GET /api/assets/:id`
- `PUT /api/assets/:id`
- `DELETE /api/assets/:id`
- `POST /api/fingerprints/generate/:assetId`
- `GET /api/fingerprints/:assetId`
- `GET /api/fingerprints/status/:assetId`
- `POST /api/crawler/start`
- `GET /api/crawler/jobs`
- `GET /api/crawler/results`
- `GET /api/crawler/results/:id`
- `POST /api/matching/run/:crawledMediaId`
- `GET /api/matching/results`
- `GET /api/matching/results/:id`
- `GET /api/accounts/intelligence`
- `GET /api/accounts/:id/highlight-density`
- `GET /api/accounts/top-risky`
- `GET /api/fragments`
- `GET /api/fragments/:accountId`
- `POST /api/fragments/analyze`
- `GET /api/propagation`
- `GET /api/propagation/:assetId`
- `GET /api/propagation/spikes`
- `GET /api/mutations`
- `GET /api/mutations/:assetId`
- `POST /api/mutations/build-tree`
- `POST /api/risk/calculate/:detectionId`
- `GET /api/risk/results`
- `GET /api/risk/summary`
- `POST /api/evidence/generate/:detectionId`
- `GET /api/evidence`
- `GET /api/evidence/:id`
- `GET /api/evidence/:id/download`
- `GET /api/reviews`
- `GET /api/reviews/:id`
- `PUT /api/reviews/:id/status`
- `POST /api/reviews/:id/comment`
- `PUT /api/reviews/:id/assign`
- `GET /api/dashboard/summary`
- `GET /api/dashboard/risk-distribution`
- `GET /api/dashboard/platform-detections`
- `GET /api/dashboard/timeline`
- `GET /api/dashboard/top-accounts`
- `GET /api/settings/profile`
- `PUT /api/settings/profile`
- `GET /api/settings/organization`
- `PUT /api/settings/organization`
- `GET /api/settings/notifications`
- `PUT /api/settings/notifications`

## Health Check

`GET /health` returns API, PostgreSQL, MongoDB, Redis, and queue status.

## Notes For Production

The media AI integrations are deliberately structured placeholders. Replace `src/services/mediaProcessing.service.js`, `src/config/vectorDb.js`, and `src/config/neo4j.js` with real FFmpeg/OpenCV, FAISS/Milvus, and graph implementations without changing the route contracts.
