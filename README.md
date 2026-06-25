# Flensa Calls Report (ANLY-327)

Fase 1 calls-only report for Flensa Mx. React + Vite frontend, Express BFF backend, read-only operations.

**Scope:** Twilio calls for destination numbers derived from the authenticated user's Pegasus resources/triggers. No alert correlation, vehicle info, or group hard-coding in Fase 1.

## Slice status

| Slice | Status |
|-------|--------|
| Slice 1 | Foundation: mock report, healthz, smoke tests |
| Slice 2 | **Current:** Pegasus resource/trigger destination scoping (Twilio still mocked) |
| Slice 3 | Live Twilio call log integration (not started) |

## Prerequisites

- Node.js 20+
- npm

## Setup

```bash
cp .env.example .env
npm install
```

Keep `USE_MOCK_REPORT=true` for local development. Twilio remains stubbed until Slice 3.

### Required Pegasus env vars (real OAuth + live scoping)

| Variable | Purpose |
|----------|---------|
| `PEGASUS_API_URL` | Pegasus API base URL |
| `PEGASUS_CLIENT_ID` | OAuth client ID |
| `PEGASUS_CLIENT_SECRET` | OAuth client secret |
| `PEGASUS_REDIRECT_URI` | OAuth callback URL |

## Development

```bash
npm run dev
```

- Client: http://localhost:5173
- Server: http://localhost:3001
- Health: http://localhost:3001/healthz

### Dev session (mock scoping, no Pegasus)

Set `ALLOW_DEV_SESSION=true` in `.env` (never enable in production):

```bash
curl -X POST http://localhost:3001/api/auth/dev-session -c cookies.txt
curl -b cookies.txt http://localhost:3001/api/report/scope
curl -b cookies.txt "http://localhost:3001/api/reports/calls?from=2026-06-20&to=2026-06-23"
```

Dev session uses a fixed fallback destination set that matches a subset of mock call data. Calls outside that scope are never returned.

### Scope diagnostics (non-production only)

`GET /api/report/scope` requires authentication and returns masked destination previews:

```json
{
  "mode": "mock",
  "hasPegasusToken": false,
  "resourceCount": 0,
  "triggerCount": 0,
  "destinationCount": 2,
  "destinationsPreview": ["***5678", "***4321"],
  "warnings": ["using dev fallback destinations"]
}
```

Disabled when `NODE_ENV=production`.

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start client + server |
| `npm run dev:server` | Express BFF only |
| `npm run dev:client` | Vite dev server only |
| `npm run build` | Build client for production |
| `npm start` | Run production server |
| `npm test` | Unit + smoke tests |
| `npm run test:unit` | Destination extraction + scoping unit tests |
| `npm run test:smoke` | Boot server, verify healthz + scoped mock report |

## API (Fase 1)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/healthz` | No | Liveness + safe env diagnostics |
| GET | `/api/auth/login` | No | Pegasus OAuth redirect |
| GET | `/api/auth/callback` | No | OAuth callback |
| GET | `/api/auth/me` | Session | Current user |
| POST | `/api/auth/logout` | Session | End session |
| POST | `/api/auth/dev-session` | No* | Dev-only test session |
| GET | `/api/report/scope` | Session** | Scoped destination diagnostics |
| GET | `/api/reports/calls` | Session | Scoped report JSON (`from`, `to`) |
| GET | `/api/reports/calls/export` | Session | Scoped CSV export |

\*Only when `ALLOW_DEV_SESSION=true`.  
\**Disabled in production.

## Scoping behavior (Slice 2)

1. Authenticate against Pegasus (or dev session when allowed).
2. `GET /api/user/resources` → normalize resources and trigger IDs.
3. Collect trigger configs (embedded on resources or fetched via `/api/triggers`).
4. Extract `twilio/call` destinations from `config.destinations[]` (deduped).
5. Mock report rows are filtered to those destinations only.
6. User with no resolved destinations gets an **empty** report (never all mock rows).

## Report shape

```json
{
  "period": { "from": "...", "to": "..." },
  "summary": {
    "totalCalls": 3,
    "answered": { "count": 2, "percentage": 66.7 },
    "notAnswered": { "count": 1, "percentage": 33.3 }
  },
  "calls": [
    { "dateTime": "...", "destination": "+52...", "duration": 42, "status": "completed" }
  ],
  "source": "mock",
  "scope": { "destinationCount": 2, "isDevSession": true, "hasPegasusToken": false }
}
```

## Production

```bash
npm run build
NODE_ENV=production SESSION_SECRET=<32+ chars> CLIENT_URL=https://your-service.onrender.com npm start
```

`ALLOW_DEV_SESSION` must remain `false` in production (ignored even if set). Live Twilio integration is Slice 3.

## Render QA deployment

Deploy as a **single Web Service** so the Express BFF protects Pegasus/Twilio credentials and serves the built React app.

| Setting | Value |
|---------|-------|
| **Service name** | `flensa-calls-report-qa` |
| **Type** | Web Service |
| **Root directory** | `flensa-calls-report` (if repo root is parent `flensa/`) |
| **Runtime** | Node 20+ |
| **Build command** | `npm ci && npm run build` |
| **Start command** | `npm start` |
| **Health check path** | `/healthz` |

### Required Render env vars (QA)

| Variable | QA value | Notes |
|----------|----------|-------|
| `NODE_ENV` | `production` | Enables static serving + production guards |
| `SESSION_SECRET` | Generate in Render | Min 32 characters; use **Generate** |
| `CLIENT_URL` | `https://flensa-calls-report-qa.onrender.com` | Your service public URL |
| `USE_MOCK_REPORT` | `true` | Keep mock mode for first QA deploy |
| `ALLOW_DEV_SESSION` | `false` | Never enable on Render |
| `PEGASUS_API_URL` | Pegasus API base | Required for OAuth login |
| `PEGASUS_CLIENT_ID` | OAuth client ID | Set in Render dashboard |
| `PEGASUS_CLIENT_SECRET` | OAuth client secret | Set in Render dashboard |
| `PEGASUS_REDIRECT_URI` | `https://<service>.onrender.com/api/auth/callback` | Must match OAuth app |

### Optional until Slice 3

| Variable | Notes |
|----------|-------|
| `TWILIO_ACCOUNT_SID` | Leave blank for QA mock deploy |
| `TWILIO_AUTH_TOKEN` | Leave blank for QA mock deploy |

`PORT` is set automatically by Render — do not override.

### Blueprint

An optional `render.yaml` is included for repeatable QA deploys. Secret values are **not** committed; set Pegasus and `CLIENT_URL` in the Render dashboard after first sync.

### Verify locally (production-like)

```bash
npm run build
NODE_ENV=production USE_MOCK_REPORT=true ALLOW_DEV_SESSION=false \
  SESSION_SECRET=local-prod-test-secret-at-least-32-chars \
  CLIENT_URL=http://localhost:3001 npm start
```

```bash
curl http://localhost:3001/healthz
curl -i http://localhost:3001/api/report/scope    # expect 401
curl -i http://localhost:3001/                    # expect HTML
```

### Production behavior

- Express listens on `0.0.0.0` and `process.env.PORT`
- Built client served from `dist/client` with SPA fallback (API routes unchanged)
- `/api/auth/dev-session` returns 404
- `/api/report/scope` returns 404 (disabled in production)
- Session cookies use `Secure` + `SameSite=Lax`
- `/healthz` returns safe boolean diagnostics only

