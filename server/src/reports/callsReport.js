import { env } from '../env.js';
import { resolveUserScope } from '../pegasus/scope.js';
import { buildLiveTwilioCallsReport } from './callsReport.live.js';
import { buildMockCallsReport } from './callsReport.mock.js';
import { buildSafeReportScopeMeta } from './scopeDiagnostics.js';

export async function buildCallsReport({ from, to, user } = {}) {
  const scope = await resolveUserScope(user);

  if (env.useMockReport) {
    const report = buildMockCallsReport({
      from,
      to,
      allowedDestinations: scope.destinations,
    });

    return {
      ...report,
      scope: buildSafeReportScopeMeta(scope, report.calls.length, { source: 'mock' }),
    };
  }

  return buildLiveTwilioCallsReport({ from, to, scope });
}
