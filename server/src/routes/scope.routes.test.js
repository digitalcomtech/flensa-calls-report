import assert from 'node:assert/strict';
import http from 'http';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../index.js';
import { containsFullPhoneNumber } from '../reports/scopeDiagnostics.js';

function parseSetCookie(header) {
  if (!header) return '';
  const parts = Array.isArray(header) ? header : [header];
  return parts.map((line) => line.split(';')[0]).join('; ');
}

describe('/api/report/scope diagnostics gate', () => {
  let server;
  let baseUrl;
  let sessionCookie;

  before(async () => {
    process.env.NODE_ENV = 'test';
    process.env.USE_MOCK_REPORT = 'true';
    process.env.ALLOW_DEV_SESSION = 'true';

    const app = createApp();
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', resolve);
    });
    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}`;

    const sessionRes = await fetch(`${baseUrl}/api/auth/dev-session`, { method: 'POST' });
    sessionCookie = parseSetCookie(sessionRes.headers.getSetCookie?.() ?? sessionRes.headers.get('set-cookie'));
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('returns 404 when ENABLE_SCOPE_DIAGNOSTICS=false', async () => {
    const previous = process.env.ENABLE_SCOPE_DIAGNOSTICS;
    process.env.ENABLE_SCOPE_DIAGNOSTICS = 'false';

    try {
      const response = await fetch(`${baseUrl}/api/report/scope`, {
        headers: { Cookie: sessionCookie },
      });
      assert.equal(response.status, 404);
    } finally {
      process.env.ENABLE_SCOPE_DIAGNOSTICS = previous;
    }
  });

  it('returns 401 without auth even when diagnostics are enabled', async () => {
    const previous = process.env.ENABLE_SCOPE_DIAGNOSTICS;
    process.env.ENABLE_SCOPE_DIAGNOSTICS = 'true';

    try {
      const response = await fetch(`${baseUrl}/api/report/scope`);
      assert.equal(response.status, 401);
    } finally {
      process.env.ENABLE_SCOPE_DIAGNOSTICS = previous;
    }
  });

  it('returns masked diagnostics only when enabled and authenticated', async () => {
    const previous = process.env.ENABLE_SCOPE_DIAGNOSTICS;
    process.env.ENABLE_SCOPE_DIAGNOSTICS = 'true';

    try {
      const response = await fetch(`${baseUrl}/api/report/scope`, {
        headers: { Cookie: sessionCookie },
      });
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.equal(body.mode, 'mock');
      assert.equal(body.authMode, 'iframe');
      assert.equal(body.hasSession, true);
      assert.equal(body.destinationCount, 2);
      assert.ok(Array.isArray(body.destinationsPreview));
      assert.ok(body.destinationsPreview.every((preview) => preview.startsWith('***')));
      assert.equal(containsFullPhoneNumber(body), false);
      assert.ok(!('pegasusToken' in body));
      assert.ok(!('resources' in body));
      assert.ok(!('triggers' in body));
      assert.ok(!('resourcesRawType' in body));
    } finally {
      process.env.ENABLE_SCOPE_DIAGNOSTICS = previous;
    }
  });
});

describe('report scope metadata', () => {
  let server;
  let baseUrl;
  let sessionCookie;

  before(async () => {
    process.env.NODE_ENV = 'test';
    process.env.USE_MOCK_REPORT = 'true';
    process.env.ALLOW_DEV_SESSION = 'true';

    const app = createApp();
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', resolve);
    });
    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}`;

    const sessionRes = await fetch(`${baseUrl}/api/auth/dev-session`, { method: 'POST' });
    sessionCookie = parseSetCookie(sessionRes.headers.getSetCookie?.() ?? sessionRes.headers.get('set-cookie'));
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('includes safe scope meta without full phone numbers', async () => {
    const response = await fetch(`${baseUrl}/api/reports/calls?from=2026-06-20&to=2026-06-23`, {
      headers: { Cookie: sessionCookie },
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.scope.destinationCount, 2);
    assert.equal(body.scope.matchedMockRows, body.calls.length);
    assert.equal(body.scope.matchedMockRows, 3);
    assert.ok(Array.isArray(body.scope.warnings));
    assert.equal(containsFullPhoneNumber(body.scope), false);
    assert.ok(!('destinations' in body.scope));
    assert.ok(!('destinationsPreview' in body.scope));
  });
});
