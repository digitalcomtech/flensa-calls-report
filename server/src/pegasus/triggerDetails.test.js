import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { containsFullPhoneNumber } from '../reports/scopeDiagnostics.js';
import { extractTwilioDestinations } from './triggers.js';
import {
  extractTriggerIdsFromRefs,
  fetchTriggerDetails,
  HYDRATION_CAP,
  isShallowTrigger,
  normalizeTriggerListPayload,
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

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
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

describe('normalizeTriggerListPayload', () => {
  it('normalizes array, data, results, items, triggers, and id-keyed maps', () => {
    assert.equal(normalizeTriggerListPayload([{ id: 'a' }]).length, 1);
    assert.equal(normalizeTriggerListPayload({ data: [{ id: 'b' }] })[0].id, 'b');
    assert.equal(normalizeTriggerListPayload({ results: [{ id: 'c' }] })[0].id, 'c');
    assert.equal(normalizeTriggerListPayload({ items: [{ id: 'd' }] })[0].id, 'd');
    assert.equal(normalizeTriggerListPayload({ triggers: [{ id: 'e' }] })[0].id, 'e');
    assert.deepEqual(
      normalizeTriggerListPayload({
        'trigger-1': { id: 'trigger-1', processes: [] },
        'trigger-2': { id: 'trigger-2', processes: [] },
      }).map((entry) => entry.id),
      ['trigger-1', 'trigger-2']
    );
  });
});

describe('fetchTriggerDetails', () => {
  it('prefers /triggers list endpoint over /api/triggers', async () => {
    const requestedPaths = [];
    const fetchMock = mock.method(global, 'fetch', async (url, options = {}) => {
      const target = String(url);
      requestedPaths.push(target);
      assert.equal(options.headers?.Authenticate, 'pegasus-token');
      assertTokenNotLeakedInRequest(url, options);

      if (target.includes('/triggers?') && !target.includes('/api/triggers')) {
        return jsonResponse({
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
        });
      }

      if (target.includes('/api/triggers')) {
        throw new Error('/api/triggers should not be called when /triggers succeeds');
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
      assert.equal(result.diagnostics.endpointTried, 'triggers-list-select');
      assert.ok(requestedPaths.some((path) => path.includes('/triggers?') && !path.includes('/api/')));
      assert.ok(!requestedPaths.some((path) => path.includes('/api/triggers')));
      assert.equal(extractTwilioDestinations(result.triggers).destinationCount, 2);
      assert.equal(containsFullPhoneNumber(result.diagnostics), false);
    } finally {
      fetchMock.mock.restore();
    }
  });

  it('falls through 404 list candidates until /api/triggers works', async () => {
    const fetchMock = mock.method(global, 'fetch', async (url) => {
      const target = String(url);

      if (target.includes('/triggers?') && !target.includes('/api/triggers')) {
        return new Response('not found', { status: 404 });
      }

      if (target.includes('/api/triggers?page=1&set=500&select=')) {
        return jsonResponse({
          triggers: [
            {
              id: 'api-trigger-1',
              processes: [{ type: 'twilio/call', config: { destinations: ['+525544444444'] } }],
            },
          ],
        });
      }

      throw new Error(`Unexpected fetch: ${target}`);
    });

    try {
      const result = await fetchTriggerDetails({
        token: 'token',
        triggerRefs: [{ id: 'api-trigger-1', resourceType: 'trigger' }],
      });

      assert.equal(result.triggers.length, 1);
      assert.equal(result.diagnostics.method, 'list');
      assert.equal(result.diagnostics.endpointTried, 'api-triggers-list-select');
      assert.deepEqual(result.diagnostics.candidateStatuses, [
        { candidate: 'triggers-list-select', httpStatus: 404 },
        { candidate: 'triggers-list', httpStatus: 404 },
        { candidate: 'api-triggers-list-select', httpStatus: 200 },
      ]);
    } finally {
      fetchMock.mock.restore();
    }
  });

  it('falls back to /triggers by-id when list rows are shallow', async () => {
    const fetchMock = mock.method(global, 'fetch', async (url) => {
      const target = String(url);

      if (target.includes('/triggers?') && !target.includes('/api/triggers')) {
        return jsonResponse({ data: [{ id: 'missing-1' }] });
      }

      if (target.endsWith('/triggers/missing-1')) {
        return jsonResponse({
          id: 'missing-1',
          processes: [{ type: 'twilio/call', config: { destinations: ['+525555555555'] } }],
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
      assert.equal(result.diagnostics.endpointTried, 'triggers-by-id');
      assert.equal(extractTwilioDestinations(result.triggers).destinationCount, 1);
      assert.ok(result.diagnostics.candidateStatuses.some((entry) => entry.candidate === 'triggers-list-select'));
      assert.ok(result.diagnostics.candidateStatuses.some((entry) => entry.candidate === 'triggers-by-id'));
    } finally {
      fetchMock.mock.restore();
    }
  });

  it('uses api-triggers-by-id only when triggers-by-id fails', async () => {
    const fetchMock = mock.method(global, 'fetch', async (url) => {
      const target = String(url);

      if (target.endsWith('/api/triggers/missing-1') || target.endsWith('/api/triggers?id=missing-1')) {
        return jsonResponse({
          id: 'missing-1',
          processes: [{ type: 'twilio/call', config: { destinations: ['+525566666666'] } }],
        });
      }

      if (target.endsWith('/triggers/missing-1') || target.endsWith('/triggers?id=missing-1')) {
        return new Response('not found', { status: 404 });
      }

      if (target.includes('/triggers?') && !target.includes('/api/triggers')) {
        return jsonResponse({ data: [] });
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
      assert.equal(result.diagnostics.endpointTried, 'api-triggers-by-id');
      assert.ok(
        result.diagnostics.candidateStatuses.some(
          (entry) => entry.candidate === 'triggers-by-id' && entry.httpStatus === 404
        )
      );
      assert.ok(
        result.diagnostics.candidateStatuses.some(
          (entry) => entry.candidate === 'api-triggers-by-id' && entry.httpStatus === 200
        )
      );
    } finally {
      fetchMock.mock.restore();
    }
  });

  it('returns safe diagnostics when all hydration candidates fail', async () => {
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
      assert.equal(result.diagnostics.endpointTried, null);
      assert.ok(result.diagnostics.candidateStatuses.length >= 4);
      assert.equal(containsFullPhoneNumber(result.diagnostics), false);
      assert.ok(!('pegasusToken' in result.diagnostics));
      for (const entry of result.diagnostics.candidateStatuses) {
        assert.ok(!entry.candidate.includes('pegasus-token'));
        assert.ok(!String(entry.candidate).includes('http'));
      }
    } finally {
      fetchMock.mock.restore();
    }
  });

  it('respects hydration cap', async () => {
    const fetchMock = mock.method(global, 'fetch', async (url) => {
      if (String(url).includes('/triggers?') && !String(url).includes('/api/triggers')) {
        return jsonResponse({ data: [] });
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
