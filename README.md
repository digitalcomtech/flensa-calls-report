# Flensa Calls Report (ANLY-327)

Fase 1 calls-only report for Flensa Mx. React + Vite frontend, Express BFF backend, read-only operations.

**Scope:** Twilio calls for destination numbers derived from the authenticated user's Pegasus resources/triggers. No alert correlation, vehicle info, or group hard-coding in Fase 1.

This app is designed to run **inside Pegasus as an iframe**. Authentication uses the Pegasus user token handed into the app — not a shared service username/password and not OAuth redirects.

## Slice status

| Slice | Status |
|-------|--------|
| Slice 1 | Foundation: mock report, healthz, smoke tests |
| Slice 2 | Pegasus resource/trigger destination scoping (Twilio still mocked) |
| Slice 3 | Live Twilio call log integration (not started) |

## Prerequisites

- Node.js 20+
- npm

## Setup

```bash
cp .env.example .env
npm install
```

Keep `USE_MOCK_REPORT=true` for local development and first Render QA. Twilio remains stubbed until Slice 3.

### Pegasus iframe env vars

| Variable | Purpose |
|----------|---------|
| `PEGASUS_API_URL` | Pegasus API base URL (default `https://api.pegasusgateway.com`) |
| `PEGASUS_AUTH_MODE` | `iframe` |
| `PEGASUS_ALLOWED_PARENT_ORIGIN` | Optional parent origin for `postMessage` validation |

## Authentication flow (iframe)

1. App loads inside Pegasus iframe.
2. Frontend receives Pegasus token via `?auth=` query param or parent `postMessage` (`{ type: "PEGASUS_AUTH", token: "..." }`).
3. Frontend sends token to `POST /api/auth/iframe`.
4. BFF validates token with `GET {PEGASUS_API_URL}/login` using header `Authenticate: <token>`.
5. BFF stores Pegasus token server-side only and creates a secure session cookie.
6. Reports call `GET {PEGASUS_API_URL}/user/resources` with the stored token to scope destinations.

Tokens are never returned to the frontend, logged, or included in `/healthz`.

## Development

```bash
npm run dev
```

- Client: http://localhost:5173
- Server: http://localhost:3001
- Health: http://localhost:3001/healthz

### Local iframe auth options

1. Open with query param: `http://localhost:5173/?auth=<pegasus-token>`
2. Parent `postMessage` with `{ type: "PEGASUS_AUTH", token: "..." }`
3. Dev-only UI: paste token manually or use dev session when `ALLOW_DEV_SESSION=true`

```bash
# Optional dev session (mock scoping, no Pegasus token)
ALLOW_DEV_SESSION=true
curl -X POST http://localhost:3001/api/auth/dev-session -c cookies.txt
```

### Scope diagnostics (non-production only)

`GET /api/report/scope` requires BFF session. Disabled in production.

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start client + server |
| `npm run build` | Build client for production |
| `npm start` | Run production server |
| `npm test` | Unit + smoke + production smoke tests |

## API (Fase 1)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/healthz` | No | Liveness + safe env diagnostics |
| GET | `/api/auth/iframe-config` | No | Iframe auth config for frontend |
| POST | `/api/auth/iframe` | No | Exchange Pegasus token for BFF session |
| GET | `/api/auth/me` | Session | Current user (no token) |
| POST | `/api/auth/logout` | Session | End session |
| POST | `/api/auth/dev-session` | No* | Dev-only test session |
| GET | `/api/report/scope` | Session** | Scoped destination diagnostics |
| GET | `/api/reports/calls` | Session | Scoped report JSON (`from`, `to`) |
| GET | `/api/reports/calls/export` | Session | Scoped CSV export |

\*Only when `ALLOW_DEV_SESSION=true` and not production.  
\**Disabled in production.

## Scoping behavior

1. Authenticate via iframe token (or dev session when allowed).
2. `GET /user/resources` with `Authenticate` header.
3. Collect triggers and extract `twilio/call` destinations.
4. Mock report rows filtered to those destinations only.
5. User with no resolved destinations gets an **empty** report.

## Render QA deployment

Deploy as a **single Web Service** (not Static Site). Use **PR Previews** for QA iterations.

| Setting | Value |
|---------|-------|
| **Service name** | `flensa-calls-report-qa` |
| **Type** | Web Service |
| **Root directory** | `flensa-calls-report` (if repo root is parent) |
| **Build command** | `npm ci --include=dev && npm run build` |
| **Start command** | `npm start` |
| **Health check path** | `/healthz` |

### Required Render env vars (QA)

| Variable | QA value |
|----------|----------|
| `NODE_ENV` | `production` |
| `SESSION_SECRET` | Generate in Render (32+ chars) |
| `CLIENT_URL` | `https://flensa-calls-report-qa.onrender.com` |
| `USE_MOCK_REPORT` | `true` |
| `ALLOW_DEV_SESSION` | `false` |
| `PEGASUS_AUTH_MODE` | `iframe` |
| `PEGASUS_API_URL` | `https://api.pegasusgateway.com` |
| `PEGASUS_ALLOWED_PARENT_ORIGIN` | Pegasus parent origin (recommended) |

Twilio env vars can remain blank until Slice 3.

### Pegasus iframe embedding

Configure the Pegasus app iframe to load the Render preview URL and pass the user token via:

- URL: `https://<preview>.onrender.com/?auth=<token>`, or
- `postMessage` from parent with `{ type: "PEGASUS_AUTH", token: "..." }`

The app does **not** use shared service credentials for report scoping.

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
- Built client served from `dist/client` with SPA fallback
- Session cookies use `Secure` + `SameSite=None` for iframe embedding
- `/api/auth/dev-session` returns 404 in production
- `/api/report/scope` returns 404 in production
- `/healthz` returns safe boolean diagnostics only
