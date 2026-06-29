#!/usr/bin/env node
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_ENTRY = path.join(ROOT, 'server/src/index.js');
const CLIENT_INDEX = path.join(ROOT, 'dist/client/index.html');
const PORT = process.env.PROD_SMOKE_PORT || '3299';
const BASE = `http://127.0.0.1:${PORT}`;
const SESSION_SECRET = 'prod-smoke-test-secret-at-least-32-chars';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed += 1;
    console.log(`  ok  ${message}`);
  } else {
    failed += 1;
    console.error(` FAIL ${message}`);
  }
}

async function waitForHealthz(timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/healthz`);
      if (res.ok) return res.json();
    } catch {
      // server still booting
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Production server did not become healthy in time');
}

async function run() {
  console.log('Production smoke tests (Render QA readiness)\n');

  if (!fs.existsSync(CLIENT_INDEX)) {
    console.error(' FAIL dist/client/index.html missing — run npm run build first');
    process.exit(1);
  }

  const child = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT,
      NODE_ENV: 'production',
      USE_MOCK_REPORT: 'true',
      ALLOW_DEV_SESSION: 'true',
      SESSION_SECRET,
      CLIENT_URL: BASE,
      ENABLE_SCOPE_DIAGNOSTICS: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let serverLog = '';
  child.stdout.on('data', (chunk) => {
    serverLog += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    serverLog += chunk.toString();
  });

  try {
    const health = await waitForHealthz();
    assert(health.ok === true, '/healthz returns ok in production');
    assert(typeof health.diagnostics?.app === 'string', 'healthz includes app name');
    assert(health.diagnostics?.useMockReport === true, 'healthz reports mock mode');
    assert(health.diagnostics?.allowDevSession === false, 'healthz reports dev session disabled in production');
    assert(health.diagnostics?.authMode === 'iframe', 'healthz reports iframe auth mode');
    assert(typeof health.diagnostics?.pegasusApiConfigured === 'boolean', 'pegasusApiConfigured is boolean');
    assert(typeof health.diagnostics?.twilioConfigured === 'boolean', 'twilioConfigured is boolean');
    assert(!('sessionSecret' in (health.diagnostics ?? {})), 'healthz does not expose session secret');

    const devSession = await fetch(`${BASE}/api/auth/dev-session`, { method: 'POST' });
    assert(devSession.status === 404, 'dev-session blocked in production even if ALLOW_DEV_SESSION=true');

    const unauthorizedScope = await fetch(`${BASE}/api/report/scope`);
    assert(unauthorizedScope.status === 401, 'scope remains auth-protected');

    const unauthorizedReport = await fetch(`${BASE}/api/reports/calls?from=2026-06-20&to=2026-06-23`);
    assert(unauthorizedReport.status === 401, 'report API remains auth-protected');

    const frontend = await fetch(`${BASE}/`);
    const html = await frontend.text();
    assert(frontend.ok, 'GET / serves built frontend');
    assert(html.includes('<div id="root">'), 'frontend HTML contains React mount point');

    const scriptMatch = html.match(/src="(\/assets\/[^"]+\.js)"/);
    assert(scriptMatch, 'frontend HTML references a built JS bundle');
    const bundle = await fetch(`${BASE}${scriptMatch[1]}`);
    const bundleSource = await bundle.text();
    assert(bundle.ok, 'built JS bundle is served');
    assert(!bundleSource.includes('Cerrar sesión'), 'built UI does not render logout button text');
    assert(!bundleSource.includes('Pegasus User'), 'built UI does not render session user label');
    assert(!bundleSource.includes('Sin sesión'), 'built UI does not render session placeholder text');
    assert(!bundleSource.includes('header-inner'), 'built UI does not ship header chrome markup');
    assert(!bundleSource.includes('header-actions'), 'built UI does not ship header chrome markup');

    const cssMatch = html.match(/href="(\/assets\/[^"]+\.css)"/);
    assert(cssMatch, 'frontend HTML references a built CSS bundle');
    const cssBundle = await fetch(`${BASE}${cssMatch[1]}`);
    const cssSource = await cssBundle.text();
    assert(cssBundle.ok, 'built CSS bundle is served');
    assert(!cssSource.includes('.header {'), 'built CSS does not style internal app header bar');
    assert(!cssSource.includes('.header-inner'), 'built CSS does not style internal app header bar');

    const assetProbe = await fetch(`${BASE}/assets/`);
    assert(assetProbe.status === 200 || assetProbe.status === 404, 'non-API routes do not return API JSON errors');

    const apiProbe = await fetch(`${BASE}/api/reports/calls`);
    assert(apiProbe.status === 401, 'API routes are not replaced by SPA fallback');
  } catch (err) {
    failed += 1;
    console.error(` FAIL ${err.message}`);
    if (serverLog) {
      console.error('\nServer output:\n', serverLog);
    }
  } finally {
    child.kill('SIGTERM');
    await new Promise((resolve) => child.on('exit', resolve));
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
