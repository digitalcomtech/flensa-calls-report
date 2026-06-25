# Flensa Calls Report (ANLY-327)

Fase 1 calls-only report for Flensa Mx. React + Vite frontend, Express BFF backend, read-only operations.

**Scope:** Twilio calls for destination numbers derived from the authenticated user's Pegasus resources/triggers. No alert correlation, vehicle info, or group hard-coding in Fase 1.

This app is designed to run **inside Pegasus as an iframe**. Authentication uses the Pegasus user token handed into the app — not a shared service username/password and not OAuth redirects.

## Slice status

| Slice | Status |
|-------|--------|
| Slice 1 | Foundation: mock report, healthz, smoke tests |
| Slice 2 | Pegasus resource/trigger destination scoping (Twilio still mocked) |
| Slice 3 | Live Twilio call log integration (API key auth) |

## Prerequisites

- Node.js 20+
- npm

## Setup

```bash
cp .env.example .env
npm install
```

Keep `USE_MOCK_REPORT=true` for local development and first Render QA. Set `USE_MOCK_REPORT=false` only after Pegasus destination scoping works and Twilio API key credentials are configured on Render.

### Twilio env vars (Slice 3)

| Variable | Purpose |
|----------|---------|
| `TWILIO_ACCOUNT_SID` | Twilio account used in REST URL path |
| `TWILIO_API_KEY_SID` | Basic auth username (API Key SID) |
| `TWILIO_API_KEY_SECRET` | Basic auth password (API Key Secret) |
| `TWILIO_AUTH_TOKEN` | Legacy fallback for `twilioConfigured` health check only |

Live mode queries:

`GET https://api.twilio.com/2010-04-01/Accounts/{TWILIO_ACCOUNT_SID}/Calls.json`

with Basic auth `TWILIO_API_KEY_SID:TWILIO_API_KEY_SECRET`, filters by Pegasus-scoped destination numbers (`call.to`), and returns the same report shape as mock mode.

Do not commit `.env` or raw `twilio_calls_*.json` fixtures.

### Pegasus iframe env vars

| Variable | Purpose |
|----------|---------|
| `PEGASUS_API_URL` | Pegasus API base URL (default `https://api.pegasusgateway.com`) |
| `PEGASUS_AUTH_MODE` | `iframe` |
| `PEGASUS_ALLOWED_PARENT_ORIGIN` | Optional parent origin for `postMessage` validation |

## Authentication flow (iframe)

1. App loads inside Pegasus iframe (Render PR preview or QA host).
2. Pegasus injects the current user token into the iframe URL.
3. Frontend extracts the token (priority: `#token=` → `?auth=` → `?access_token=`).
4. Frontend sends token to `POST /api/auth/iframe` with `credentials: "include"`.
5. BFF validates token with `GET {PEGASUS_API_URL}/login` using header `Authenticate: <token>`.
6. BFF stores Pegasus token server-side only and creates a secure HttpOnly session cookie.
7. Frontend strips the token from the URL via `history.replaceState`.
8. Reports call `GET {PEGASUS_API_URL}/user/resources` with the stored token to scope destinations.

Tokens are never stored in `localStorage`/`sessionStorage`, never logged, and never returned to the frontend after exchange.

## Development

```bash
npm run dev
```

- Client: http://localhost:5173
- Server: http://localhost:3001
- Health: http://localhost:3001/healthz

### Local iframe auth options

1. Preferred hash URL: `http://localhost:5173/#token=<pegasus-token>`
2. Query alternatives: `?auth=<pegasus-token>` or `?access_token=<pegasus-token>`
3. Parent `postMessage` with `{ type: "PEGASUS_AUTH", token: "..." }`
4. Dev-only UI: paste token manually or use dev session when `ALLOW_DEV_SESSION=true`

```bash
# Optional dev session (mock scoping, no Pegasus token)
ALLOW_DEV_SESSION=true
curl -X POST http://localhost:3001/api/auth/dev-session -c cookies.txt
```

### Scope diagnostics (hosted QA gate)

`GET /api/report/scope` requires BFF session and is **disabled by default**.

