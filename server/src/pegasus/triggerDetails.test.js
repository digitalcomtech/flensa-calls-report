import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { containsFullPhoneNumber } from '../reports/scopeDiagnostics.js';
import { extractTwilioDestinations } from './triggers.js';
import {
  extractTriggerIdsFromRefs,
  fetchTriggerDetails,
  HYDRATION_CAP,
  isShallowTrigger,
  shouldHydrateTriggerDetails,
} from './triggerDetails.js';

const FULL_TRIGGER = {
  id: 'full-1',
  processes: [
    {
      type: 'twilio/call',
      config: { destinations: ['+525511111111'] },
    },
  ],
};

function assertTokenNotLeakedInRequest(url, options = {}) {
  const target = String(url);
  assert.ok(!target.includes('pegasus-token'));
  if (options.body) {
    assert.ok(!String(options.body).includes('pegasus-token'));
  }
}

describe('trigger detail hydration helpers', () => {
  it('treats primitive trigger refs as shallow', () => {
    assert.equal(isShallowTrigger('trigger-1'), true);
    assert.equal(isShallowTrigger(42), true);
  });

  it('treats id-only trigger objects as shallow', () => {
    assert.equal(isShallowTrigger({ id: 'trigger-1', name: 'Alert A' }), true);
    assert.equal(isShallowTrigger({ _id: 'trigger-2', type: 'trigger' }), true);
  });

  it('treats full trigger objects as not shallow', () => {
    assert.equal(isShallowTrigger(FULL_TRIGGER), false);
  });

  it('extracts trigger ids from refs and deduplicates', () => {
    assert.deepEqual(
      extractTriggerIdsFromRefs(['a', { id: 'b' }, { trigger_id: 'c' }, { id: 'b' }]),
      ['a', 'b', 'c']
    );
  });

  it('requires shallow triggers and zero destinations before hydration', () => {
    const shallow = [{ id: 't1' }];
    const extracted = extractTwilioDestinations(shallow);
    assert.equal(shouldHydrateTriggerDetails(shallow, extracted), true);
    assert.equal(shouldHydrateTriggerDetails([FULL_TRIGGER], extracted), false);
    assert.equal(
      shouldHydrateTriggerDetails(shallow, { destinationCount: 1, destinations: ['+525511111111'] }),
      false
    );
  });
});

describe('fetchTriggerDetails', () => {
  it('hydrates shallow primitive trigger ids via paginated list endpoint', async () => {
    const fetchMock = mock.method(global, 'fetch', async (url, options = {}) => {
      const target = String(url);
      assert.equal(options.headers?.Authenticate, 'pegasus-token');
      assertTokenNotLeakedInRequest(url, options);

      if (target.includes('/api/triggers')) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: 'trigger-1',
                processes: [{ type: 'twilio/call', config: { destinations: ['+525522222222'] } }],
              },
              {
                id: 'trigger-2',
                processes: [{ type: 'twilio/call', config: { destinations: ['+525533333333'] } }],
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }

      throw new Error(`Unexpected fetch: ${target}`);
    });

    try {
      const result = await fetchTriggerDetails({
        token: 'pegasus-token',
        triggerRefs: ['trigger-1', 'trigger-2'],
      });

      assert.equal(result.triggers.length, 2);
      assert.equal(result.diagnostics.method, 'list');
      assert.equal(result.diagnostics.hydratedTriggerCount, 2);
      assert.equal(result.diagnostics.inputTriggerRefCount, 2);
      assert.equal(extractTwilioDestinations(result.triggers).destinationCount, 2);
      assert.equal(containsFullPhoneNumber(result.diagnostics), false);
      assert.ok(!('pegasusToken' in result));
    } finally {
      fetchMock.mock.restore();
    }
  });

  it('hydrates shallow trigger objects via list endpoint', async () => {
    const fetchMock = mock.method(global, 'fetch', async (url) => {
      if (String(url).includes('/api/triggers?page=1&set=500')) {
        return new Response(
          JSON.stringify({
            triggers: [
              {
                id: 'shallow-1',
                processes: [{ type: 'twilio/call', config: { destinations: ['+525544444444'] } }],
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    try {
      const result = await fetchTriggerDetails({
        token: 'token',
        triggerRefs: [{ id: 'shallow-1', resourceType: 'trigger' }],
      });

      assert.equal(result.triggers.length, 1);
      assert.equal(result.diagnostics.method, 'list');
      assert.equal(result.triggers[0].id, 'shallow-1');
    } finally {
      fetchMock.mock.restore();
    }
  });

  it('falls back to by-id hydration when list misses triggers', async () => {
    const fetchMock = mock.method(global, 'fetch', async (url) => {
      const target = String(url);

      if (target.endsWith('/api/triggers/missing-1')) {
        return new Response(
          JSON.stringify({
            id: 'missing-1',
            processes: [{ type: 'twilio/call', config: { destinations: ['+525555555555'] } }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }

      if (target.includes('/api/triggers')) {
        return new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      throw new Error(`Unexpected fetch: ${target}`);
    });

    try {
      const result = await fetchTriggerDetails({
        token: 'token',
        triggerRefs: [{ id: 'missing-1' }],
      });

      assert.equal(result.triggers.length, 1);
      assert.equal(result.diagnostics.method, 'by-id');
      assert.equal(extractTwilioDestinations(result.triggers).destinationCount, 1);
    } finally {
      fetchMock.mock.restore();
    }
  });

  it('returns safe diagnostics when hydration fails', async () => {
    const fetchMock = mock.method(global, 'fetch', async () => {
      return new Response('forbidden', { status: 403 });
    });

    try {
      const result = await fetchTriggerDetails({
        token: 'token',
        triggerRefs: ['trigger-1'],
      });

      assert.equal(result.triggers.length, 0);
      assert.ok(result.diagnostics.warnings.length > 0);
      assert.equal(result.diagnostics.method, 'none');
      assert.equal(containsFullPhoneNumber(result.diagnostics), false);
    } finally {
      fetchMock.mock.restore();
    }
  });

  it('respects hydration cap', async () => {
    const fetchMock = mock.method(global, 'fetch', async (url) => {
      if (String(url).includes('/api/triggers')) {
        return new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const refs = Array.from({ length: HYDRATION_CAP + 5 }, (_, index) => `trigger-${index}`);

    try {
      const result = await fetchTriggerDetails({
        token: 'token',
        triggerRefs: refs,
        limit: HYDRATION_CAP,
      });

      assert.equal(result.diagnostics.uniqueTriggerIdCount, HYDRATION_CAP + 5);
      assert.ok(result.diagnostics.warnings.some((warning) => warning.includes(String(HYDRATION_CAP))));
    } finally {
      fetchMock.mock.restore();
    }
  });
});
