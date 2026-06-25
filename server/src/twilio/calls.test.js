import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { buildSummary, isAnsweredCall, isNotAnsweredCall } from '../reports/reportSummary.js';
import { callsToCsv } from '../reports/export.js';
import { phonesMatch } from '../utils/phoneMatch.js';
import {
  assertTwilioConfigured,
  buildTwilioAuthHeader,
  buildTwilioCallsQueryParams,
  buildTwilioCallsUrl,
  fetchTwilioCalls,
  mapTwilioCallToDetail,
  TwilioConfigError,
} from './calls.js';

const TWILIO_ENV_KEYS = [
  'TWILIO_ACCOUNT_SID',
  'TWILIO_API_KEY_SID',
  'TWILIO_API_KEY_SECRET',
  'TWILIO_AUTH_TOKEN',
];

const TWILIO_FIXTURE_PAGE_1 = {
  calls: [
    {
      sid: 'CA111',
      to: '+525512345678',
      from: '+14155550100',
      status: 'completed',
      start_time: '2026-06-20T14:30:00.000Z',
      end_time: '2026-06-20T14:31:00.000Z',
      duration: '42',
      direction: 'outbound-api',
    },
    {
      sid: 'CA222',
      to: '525587654321',
      status: 'no-answer',
      start_time: '2026-06-21T09:15:00.000Z',
      duration: '0',
      direction: 'outbound-api',
    },
    {
      sid: 'CA333',
      to: '+19998887777',
      status: 'completed',
      start_time: '2026-06-22T18:45:00.000Z',
      duration: '10',
      direction: 'outbound-api',
    },
  ],
  next_page_uri: '/2010-04-01/Accounts/AC123/Calls.json?PageToken=abc',
};

const TWILIO_FIXTURE_PAGE_2 = {
  calls: [
    {
      sid: 'CA444',
      to: '+525512345678',
      status: 'busy',
      start_time: '2026-06-23T11:00:00.000Z',
      duration: '0',
      direction: 'outbound-api',
    },
  ],
  next_page_uri: null,
};

function saveTwilioEnv() {
  return Object.fromEntries(TWILIO_ENV_KEYS.map((key) => [key, process.env[key]]));
}

function restoreTwilioEnv(previous) {
  for (const key of TWILIO_ENV_KEYS) {
    if (previous[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = previous[key];
    }
  }
}

function setTwilioEnv() {
  process.env.TWILIO_ACCOUNT_SID = 'AC123';
  process.env.TWILIO_API_KEY_SID = 'SK123';
  process.env.TWILIO_API_KEY_SECRET = 'super-secret-value';
  delete process.env.TWILIO_AUTH_TOKEN;
}

describe('twilio calls client', () => {
  let previousEnv;

  afterEach(() => {
    restoreTwilioEnv(previousEnv);
  });

  it('requires API key credentials when live mode is used', () => {
    previousEnv = saveTwilioEnv();
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_API_KEY_SID;
    delete process.env.TWILIO_API_KEY_SECRET;

    assert.throws(() => assertTwilioConfigured(), TwilioConfigError);
  });

  it('builds Basic auth header without exposing secrets in the header helper return shape', () => {
    const header = buildTwilioAuthHeader('SK123', 'super-secret-value');
    assert.equal(header, `Basic ${Buffer.from('SK123:super-secret-value').toString('base64')}`);
    assert.ok(!header.includes('super-secret-value'));
  });

  it('includes StartTime>= and StartTime<= query params', () => {
    const params = buildTwilioCallsQueryParams({
      from: '2026-06-20',
      to: '2026-06-23',
      pageSize: 1000,
    });

    assert.equal(params.get('PageSize'), '1000');
    assert.equal(params.get('StartTime>='), '2026-06-20');
    assert.equal(params.get('StartTime<='), '2026-06-23');

    const url = buildTwilioCallsUrl({
      accountSid: 'AC123',
      from: '2026-06-20',
      to: '2026-06-23',
    });

    assert.match(url, /StartTime%3E%3D=2026-06-20/);
    assert.match(url, /StartTime%3C%3D=2026-06-23/);
  });

  it('follows next_page_uri pagination and filters scoped destinations', async () => {
    previousEnv = saveTwilioEnv();
    setTwilioEnv();

    const requestedUrls = [];
    const fetchImpl = async (url) => {
      requestedUrls.push(url);
      const payload = requestedUrls.length === 1 ? TWILIO_FIXTURE_PAGE_1 : TWILIO_FIXTURE_PAGE_2;
      return {
        ok: true,
        status: 200,
        json: async () => payload,
      };
    };

    const calls = await fetchTwilioCalls({
      from: '2026-06-20',
      to: '2026-06-23',
      destinations: ['+525512345678', '+525587654321'],
      fetchImpl,
    });

    assert.equal(requestedUrls.length, 2);
    assert.ok(requestedUrls[1].includes('PageToken=abc'));
    assert.equal(calls.length, 3);
    assert.ok(calls.every((call) => phonesMatch(call.destination, '+525512345678') || phonesMatch(call.destination, '+525587654321')));
    assert.ok(!calls.some((call) => call.destination.includes('999888')));
    assert.equal(isAnsweredCall('completed'), true);
    assert.equal(isNotAnsweredCall('no-answer'), true);
    assert.equal(isNotAnsweredCall('busy'), true);
  });

  it('returns empty results without querying Twilio when destinations are empty', async () => {
    previousEnv = saveTwilioEnv();
    setTwilioEnv();

    let fetchCount = 0;
    const calls = await fetchTwilioCalls({
      from: '2026-06-20',
      to: '2026-06-23',
      destinations: [],
      fetchImpl: async () => {
        fetchCount += 1;
        return { ok: true, status: 200, json: async () => ({ calls: [] }) };
      },
    });

    assert.deepEqual(calls, []);
    assert.equal(fetchCount, 0);
  });

  it('maps Twilio rows to report detail shape', () => {
    const detail = mapTwilioCallToDetail(TWILIO_FIXTURE_PAGE_1.calls[0]);
    assert.deepEqual(detail, {
      dateTime: '2026-06-20T14:30:00.000Z',
      destination: '+525512345678',
      duration: 42,
      status: 'completed',
    });
    assert.ok(!('sid' in detail));
  });

  it('does not expose credentials in Twilio API errors', async () => {
    previousEnv = saveTwilioEnv();
    setTwilioEnv();

    await assert.rejects(
      () =>
        fetchTwilioCalls({
          from: '2026-06-20',
          to: '2026-06-23',
          destinations: ['+525512345678'],
          fetchImpl: async () => ({
            ok: false,
            status: 401,
            json: async () => ({}),
          }),
        }),
      (error) => {
        const serialized = String(error);
        assert.ok(!serialized.includes('super-secret-value'));
        assert.ok(!serialized.includes('SK123'));
        return true;
      }
    );
  });
});

describe('twilio report summary and export parity', () => {
  it('builds summary from mapped Twilio rows and matches CSV export rows', () => {
    const calls = TWILIO_FIXTURE_PAGE_1.calls
      .slice(0, 2)
      .map(mapTwilioCallToDetail);
    const summary = buildSummary(calls);
    const csv = callsToCsv(calls);

    assert.equal(summary.totalCalls, 2);
    assert.equal(summary.answered.count, 1);
    assert.equal(summary.notAnswered.count, 1);
    assert.equal(summary.answered.count + summary.notAnswered.count, summary.totalCalls);
    assert.match(csv, /2026-06-20T14:30:00.000Z/);
    assert.match(csv, /\+525512345678/);
    assert.match(csv, /no-answer/);
  });
});
