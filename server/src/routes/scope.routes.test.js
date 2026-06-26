import assert from 'node:assert/strict';
import http from 'http';
import { after, before, describe, it, mock } from 'node:test';
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
      assert.ok(!('triggerDiagnostics' in body));
    } finally {
      process.env.ENABLE_SCOPE_DIAGNOSTICS = previous;
    }
  });

  it('includes triggerDiagnostics only when includeTriggerDiagnostics=true', async () => {
    const previous = process.env.ENABLE_SCOPE_DIAGNOSTICS;
    process.env.ENABLE_SCOPE_DIAGNOSTICS = 'true';

    try {
      const compact = await fetch(`${baseUrl}/api/report/scope`, {
        headers: { Cookie: sessionCookie },
      });
      const detailed = await fetch(`${baseUrl}/api/report/scope?includeTriggerDiagnostics=true`, {
        headers: { Cookie: sessionCookie },
      });
      const compactBody = await compact.json();
      const detailedBody = await detailed.json();

      assert.equal(compact.status, 200);
      assert.equal(detailed.status, 200);
      assert.ok(!('triggerDiagnostics' in compactBody));
      assert.ok('triggerDiagnostics' in detailedBody);
      assert.equal(containsFullPhoneNumber(detailedBody.triggerDiagnostics), false);
      assert.ok(Array.isArray(detailedBody.triggerDiagnostics.processTopLevelKeysSeen));
      assert.ok(Array.isArray(detailedBody.triggerDiagnostics.processNestedObjectPathsSeen));
      assert.ok(Array.isArray(detailedBody.triggerDiagnostics.processNestedArrayPathsSeen));
      assert.ok(Array.isArray(detailedBody.triggerDiagnostics.processPrimitiveFieldNamesSeen));
      assert.ok(Array.isArray(detailedBody.triggerDiagnostics.processCandidatePhoneFieldNamesSeen));
      assert.ok(Array.isArray(detailedBody.triggerDiagnostics.processSampleShapes));
      assert.ok(!('triggerHydration' in compactBody));
    } finally {
      process.env.ENABLE_SCOPE_DIAGNOSTICS = previous;
    }
  });

  it('includes triggerHydration only when includeTriggerDiagnostics=true', async () => {
    const previous = process.env.ENABLE_SCOPE_DIAGNOSTICS;
    process.env.ENABLE_SCOPE_DIAGNOSTICS = 'true';

    try {
      const { buildSafeScopeDiagnostics } = await import('../reports/scopeDiagnostics.js');

      const diagnostics = buildSafeScopeDiagnostics(
        {
          hasPegasusToken: true,
          resourceCount: 2,
          triggerCount: 2,
          destinationCount: 1,
          destinations: ['+525511111111'],
          warnings: ['hydrated trigger details'],
          triggerDiagnostics: {
            sampledTriggerCount: 2,
            triggerTopLevelKeysSeen: ['processes'],
            processArrayPaths: [{ path: 'processes', count: 2 }],
            processObjectPaths: [],
            processTypeFieldsSeen: ['type'],
            processTypeValuesSeen: ['twilio/call'],
            destinationFieldPathsSeen: [{ path: 'config.destinations', count: 2 }],
          },
          triggerHydration: {
            attempted: true,
            inputTriggerRefCount: 2,
            uniqueTriggerIdCount: 2,
            hydratedTriggerCount: 2,
            method: 'list',
            endpointTried: 'triggers-list-select',
            httpStatus: 200,
            candidateStatuses: [{ candidate: 'triggers-list-select', httpStatus: 200 }],
            warnings: [],
          },
        },
        {
          mode: 'mock',
          authMode: 'iframe',
          hasSession: true,
          includeResourceShape: true,
          includeTriggerDiagnostics: true,
        }
      );

      assert.ok('triggerHydration' in diagnostics);
      assert.equal(diagnostics.triggerHydration.method, 'list');
      assert.equal(diagnostics.triggerHydration.endpointTried, 'triggers-list-select');
      assert.deepEqual(diagnostics.triggerHydration.candidateStatuses, [
        { candidate: 'triggers-list-select', httpStatus: 200 },
      ]);
      assert.equal(diagnostics.triggerHydration.hydratedTriggerCount, 2);
      assert.equal(containsFullPhoneNumber(diagnostics), false);
      assert.ok(!('pegasusToken' in diagnostics));
    } finally {
      process.env.ENABLE_SCOPE_DIAGNOSTICS = previous;
    }
  });
});

