#!/usr/bin/env node
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_ENTRY = path.join(ROOT, 'server/src/index.js');
const PORT = process.env.SMOKE_PORT || '3199';
const BASE = `http://127.0.0.1:${PORT}`;

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
  throw new Error('Server did not become healthy in time');
}

function parseSetCookie(header) {
  if (!header) return '';
  const parts = Array.isArray(header) ? header : [header];
  return parts.map((line) => line.split(';')[0]).join('; ');
}

async function run() {
  console.log('Smoke tests (ANLY-327 Slice 2)\n');

  const child = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT,
      NODE_ENV: 'test',
      USE_MOCK_REPORT: 'true',
      ALLOW_DEV_SESSION: 'true',
      ENABLE_SCOPE_DIAGNOSTICS: 'true',
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
    assert(health.ok === true, '/healthz returns ok');
    assert(health.diagnostics?.useMockReport === true, 'diagnostics report mock mode');
    assert(typeof health.diagnostics?.app === 'string', 'healthz includes app name');
    assert(typeof health.diagnostics?.pegasusApiConfigured === 'boolean', 'pegasusApiConfigured is boolean');
    assert(typeof health.diagnostics?.twilioConfigured === 'boolean', 'twilioConfigured is boolean');

    const unauthorizedReport = await fetch(`${BASE}/api/reports/calls?from=2026-06-20&to=2026-06-23`);
    assert(unauthorizedReport.status === 401, 'unauthenticated report request is blocked');

    const unauthorizedScope = await fetch(`${BASE}/api/report/scope`);
    assert(unauthorizedScope.status === 401, 'unauthenticated scope request is blocked');

    const sessionRes = await fetch(`${BASE}/api/auth/dev-session`, { method: 'POST' });
    const sessionCookie = parseSetCookie(sessionRes.headers.getSetCookie?.() ?? sessionRes.headers.get('set-cookie'));
    assert(sessionRes.ok, 'dev session can be created for smoke tests');

    const scopeRes = await fetch(`${BASE}/api/report/scope`, {
      headers: { Cookie: sessionCookie },
    });
    const scope = await scopeRes.json();
    assert(scopeRes.ok, 'authenticated scope endpoint succeeds');
    assert(scope.mode === 'mock', 'scope reports mock mode');
    assert(scope.authMode === 'iframe', 'scope reports iframe auth mode');
    assert(scope.hasSession === true, 'scope reports active session');
    assert(scope.destinationCount === 2, 'dev fallback exposes two scoped destinations');
    assert(scope.destinationsPreview.every((p) => p.startsWith('***')), 'scope masks phone numbers');

    const reportRes = await fetch(`${BASE}/api/reports/calls?from=2026-06-20&to=2026-06-23`, {
      headers: { Cookie: sessionCookie },
    });
    const report = await reportRes.json();
    assert(reportRes.ok, 'authenticated scoped mock report succeeds');
    assert(report.summary.totalCalls === report.calls.length, 'summary total matches detail count');
    assert(report.summary.totalCalls === 3, 'dev scoped report excludes out-of-scope mock destination');
    assert(report.scope?.destinationCount === 2, 'report includes safe scope destinationCount');
    assert(report.scope?.matchedMockRows === 3, 'report includes safe matchedMockRows');
    assert(Array.isArray(report.scope?.warnings), 'report includes safe scope warnings');
    assert(
      report.summary.answered.count + report.summary.notAnswered.count === report.summary.totalCalls,
      'answered + not answered equals total'
    );
    assert(
      report.calls.every((c) => c.destination && c.dateTime && 'duration' in c && c.status),
      'detail rows have required fields'
    );
    assert(
      !report.calls.some((c) => c.destination === '+525599988877'),
      'scoped report never includes unauthorized destination'
    );

    const emptyRes = await fetch(`${BASE}/api/reports/calls?from=2099-01-01&to=2099-01-01`, {
      headers: { Cookie: sessionCookie },
    });
    const emptyReport = await emptyRes.json();
    assert(emptyRes.ok, 'empty date range does not crash');
    assert(emptyReport.summary.totalCalls === 0, 'empty range total is zero');
    assert(emptyReport.calls.length === 0, 'empty range detail is empty');

    const exportRes = await fetch(`${BASE}/api/reports/calls/export?from=2026-06-20&to=2026-06-23`, {
      headers: { Cookie: sessionCookie },
    });
    const csv = await exportRes.text();
    const csvLines = csv.trim().split('\n');
    assert(exportRes.ok, 'export endpoint succeeds');
    assert(csvLines.length === report.calls.length + 1, 'export row count matches scoped detail (+ header)');
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
