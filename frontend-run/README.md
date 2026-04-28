# HighlightGuard AI Frontend

Next.js dashboard for HighlightGuard AI. It reads all sports/media intelligence from the backend APIs and does not use hardcoded mock datasets.

## Run

Start backend first:

```powershell
cd C:\Users\Shrad\OneDrive\Desktop\coding\Highlights\highlightguard-ai\backend
Copy-Item .env.example .env
npm run seed:local
npm run dev:local
```

Start frontend:

```powershell
cd C:\Users\Shrad\OneDrive\Desktop\coding\Highlights\highlightguard-ai\frontend
Copy-Item .env.example .env.local
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

Demo credentials:

```text
admin@highlightguard.ai / Admin@123
analyst@highlightguard.ai / Analyst@123
creator@highlightguard.ai / Creator@123
```

## Environment

Frontend reads the backend URL from `.env.local`:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:5000/api
```

All dashboard cards, tables, charts, detections, evidence packets, and review cases are loaded from backend APIs. No real API keys belong in frontend env files.