describe('GET /api/report/scope process-shape trigger diagnostics', () => {
  let server;
  let baseUrl;
  let sessionCookie;
  let fetchMock;

  before(async () => {
    process.env.NODE_ENV = 'test';
    process.env.USE_MOCK_REPORT = 'true';
    process.env.ALLOW_DEV_SESSION = 'false';
    process.env.ENABLE_SCOPE_DIAGNOSTICS = 'true';
    process.env.PEGASUS_API_URL = 'https://api.pegasusgateway.com';

    const originalFetch = global.fetch.bind(global);
    fetchMock = mock.method(global, 'fetch', async (url, options = {}) => {
      const target = String(url);

      if (!target.includes('api.pegasusgateway.com')) {
        return originalFetch(url, options);
      }

      if (target.endsWith('/login')) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          json: async () => ({ id: 'user-1', name: 'Iframe User' }),
        };
      }

      if (target.endsWith('/user/resources')) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          json: async () => ({
            triggers: [{ id: 'trigger-1' }],
          }),
        };
      }

      if (target.includes('/triggers?') && !target.includes('/api/triggers')) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          json: async () => ({
            data: [
              {
                id: 'trigger-1',
                processes: [
                  {
                    command: 'twilio/call',
                    config: {
                      args: { to: '+525511111111' },
                      parameters: { mode: 'voice' },
                    },
                    params: { retry: 1 },
                    data: { channel: 'sms' },
                  },
                ],
              },
            ],
          }),
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

    const authRes = await fetch(`${baseUrl}/api/auth/iframe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'pegasus-token' }),
    });
    sessionCookie = parseSetCookie(authRes.headers.getSetCookie?.() ?? authRes.headers.get('set-cookie'));
  });

  after(async () => {
    fetchMock.mock.restore();
    await new Promise((resolve) => server.close(resolve));
  });

  it('returns process-shape trigger diagnostics for hydrated triggers', async () => {
    const response = await fetch(`${baseUrl}/api/report/scope?includeTriggerDiagnostics=true`, {
      headers: { Cookie: sessionCookie },
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.ok('triggerDiagnostics' in body);

    const triggerDiagnostics = body.triggerDiagnostics;
    assert.ok(Array.isArray(triggerDiagnostics.processTopLevelKeysSeen));
    assert.ok(Array.isArray(triggerDiagnostics.processNestedObjectPathsSeen));
    assert.ok(Array.isArray(triggerDiagnostics.processNestedArrayPathsSeen));
    assert.ok(Array.isArray(triggerDiagnostics.processPrimitiveFieldNamesSeen));
    assert.ok(Array.isArray(triggerDiagnostics.processCandidatePhoneFieldNamesSeen));
    assert.ok(Array.isArray(triggerDiagnostics.processSampleShapes));

    assert.ok(triggerDiagnostics.processTopLevelKeysSeen.includes('command'));
    assert.ok(triggerDiagnostics.processTopLevelKeysSeen.includes('config'));
    assert.ok(
      triggerDiagnostics.processNestedObjectPathsSeen.some((entry) => entry.path === 'config' && entry.count > 0)
    );
    assert.ok(triggerDiagnostics.processPrimitiveFieldNamesSeen.includes('params.retry'));
    assert.ok(triggerDiagnostics.processSampleShapes.length >= 1);
    assert.ok(triggerDiagnostics.processSampleShapes[0].topLevelKeys.includes('config'));
    assert.equal(containsFullPhoneNumber(triggerDiagnostics), false);
    assert.ok(!JSON.stringify(triggerDiagnostics).includes('+525511111111'));
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
