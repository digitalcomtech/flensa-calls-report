/**
 * Future Fase 1 integration: query Twilio call logs for a date range,
 * then filter to destination numbers from Pegasus triggers.
 *
 * Not called while USE_MOCK_REPORT=true.
 */
import twilio from 'twilio';
import { env } from '../env.js';

function getClient() {
  if (!env.twilio.accountSid || !env.twilio.authToken) {
    throw new Error('Twilio credentials are not configured');
  }
  return twilio(env.twilio.accountSid, env.twilio.authToken);
}

export async function listCalls({ from, to, destinations = [], pageSize = 100 } = {}) {
  const client = getClient();
  const options = { pageSize };

  if (from) options.startTimeAfter = new Date(from);
  if (to) options.startTimeBefore = new Date(to);

  const calls = await client.calls.list(options);
  const destinationSet = new Set(destinations);

  return calls
    .filter((call) => destinationSet.size === 0 || destinationSet.has(call.to))
    .map((call) => ({
      id: call.sid,
      dateTime: call.startTime?.toISOString() ?? null,
      destination: call.to,
      duration: Number(call.duration) || 0,
      status: call.status,
    }));
}
