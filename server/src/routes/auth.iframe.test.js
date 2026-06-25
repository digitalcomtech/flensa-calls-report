import assert from 'node:assert/strict';
import http from 'http';
import { after, before, beforeEach, describe, it, mock } from 'node:test';
import { createApp } from '../index.js';

function parseSetCookie(header) {
  if (!header) return '';
  const parts = Array.isArray(header) ? header : [header];
  return parts.map((line) => line.split(';')[0]).join('; ');
}

describe('POST /api/auth/iframe', () => {
  let server;
  let baseUrl;
  let pegasusLoginCalled;
  let pegasusResourcesCalled;

  before(async () => {
    process.env.PEGASUS_API_URL = 'https://api.pegasusgateway.com';
    process.env.NODE_ENV = 'test';

    const originalFetch = global.fetch.bind(global);
    mock.method(global, 'fetch', async (url, options = {}) => {
      const target = String(url);

      if (!target.includes('api.pegasusgateway.com')) {
        return originalFetch(url, options);
      }

      if (target.endsWith('/login')) {
        pegasusLoginCalled = true;
        const token = options.headers?.Authenticate;
        if (token === 'good-token') {
          return {
            ok: true,
            status: 200,
            headers: { get: () => 'application/json' },
            json: async () => ({ id: 'user-1', name: 'Iframe User', email: 'user@example.com' }),
          };
        }
        return {
          ok: false,
          status: 401,
          headers: { get: () => 'application/json' },
          json: async () => ({}),
        };
      }

      if (target.endsWith('/user/resources')) {
        pegasusResourcesCalled = true;
        assert.equal(options.headers?.Authenticate, 'good-token');
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          json: async () => ({ resources: [] }),
        };
      }

      throw new Error(`Unexpected Pegasus fetch: ${target}`);
    });

    const app = createApp();
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', resolve);
    });
    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}`;
  });

  beforeEach(() => {
    pegasusLoginCalled = false;
    pegasusResourcesCalled = false;
  });

  after(async () => {
    mock.restoreAll();
    await new Promise((resolve) => server.close(resolve));
  });

  it('rejects missing token', async () => {
    const response = await fetch(`${baseUrl}/api/auth/iframe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    assert.equal(response.status, 400);
  });

  it('validates token via Pegasus /login and does not return token', async () => {
    const response = await fetch(`${baseUrl}/api/auth/iframe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'good-token' }),
    });

    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.user.id, 'user-1');
    assert.ok(!('token' in body));
    assert.ok(!('pegasusToken' in body));
    assert.equal(pegasusLoginCalled, true);
  });

  it('stores token server-side for scoped report calls', async () => {
    const authResponse = await fetch(`${baseUrl}/api/auth/iframe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'good-token' }),
    });
    const cookie = parseSetCookie(authResponse.headers.getSetCookie?.() ?? authResponse.headers.get('set-cookie'));

    const reportResponse = await fetch(`${baseUrl}/api/reports/calls?from=2026-06-20&to=2026-06-23`, {
      headers: { Cookie: cookie },
    });

    assert.equal(reportResponse.status, 200);
    assert.equal(pegasusResourcesCalled, true);
  });

  it('returns 401 for unauthenticated report requests', async () => {
    const response = await fetch(`${baseUrl}/api/reports/calls?from=2026-06-20&to=2026-06-23`);
    assert.equal(response.status, 401);
  });

  it('does not include token text in invalid auth error response', async () => {
    const response = await fetch(`${baseUrl}/api/auth/iframe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'bad-token' }),
    });

    const body = await response.json();
    const serialized = JSON.stringify(body);
    assert.equal(response.status, 401);
    assert.ok(!serialized.includes('bad-token'));
  });
});
