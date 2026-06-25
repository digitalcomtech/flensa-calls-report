import { fetchTwilioCalls } from '../twilio/calls.js';
import { parseReportDateRange } from './dateRange.js';
import { buildSummary } from './reportSummary.js';
import { buildSafeReportScopeMeta } from './scopeDiagnostics.js';

export async function buildLiveTwilioCallsReport({ from, to, scope } = {}) {
  const { start, end } = parseReportDateRange(from, to);
  const warnings = [...(scope.warnings ?? [])];

  if ((scope.destinationCount ?? 0) === 0) {
    if (!warnings.includes('no scoped destinations')) {
      warnings.push('no scoped destinations');
    }

    return {
      period: { from: start.toISOString(), to: end.toISOString() },
      summary: buildSummary([]),
      calls: [],
      source: 'twilio',
      scope: {
        ...buildSafeReportScopeMeta({ ...scope, warnings }, 0, { source: 'twilio' }),
      },
    };
  }

  const calls = await fetchTwilioCalls({
    from: start,
    to: end,
    destinations: scope.destinations,
  });

  return {
    period: { from: start.toISOString(), to: end.toISOString() },
    summary: buildSummary(calls),
    calls,
    source: 'twilio',
    scope: buildSafeReportScopeMeta(scope, calls.length, { source: 'twilio' }),
  };
}
