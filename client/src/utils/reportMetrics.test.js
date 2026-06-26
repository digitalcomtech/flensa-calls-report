import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { averageDurationSeconds, buildSummaryTableRows } from './reportMetrics.js';

const fixtureReport = {
  source: 'twilio',
  scope: {
    destinationCount: 7,
    matchedTwilioRows: 23,
  },
  summary: {
    totalCalls: 23,
    answered: { count: 23, percentage: 100 },
    notAnswered: { count: 0, percentage: 0 },
  },
  calls: [
    {
      dateTime: 'Mon, 22 Jun 2026 23:41:50 +0000',
      destination: '+524613461359',
      duration: 15,
      status: 'completed',
    },
    {
      dateTime: 'Mon, 22 Jun 2026 23:42:50 +0000',
      destination: '+524613461360',
      duration: 21,
      status: 'completed',
    },
  ],
};

describe('reportMetrics', () => {
  it('computes average duration across calls', () => {
    assert.equal(averageDurationSeconds(fixtureReport.calls), 18);
    assert.equal(averageDurationSeconds([]), 0);
  });

  it('builds summary table rows from fixture report', () => {
    const rows = buildSummaryTableRows(fixtureReport.summary);

    assert.equal(rows.length, 3);
    assert.deepEqual(rows[0], {
      concept: 'Contestadas',
      count: 23,
      percentage: '100',
    });
    assert.deepEqual(rows[1], {
      concept: 'Llamadas totales',
      count: 23,
      percentage: '100.0',
    });
    assert.deepEqual(rows[2], {
      concept: 'No contestadas',
      count: 0,
      percentage: '0',
    });
  });

  it('handles empty summary safely', () => {
    const rows = buildSummaryTableRows({
      totalCalls: 0,
      answered: { count: 0, percentage: 0 },
      notAnswered: { count: 0, percentage: 0 },
    });

    assert.deepEqual(rows[1], {
      concept: 'Llamadas totales',
      count: 0,
      percentage: '0',
    });
    assert.equal(averageDurationSeconds([]), 0);
  });
});
