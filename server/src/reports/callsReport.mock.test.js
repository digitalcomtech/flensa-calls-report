import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildMockCallsReport, filterCallsByDestinations, MOCK_CALLS } from './callsReport.mock.js';

describe('callsReport.mock scoping', () => {
  it('filters mock calls to allowed destinations only', () => {
    const report = buildMockCallsReport({
      from: '2026-06-20',
      to: '2026-06-23',
      allowedDestinations: ['+525512345678'],
    });

    assert.equal(report.calls.length, 2);
    assert.ok(report.calls.every((call) => call.destination === '+525512345678'));
    assert.equal(report.summary.totalCalls, report.calls.length);
  });

  it('returns empty report when no destinations are allowed', () => {
    const report = buildMockCallsReport({
      from: '2026-06-20',
      to: '2026-06-23',
      allowedDestinations: [],
    });

    assert.equal(report.summary.totalCalls, 0);
    assert.equal(report.calls.length, 0);
    assert.equal(report.summary.answered.count + report.summary.notAnswered.count, 0);
  });

  it('summary totals always match filtered detail rows', () => {
    const filtered = filterCallsByDestinations(MOCK_CALLS, ['+525512345678', '+525587654321']);
    const report = buildMockCallsReport({
      from: '2026-06-20',
      to: '2026-06-23',
      allowedDestinations: ['+525512345678', '+525587654321'],
    });

    assert.equal(report.summary.totalCalls, filtered.length);
    assert.equal(report.calls.length, filtered.length);
  });
});