Set `ENABLE_SCOPE_DIAGNOSTICS=true` on Render PR previews or QA services to inspect masked scope resolution:

```json
{
  "mode": "mock",
  "authMode": "iframe",
  "hasSession": true,
  "hasPegasusToken": true,
  "resourceCount": 0,
  "triggerCount": 0,
  "destinationCount": 0,
  "destinationsPreview": ["***5678"],
  "warnings": []
}
```

Never exposes tokens, raw Pegasus payloads, or full phone numbers. Disable before broader client-facing use.

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
| GET | `/api/report/scope` | Session* | Masked scope diagnostics (gated) |
| GET | `/api/reports/calls` | Session | Scoped report JSON (`from`, `to`) |
| GET | `/api/reports/calls/export` | Session | Scoped CSV export |

\*Only when `ALLOW_DEV_SESSION=true` and not production.  
\*Requires `ENABLE_SCOPE_DIAGNOSTICS=true`; returns 404 when disabled.

## Scoping behavior

1. Authenticate via iframe token (or dev session when allowed).
2. `GET /user/resources` with `Authenticate` header.
3. Collect triggers and extract `twilio/call` destinations.
4. Mock or live Twilio calls filtered to those destinations only.
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
| `ENABLE_SCOPE_DIAGNOSTICS` | `true` for hosted QA scope debugging; `false` otherwise |

Twilio env vars can remain blank while `USE_MOCK_REPORT=true`.

### Enable live Twilio on Render

1. Confirm Pegasus scoping works (`destinationCount > 0` via `/api/report/scope` when diagnostics are enabled).
2. Set Render env vars (sync: false / secret values):
   - `TWILIO_ACCOUNT_SID`
   - `TWILIO_API_KEY_SID`
   - `TWILIO_API_KEY_SECRET`
3. Set `USE_MOCK_REPORT=false`
4. Redeploy and verify `/healthz` shows `twilioConfigured: true`
5. Load report in iframe; JSON should include `source: "twilio"` and `scope.matchedTwilioRows`

Keep `USE_MOCK_REPORT=true` on PR previews until destination scoping is validated.

### Hosted QA scope debugging

1. Set `ENABLE_SCOPE_DIAGNOSTICS=true` on the Render preview/QA service.
2. Keep `USE_MOCK_REPORT=true`.
3. Redeploy, sign in via Pegasus iframe, then call:

```bash
curl -b cookies.txt https://<your-preview>.onrender.com/api/report/scope
```

Interpret results:

| Signal | Likely cause |
|--------|----------------|
| `hasPegasusToken: false` | iframe token not exchanged with BFF |
| `resourceCount: 0` | `/user/resources` empty or fetch failed |
| `destinationCount: 0` with resources | no `twilio/call` destinations on triggers |
| `destinationCount > 0`, `matchedMockRows: 0` | real destinations do not match mock numbers |
| `warnings` includes fetch failures | Pegasus resource/trigger fetch failed conservatively |

Report JSON also includes safe `scope.destinationCount`, `scope.matchedMockRows` or `scope.matchedTwilioRows`, and `scope.warnings` (no full destinations).

Disable `ENABLE_SCOPE_DIAGNOSTICS` when QA is complete.

### Pegasus iframe embedding (Render PR preview)

Configure the Pegasus app iframe URL to the Render preview host using the Doran pattern:

**Preferred:**
```
https://<render-preview-host>/#token={{auth}}
```

**Backward-compatible query alternatives:**
```
https://<render-preview-host>/?auth={{auth}}
https://<render-preview-host>/?access_token={{auth}}
```

On first load the app exchanges the token once with `POST /api/auth/iframe`, stores it server-side only, and strips it from the address bar.

- No service username/password
- No OAuth redirect/callback
- No token in `localStorage`/`sessionStorage`
- No token logging

Optional parent `postMessage` remains supported for local development.

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
- `/api/report/scope` returns 404 unless `ENABLE_SCOPE_DIAGNOSTICS=true`
- `/healthz` returns safe boolean diagnostics only
