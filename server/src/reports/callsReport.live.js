import { fetchTwilioCalls } from '../twilio/calls.js';
import { buildReportDateBounds, parseReportDateRange } from './dateRange.js';
import { buildSummary } from './reportSummary.js';
import { buildSafeReportScopeMeta } from './scopeDiagnostics.js';

export async function buildLiveTwilioCallsReport({ from, to, scope } = {}) {
  const bounds = buildReportDateBounds(from, to);
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
        ...buildSafeReportScopeMeta({ ...scope, warnings }, 0, {
          source: 'twilio',
          twilioDateFilter: {
            requestedFrom: bounds.requestedFrom,
            requestedTo: bounds.requestedTo,
            fromInclusive: bounds.fromInclusive.toISOString(),
            toInclusive: bounds.toInclusive.toISOString(),
            rowsBeforeDateFilter: 0,
            rowsAfterDateFilter: 0,
          },
        }),
      },
    };
  }

  const { calls, dateFilter, invalidStartTimeCount } = await fetchTwilioCalls({
    from: bounds.requestedFrom,
    to: bounds.requestedTo,
    dateBounds: bounds,
    destinations: scope.destinations,
  });

  if (invalidStartTimeCount > 0 && !warnings.includes('excluded twilio calls with invalid start_time')) {
    warnings.push('excluded twilio calls with invalid start_time');
  }

  return {
    period: { from: start.toISOString(), to: end.toISOString() },
    summary: buildSummary(calls),
    calls,
    source: 'twilio',
    scope: buildSafeReportScopeMeta({ ...scope, warnings }, calls.length, {
      source: 'twilio',
      twilioDateFilter: dateFilter,
    }),
  };
}
