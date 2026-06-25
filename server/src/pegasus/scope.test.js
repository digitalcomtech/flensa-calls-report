import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { containsFullPhoneNumber } from '../reports/scopeDiagnostics.js';
import { DEV_FALLBACK_DESTINATIONS, resolveUserScope } from './scope.js';

const FULL_TRIGGER = {
  id: 'full-1',
  processes: [
    {
      type: 'twilio/call',
      config: { destinations: ['+525511111111'] },
    },
  ],
};

function pegasusJsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function assertTokenNotLeakedInRequest(url, options = {}) {
  const target = String(url);
  assert.ok(!target.includes('pegasus-token'));
  if (options.body) {
    assert.ok(!String(options.body).includes('pegasus-token'));
  }
}

describe('resolveUserScope', () => {
  it('returns dev fallback destinations only when ALLOW_DEV_SESSION is enabled', async () => {
    const previous = process.env.ALLOW_DEV_SESSION;
    process.env.ALLOW_DEV_SESSION = 'true';

    try {
      const scope = await resolveUserScope({ id: 'dev', isDevSession: true });
      assert.equal(scope.isDevSession, true);
      assert.deepEqual(scope.destinations, DEV_FALLBACK_DESTINATIONS);
      assert.equal(scope.destinationCount, DEV_FALLBACK_DESTINATIONS.length);
    } finally {
      process.env.ALLOW_DEV_SESSION = previous;
    }
  });

  it('returns empty scope for dev session when ALLOW_DEV_SESSION is disabled', async () => {
    const previous = process.env.ALLOW_DEV_SESSION;
    process.env.ALLOW_DEV_SESSION = 'false';

    try {
      const scope = await resolveUserScope({ id: 'dev', isDevSession: true });
      assert.equal(scope.destinationCount, 0);
      assert.deepEqual(scope.destinations, []);
    } finally {
      process.env.ALLOW_DEV_SESSION = previous;
    }
  });

  it('returns empty scope for authenticated user without pegasus token', async () => {
    const scope = await resolveUserScope({ id: 'user-1', email: 'a@example.com' });
    assert.equal(scope.hasPegasusToken, false);
    assert.equal(scope.destinationCount, 0);
    assert.deepEqual(scope.destinations, []);
  });

  it('hydrates shallow trigger refs and extracts destinations from hydrated configs', async () => {
    const fetchMock = mock.method(global, 'fetch', async (url, options = {}) => {
      const target = String(url);
      assert.equal(options.headers?.Authenticate, 'pegasus-token');
      assertTokenNotLeakedInRequest(url, options);

      if (target.endsWith('/user/resources')) {
        return pegasusJsonResponse({
          triggers: [{ id: 'trigger-1' }, { id: 'trigger-2' }],
        });
      }

      if (target.includes('/api/triggers')) {
        return pegasusJsonResponse({
          data: [
            {
              id: 'trigger-1',
              processes: [{ type: 'twilio/call', config: { destinations: ['+525511111111'] } }],
            },
            {
              id: 'trigger-2',
              processes: [{ type: 'twilio/call', config: { destinations: ['+525522222222'] } }],
            },
          ],
        });
      }

      throw new Error(`Unexpected fetch: ${target}`);
    });

    try {
      const scope = await resolveUserScope({
        id: 'user-1',
        pegasusToken: 'pegasus-token',
      });

      assert.equal(scope.destinationCount, 2);
      assert.ok(scope.warnings.includes('hydrated trigger details'));
      assert.equal(scope.triggerHydration?.method, 'list');
      assert.equal(scope.triggerHydration?.hydratedTriggerCount, 2);
      assert.ok(scope.triggerDiagnostics.processArrayPaths.some((entry) => entry.path === 'processes' && entry.count > 0));
      assert.equal(containsFullPhoneNumber(scope.triggerDiagnostics), false);
      assert.ok(!('pegasusToken' in scope));
    } finally {
      fetchMock.mock.restore();
    }
  });

  it('skips hydration for full trigger objects with destinations', async () => {
    const fetchMock = mock.method(global, 'fetch', async (url, options = {}) => {
      const target = String(url);
      assert.equal(options.headers?.Authenticate, 'pegasus-token');

      if (target.endsWith('/user/resources')) {
        return pegasusJsonResponse({
          triggers: [FULL_TRIGGER],
        });
      }

      throw new Error(`Unexpected fetch: ${target}`);
    });

    try {
      const scope = await resolveUserScope({
        id: 'user-1',
        pegasusToken: 'pegasus-token',
      });

      assert.equal(scope.destinationCount, 1);
      assert.equal(scope.triggerHydration, null);
      assert.ok(!scope.warnings.includes('hydrated trigger details'));
    } finally {
      fetchMock.mock.restore();
    }
  });

  it('falls back safely when hydration fails', async () => {
    const fetchMock = mock.method(global, 'fetch', async (url) => {
      const target = String(url);

      if (target.endsWith('/user/resources')) {
        return pegasusJsonResponse({
          triggers: [{ id: 'trigger-1' }],
        });
      }

      if (target.includes('/api/triggers')) {
        return new Response('forbidden', { status: 403 });
      }

      throw new Error(`Unexpected fetch: ${target}`);
    });

    try {
      const scope = await resolveUserScope({
        id: 'user-1',
        pegasusToken: 'pegasus-token',
      });

      assert.equal(scope.destinationCount, 0);
      assert.ok(scope.warnings.includes('trigger detail hydration failed'));
      assert.ok(scope.warnings.includes('no twilio/call destinations found in triggers'));
      assert.equal(scope.triggerHydration?.hydratedTriggerCount, 0);
    } finally {
      fetchMock.mock.restore();
    }
  });
});
