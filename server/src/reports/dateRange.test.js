import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildReportDateBounds,
  filterCallsByDateRange,
  parseCallStartTime,
  parseReportDateRange,
} from './dateRange.js';

describe('buildReportDateBounds', () => {
  it('builds inclusive UTC bounds for date-only requests', () => {
    const bounds = buildReportDateBounds('2026-06-20', '2026-06-23');

    assert.equal(bounds.requestedFrom, '2026-06-20');
    assert.equal(bounds.requestedTo, '2026-06-23');
    assert.equal(bounds.fromInclusive.toISOString(), '2026-06-20T00:00:00.000Z');
    assert.equal(bounds.toInclusive.toISOString(), '2026-06-23T23:59:59.999Z');
  });

  it('rejects inverted ranges', () => {
    assert.throws(() => buildReportDateBounds('2026-06-24', '2026-06-20'), /from.*to/i);
  });
});

describe('parseCallStartTime', () => {
  it('parses Twilio RFC2822 start_time values', () => {
    const parsed = parseCallStartTime('Fri, 26 Jun 2026 15:12:57 +0000');
    assert.equal(parsed?.toISOString(), '2026-06-26T15:12:57.000Z');
  });

  it('returns null for invalid values', () => {
    assert.equal(parseCallStartTime('not-a-date'), null);
    assert.equal(parseCallStartTime(null), null);
  });
});

describe('filterCallsByDateRange', () => {
  it('keeps only calls within the inclusive UTC interval', () => {
    const bounds = buildReportDateBounds('2026-06-20', '2026-06-23');
    const calls = [
      { dateTime: '2026-06-19T23:59:59.999Z', destination: '+1' },
      { dateTime: '2026-06-20T00:00:00.000Z', destination: '+2' },
      { dateTime: 'Fri, 20 Jun 2026 12:00:00 +0000', destination: '+3' },
      { dateTime: '2026-06-23T23:59:59.999Z', destination: '+4' },
      { dateTime: '2026-06-24T00:00:00.000Z', destination: '+5' },
      { dateTime: 'Fri, 26 Jun 2026 15:12:57 +0000', destination: '+6' },
      { dateTime: 'invalid-date', destination: '+7' },
    ];

    const result = filterCallsByDateRange(calls, bounds);

    assert.equal(result.rowsBeforeDateFilter, 7);
    assert.equal(result.rowsAfterDateFilter, 3);
    assert.equal(result.invalidStartTimeCount, 1);
    assert.deepEqual(
      result.calls.map((call) => call.destination),
      ['+2', '+3', '+4']
    );
  });
});

describe('parseReportDateRange', () => {
  it('returns UTC start/end dates aligned with requested values', () => {
    const { start, end } = parseReportDateRange('2026-06-20', '2026-06-23');
    assert.equal(start.toISOString(), '2026-06-20T00:00:00.000Z');
    assert.equal(end.toISOString(), '2026-06-23T23:59:59.999Z');
  });
});
