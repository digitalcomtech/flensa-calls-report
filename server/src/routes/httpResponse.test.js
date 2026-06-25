import assert from 'node:assert/strict';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { after, afterEach, before, describe, it, mock } from 'node:test';
import { createApp } from '../index.js';
import { hasClientBuild } from '../static.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const clientIndex = path.resolve(moduleDir, '../../dist/client/index.html');

function parseSetCookie(header) {
  if (!header) return '';
  const parts = Array.isArray(header) ? header : [header];
  return parts.map((line) => line.split(';')[0]).join('; ');
}

function installPegasusMocks() {
  const originalFetch = global.fetch.bind(global);

  mock.method(global, 'fetch', async (url, options = {}) => {
    const target = String(url);

    if (!target.includes('api.pegasusgateway.com')) {
      return originalFetch(url, options);
    }

    if (target.endsWith('/login')) {
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
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({
          triggers: [{ id: 't1', name: 'Trigger 1' }],
          tasks: [{ id: 'task-1' }],
        }),
      };
    }

    throw new Error(`Unexpected Pegasus fetch: ${target}`);
  });
}

describe('HTTP single-response guarantees', () => {
  let server;
  let baseUrl;
  let sessionCookie;
  let headersSentErrors = [];
  let originalConsoleError;

  before(async () => {
    process.env.NODE_ENV = 'test';
    process.env.USE_MOCK_REPORT = 'true';
    process.env.ALLOW_DEV_SESSION = 'true';
    process.env.ENABLE_SCOPE_DIAGNOSTICS = 'false';
    process.env.PEGASUS_API_URL = 'https://api.pegasusgateway.com';

    originalConsoleError = console.error;
    console.error = (...args) => {
      const message = args.map((arg) => String(arg)).join(' ');
      if (
        message.includes('ERR_HTTP_HEADERS_SENT') ||
        message.includes('Cannot set headers after they are sent')
      ) {
        headersSentErrors.push(message);
      }
      originalConsoleError(...args);
    };

    const app = createApp();
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', resolve);
    });
    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}`;

    const sessionRes = await fetch(`${baseUrl}/api/auth/dev-session`, { method: 'POST' });
    sessionCookie = parseSetCookie(sessionRes.headers.getSetCookie?.() ?? sessionRes.headers.get('set-cookie'));
  });

  afterEach(() => {
    assert.equal(headersSentErrors.length, 0, `unexpected double-response error: ${headersSentErrors.join('; ')}`);
    headersSentErrors = [];
  });

  after(async () => {
    console.error = originalConsoleError;
    mock.restoreAll();
    await new Promise((resolve) => server.close(resolve));
  });

  it('unauthenticated GET /api/reports/calls returns one 401 JSON response', async () => {
    const response = await fetch(`${baseUrl}/api/reports/calls?from=2026-06-20&to=2026-06-23`);
    const body = await response.json();

    assert.equal(response.status, 401);
    assert.equal(body.error, 'Authentication required');
    assert.equal(response.headers.get('content-type')?.includes('application/json'), true);
  });

  it('GET /api/report/scope with diagnostics disabled returns one 404 JSON response', async () => {
    const response = await fetch(`${baseUrl}/api/report/scope`, {
      headers: { Cookie: sessionCookie },
    });
    const body = await response.json();

    assert.equal(response.status, 404);
    assert.equal(body.error, 'Not found');
  });

  it('unknown /api route returns one 404 JSON response', async () => {
    const response = await fetch(`${baseUrl}/api/unknown-route`);
    const body = await response.json();

    assert.equal(response.status, 404);
    assert.equal(body.error, 'Not found');
    assert.equal(response.headers.get('content-type')?.includes('application/json'), true);
  });

  it('POST /api/auth/iframe missing token returns one 400 JSON response', async () => {
    const response = await fetch(`${baseUrl}/api/auth/iframe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.error, 'Token is required');
  });
});

describe('production SPA fallback with authenticated session', () => {
  let server;
  let baseUrl;
  let sessionCookie;
  let headersSentErrors = [];
  let originalConsoleError;

  before(async () => {
    if (!hasClientBuild() && !fs.existsSync(clientIndex)) {
      return;
    }

    process.env.NODE_ENV = 'production';
    process.env.USE_MOCK_REPORT = 'true';
    process.env.ALLOW_DEV_SESSION = 'false';
    process.env.ENABLE_SCOPE_DIAGNOSTICS = 'true';
    process.env.SESSION_SECRET = 'http-response-test-secret-at-least-32-chars';
    process.env.CLIENT_URL = 'http://127.0.0.1:3000';
    process.env.PEGASUS_API_URL = 'https://api.pegasusgateway.com';

    installPegasusMocks();

    originalConsoleError = console.error;
    console.error = (...args) => {
      const message = args.map((arg) => String(arg)).join(' ');
      if (
        message.includes('ERR_HTTP_HEADERS_SENT') ||
        message.includes('Cannot set headers after they are sent')
      ) {
        headersSentErrors.push(message);
      }
      originalConsoleError(...args);
    };

    const app = createApp();
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', resolve);
    });
    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}`;
    process.env.CLIENT_URL = baseUrl;

    const authResponse = await fetch(`${baseUrl}/api/auth/iframe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'good-token' }),
    });
    sessionCookie = parseSetCookie(authResponse.headers.getSetCookie?.() ?? authResponse.headers.get('set-cookie'));
  });

  afterEach(() => {
    if (!server) {
      return;
    }
    assert.equal(headersSentErrors.length, 0, `unexpected double-response error: ${headersSentErrors.join('; ')}`);
    headersSentErrors = [];
  });

  after(async () => {
    if (originalConsoleError) {
      console.error = originalConsoleError;
    }
    mock.restoreAll();
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('GET /non-api-route serves SPA fallback once', async (t) => {
    if (!hasClientBuild() && !fs.existsSync(clientIndex)) {
      t.skip('client build missing');
      return;
    }

    const response = await fetch(`${baseUrl}/reports`, {
      headers: { Cookie: sessionCookie },
    });
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.ok(html.includes('<div id="root">'));
    assert.equal(response.headers.get('content-type')?.includes('text/html'), true);
  });

  it('GET /api/report/scope includes resource shape diagnostics fields', async (t) => {
    if (!hasClientBuild() && !fs.existsSync(clientIndex)) {
      t.skip('client build missing');
      return;
    }

    const response = await fetch(`${baseUrl}/api/report/scope`, {
      headers: { Cookie: sessionCookie },
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.hasPegasusToken, true);
    assert.equal(body.resourcesRawType, 'object');
    assert.ok(Array.isArray(body.resourcesTopLevelKeys));
    assert.ok(body.resourcesTopLevelKeys.includes('triggers'));
    assert.ok(Array.isArray(body.candidateArrayPaths));
    assert.ok(body.candidateArrayPaths.some((entry) => entry.path === 'triggers' && entry.count === 1));
    assert.equal(typeof body.resourceCount, 'number');
    assert.ok(!('pegasusToken' in body));
    assert.ok(!('resources' in body));
  });
});
