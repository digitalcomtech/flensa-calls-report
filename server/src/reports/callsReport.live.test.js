import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { buildLiveTwilioCallsReport } from './callsReport.live.js';
import { buildCallsReport } from './callsReport.js';
import { containsFullPhoneNumber } from './scopeDiagnostics.js';

const TWILIO_ENV_KEYS = [
  'TWILIO_ACCOUNT_SID',
  'TWILIO_API_KEY_SID',
  'TWILIO_API_KEY_SECRET',
];

const TWILIO_FIXTURE = {
  calls: [
    {
      sid: 'CA111',
      to: '+525512345678',
      status: 'completed',
      start_time: '2026-06-20T14:30:00.000Z',
      duration: '42',
      direction: 'outbound-api',
    },
    {
      sid: 'CA222',
      to: '+525587654321',
      status: 'no-answer',
      start_time: '2026-06-21T09:15:00.000Z',
      duration: '0',
      direction: 'outbound-api',
    },
  ],
  next_page_uri: null,
};

function saveEnv(keys) {
  return Object.fromEntries(keys.map((key) => [key, process.env[key]]));
}

function restoreEnv(previous, keys) {
  for (const key of keys) {
    if (previous[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = previous[key];
    }
  }
}

describe('buildLiveTwilioCallsReport', () => {
  let previousEnv;
  let originalFetch;

  afterEach(() => {
    restoreEnv(previousEnv, [...TWILIO_ENV_KEYS, 'USE_MOCK_REPORT']);
    global.fetch = originalFetch;
  });

  it('returns empty report with warning when destinations are empty', async () => {
    previousEnv = saveEnv([...TWILIO_ENV_KEYS, 'USE_MOCK_REPORT']);
    originalFetch = global.fetch;
    global.fetch = async () => {
      throw new Error('Twilio should not be queried');
    };

    const report = await buildLiveTwilioCallsReport({
      from: '2026-06-20',
      to: '2026-06-23',
      scope: {
        destinationCount: 0,
        destinations: [],
        warnings: [],
      },
    });

    assert.equal(report.source, 'twilio');
    assert.equal(report.calls.length, 0);
    assert.equal(report.summary.totalCalls, 0);
    assert.equal(report.scope.matchedTwilioRows, 0);
    assert.ok(report.scope.warnings.includes('no scoped destinations'));
  });

  it('builds live report with matchedTwilioRows and safe scope meta', async () => {
    previousEnv = saveEnv([...TWILIO_ENV_KEYS, 'USE_MOCK_REPORT']);
    process.env.TWILIO_ACCOUNT_SID = 'AC123';
    process.env.TWILIO_API_KEY_SID = 'SK123';
    process.env.TWILIO_API_KEY_SECRET = 'super-secret-value';
    originalFetch = global.fetch;
    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => TWILIO_FIXTURE,
    });

    const report = await buildLiveTwilioCallsReport({
      from: '2026-06-20',
      to: '2026-06-23',
      scope: {
        destinationCount: 2,
        destinations: ['+525512345678', '+525587654321'],
        warnings: [],
      },
    });

    assert.equal(report.source, 'twilio');
    assert.equal(report.calls.length, 2);
    assert.equal(report.summary.totalCalls, 2);
    assert.equal(report.summary.answered.count, 1);
    assert.equal(report.summary.notAnswered.count, 1);
    assert.equal(report.scope.matchedTwilioRows, 2);
    assert.equal(report.scope.destinationCount, 2);
    assert.equal(containsFullPhoneNumber(report.scope), false);
    assert.ok(!('matchedMockRows' in report.scope));
  });
});

describe('buildCallsReport mode selection', () => {
  let previousEnv;

  afterEach(() => {
    restoreEnv(previousEnv, ['USE_MOCK_REPORT', 'ALLOW_DEV_SESSION']);
  });

  it('keeps mock mode working for dev sessions', async () => {
    previousEnv = saveEnv(['USE_MOCK_REPORT', 'ALLOW_DEV_SESSION']);
    process.env.USE_MOCK_REPORT = 'true';
    process.env.ALLOW_DEV_SESSION = 'true';

    const report = await buildCallsReport({
      from: '2026-06-20',
      to: '2026-06-23',
      user: { id: 'dev-user', isDevSession: true },
    });

    assert.equal(report.source, 'mock');
    assert.equal(report.scope.matchedMockRows, 3);
    assert.ok(!('matchedTwilioRows' in report.scope));
  });
});
