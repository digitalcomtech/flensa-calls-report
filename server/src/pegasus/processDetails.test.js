import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { containsFullPhoneNumber } from '../reports/scopeDiagnostics.js';
import { extractTwilioDestinations } from './triggers.js';
import {
  extractProcessIdsFromRefs,
  extractProcessRefsFromTriggers,
  fetchProcessDetails,
  isShallowProcess,
  mergeHydratedProcessesIntoTriggers,
  normalizeProcessListPayload,
  shouldHydrateProcessDetails,
} from './processDetails.js';

const FULL_PROCESS = {
  id: 'process-1',
  type: 'twilio/call',
  config: { destinations: ['+525511111111'] },
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('process detail hydration helpers', () => {
  it('treats primitive process refs as shallow', () => {
    assert.equal(isShallowProcess('process-1'), true);
    assert.equal(isShallowProcess(42), true);
  });

  it('treats id-only process objects as shallow', () => {
    assert.equal(isShallowProcess({ id: 'process-1' }), true);
    assert.equal(isShallowProcess({ process_id: 'process-2' }), true);
  });

  it('treats full process objects as not shallow', () => {
    assert.equal(isShallowProcess(FULL_PROCESS), false);
  });

  it('extracts process ids from refs and deduplicates', () => {
    assert.deepEqual(
      extractProcessIdsFromRefs(['a', { id: 'b' }, { process_id: 'c' }, { id: 'b' }]),
      ['a', 'b', 'c']
    );
  });

  it('requires process refs and zero destinations before hydration', () => {
    const triggers = [{ id: 't1', processes: ['process-1', 'process-2'] }];
    const extracted = extractTwilioDestinations(triggers);
    assert.equal(shouldHydrateProcessDetails(triggers, extracted), true);
    assert.equal(
      shouldHydrateProcessDetails([{ id: 't1', processes: [FULL_PROCESS] }], extracted),
      false
    );
    assert.equal(
      shouldHydrateProcessDetails(triggers, { destinationCount: 1, destinations: ['+525511111111'] }),
      false
    );
  });

  it('collects process refs from hydrated triggers', () => {
    const refs = extractProcessRefsFromTriggers([
      { id: 't1', processes: ['process-1', { id: 'process-2' }] },
      { id: 't2', processes: [{ type: 'twilio/call', config: { destinations: ['+525522222222'] } }] },
    ]);
    assert.equal(refs.length, 3);
  });
});

describe('normalizeProcessListPayload', () => {
  it('normalizes array, data, results, items, processes, and id-keyed maps', () => {
    assert.equal(normalizeProcessListPayload([{ id: 'a' }]).length, 1);
    assert.equal(normalizeProcessListPayload({ data: [{ id: 'b' }] })[0].id, 'b');
    assert.equal(normalizeProcessListPayload({ processes: [{ id: 'c' }] })[0].id, 'c');
    assert.deepEqual(
      normalizeProcessListPayload({
        'process-1': { id: 'process-1', type: 'twilio/call' },
      }).map((entry) => entry.id),
      ['process-1']
    );
  });
});

describe('fetchProcessDetails', () => {
  it('prefers /processes list endpoint over /api/processes', async () => {
    const fetchMock = mock.method(global, 'fetch', async (url, options = {}) => {
      const target = String(url);
      assert.equal(options.headers?.Authenticate, 'pegasus-token');

      if (target.includes('/processes?') && !target.includes('/api/processes')) {
        return jsonResponse({
          data: [
            {
              id: 'process-1',
              type: 'twilio/call',
              config: { destinations: ['+525522222222'] },
            },
            {
              id: 'process-2',
              type: 'twilio/call',
              config: { destinations: ['+525533333333'] },
            },
          ],
        });
      }

      if (target.includes('/api/processes')) {
        throw new Error('/api/processes should not be called when /processes succeeds');
      }

      throw new Error(`Unexpected fetch: ${target}`);
    });

    try {
      const result = await fetchProcessDetails({
        token: 'pegasus-token',
        processRefs: ['process-1', 'process-2'],
      });

      assert.equal(result.processes.length, 2);
      assert.equal(result.diagnostics.method, 'list');
      assert.equal(result.diagnostics.endpointTried, 'processes-list-select');
      assert.equal(extractTwilioDestinations(result.processes).destinationCount, 2);
      assert.equal(containsFullPhoneNumber(result.diagnostics), false);
      assert.ok(!JSON.stringify(result.diagnostics).includes('process-1'));
    } finally {
      fetchMock.mock.restore();
    }
  });

  it('falls back to /processes by-id when list rows are shallow', async () => {
    const fetchMock = mock.method(global, 'fetch', async (url) => {
      const target = String(url);

      if (target.includes('/processes?') && !target.includes('/api/processes')) {
        return jsonResponse({ data: [{ id: 'missing-1' }] });
      }

      if (target.endsWith('/processes/missing-1')) {
        return jsonResponse({
          id: 'missing-1',
          type: 'twilio/call',
          config: { destinations: ['+525555555555'] },
        });
      }

      throw new Error(`Unexpected fetch: ${target}`);
    });

    try {
      const result = await fetchProcessDetails({
        token: 'token',
        processRefs: [{ id: 'missing-1' }],
      });

      assert.equal(result.processes.length, 1);
      assert.equal(result.diagnostics.method, 'by-id');
      assert.equal(result.diagnostics.endpointTried, 'processes-by-id');
      assert.equal(extractTwilioDestinations(result.processes).destinationCount, 1);
    } finally {
      fetchMock.mock.restore();
    }
  });

  it('returns safe diagnostics when all hydration candidates fail', async () => {
    const fetchMock = mock.method(global, 'fetch', async () => {
      return new Response('forbidden', { status: 403 });
    });

    try {
      const result = await fetchProcessDetails({
        token: 'token',
        processRefs: ['process-1'],
      });

      assert.equal(result.processes.length, 0);
      assert.ok(result.diagnostics.warnings.length > 0);
      assert.equal(result.diagnostics.method, 'none');
      assert.equal(containsFullPhoneNumber(result.diagnostics), false);
      assert.ok(!JSON.stringify(result.diagnostics).includes('process-1'));
      assert.ok(!JSON.stringify(result.diagnostics).includes('https://'));
    } finally {
      fetchMock.mock.restore();
    }
  });
});

describe('mergeHydratedProcessesIntoTriggers', () => {
  it('replaces primitive process refs with hydrated process objects', () => {
    const triggers = [{ id: 't1', processes: ['process-1', 'process-2'] }];
    const merged = mergeHydratedProcessesIntoTriggers(triggers, [
      { id: 'process-1', type: 'twilio/call', config: { destinations: ['+525511111111'] } },
      { id: 'process-2', type: 'twilio/call', config: { destinations: ['+525522222222'] } },
    ]);

    assert.equal(merged[0].processes.length, 2);
    assert.equal(merged[0].processes[0].type, 'twilio/call');
    assert.equal(extractTwilioDestinations(merged).destinationCount, 2);
  });
});
