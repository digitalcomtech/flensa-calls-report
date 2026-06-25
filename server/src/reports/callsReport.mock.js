import { buildSummary } from './reportSummary.js';
import { parseReportDateRange } from './dateRange.js';

export const MOCK_CALLS = [
  {
    id: 'mock-1',
    dateTime: '2026-06-20T14:30:00.000Z',
    destination: '+525512345678',
    duration: 42,
    status: 'completed',
  },
  {
    id: 'mock-2',
    dateTime: '2026-06-21T09:15:00.000Z',
    destination: '+525587654321',
    duration: 0,
    status: 'no-answer',
  },
  {
    id: 'mock-3',
    dateTime: '2026-06-22T18:45:00.000Z',
    destination: '+525512345678',
    duration: 18,
    status: 'completed',
  },
  {
    id: 'mock-4',
    dateTime: '2026-06-23T11:00:00.000Z',
    destination: '+525599988877',
    duration: 0,
    status: 'busy',
  },
];

export function filterCallsByDestinations(calls, allowedDestinations) {
  const allowed = new Set(allowedDestinations);
  return calls.filter((call) => allowed.has(call.destination));
}

export function buildMockCallsReport({ from, to, allowedDestinations = [] } = {}) {
  const { start, end } = parseReportDateRange(from, to);

  const inRange = MOCK_CALLS.filter((call) => {
    const callTime = new Date(call.dateTime);
    return callTime >= start && callTime <= end;
  });

  const calls = filterCallsByDestinations(inRange, allowedDestinations);

  return {
    period: { from: start.toISOString(), to: end.toISOString() },
    summary: buildSummary(calls),
    calls,
    source: 'mock',
  };
}
