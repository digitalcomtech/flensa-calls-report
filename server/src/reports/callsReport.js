import { env } from '../env.js';
import { resolveUserScope } from '../pegasus/scope.js';
import { buildMockCallsReport } from './callsReport.mock.js';

export async function buildCallsReport({ from, to, user } = {}) {
  const scope = await resolveUserScope(user);

  if (env.useMockReport) {
    return buildMockCallsReport({
      from,
      to,
      allowedDestinations: scope.destinations,
      scopeMeta: {
        destinationCount: scope.destinationCount,
        isDevSession: scope.isDevSession,
        hasPegasusToken: scope.hasPegasusToken,
      },
    });
  }

  throw new Error(
    'Live Twilio/Pegasus report integration is not enabled yet. Set USE_MOCK_REPORT=true for development.'
  );
}
