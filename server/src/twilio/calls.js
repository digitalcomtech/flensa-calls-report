import { env } from '../env.js';
import { formatTwilioDateParam } from '../reports/dateRange.js';
import { filterCallsByScopedDestinations } from '../utils/phoneMatch.js';

const TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01';
const DEFAULT_PAGE_SIZE = 1000;

export class TwilioConfigError extends Error {
  constructor(message = 'Twilio credentials are not configured') {
    super(message);
    this.name = 'TwilioConfigError';
  }
}

export class TwilioApiError extends Error {
  constructor(status, message = 'Twilio request failed') {
    super(`${message} (${status})`);
    this.name = 'TwilioApiError';
    this.status = status;
  }
}

export function getTwilioCredentials() {
  return {
    accountSid: process.env.TWILIO_ACCOUNT_SID ?? env.twilio.accountSid ?? '',
    apiKeySid: process.env.TWILIO_API_KEY_SID ?? env.twilio.apiKeySid ?? '',
    apiKeySecret: process.env.TWILIO_API_KEY_SECRET ?? env.twilio.apiKeySecret ?? '',
    authToken: process.env.TWILIO_AUTH_TOKEN ?? env.twilio.authToken ?? '',
  };
}

export function isTwilioApiKeyConfigured() {
  const { accountSid, apiKeySid, apiKeySecret } = getTwilioCredentials();
  return Boolean(accountSid && apiKeySid && apiKeySecret);
}

export function assertTwilioConfigured() {
  if (!isTwilioApiKeyConfigured()) {
    throw new TwilioConfigError();
  }
}

export function buildTwilioAuthHeader(apiKeySid, apiKeySecret) {
  const encoded = Buffer.from(`${apiKeySid}:${apiKeySecret}`).toString('base64');
  return `Basic ${encoded}`;
}

export function buildTwilioCallsQueryParams({ from, to, pageSize = DEFAULT_PAGE_SIZE } = {}) {
  const params = new URLSearchParams();
  params.set('PageSize', String(pageSize));

  if (from) {
    params.set('StartTime>=', formatTwilioDateParam(from));
  }

  if (to) {
    params.set('StartTime<=', formatTwilioDateParam(to));
  }

  return params;
}

export function buildTwilioCallsUrl({ accountSid, from, to, pageSize = DEFAULT_PAGE_SIZE, nextPageUri } = {}) {
  if (nextPageUri) {
    if (nextPageUri.startsWith('http')) {
      return nextPageUri;
    }
    return `https://api.twilio.com${nextPageUri}`;
  }

  const query = buildTwilioCallsQueryParams({ from, to, pageSize });
  return `${TWILIO_API_BASE}/Accounts/${accountSid}/Calls.json?${query.toString()}`;
}

export function mapTwilioCallToDetail(call) {
  return {
    dateTime: call.start_time ?? null,
    destination: call.to ?? '',
    duration: Number(call.duration) || 0,
    status: call.status ?? 'unknown',
  };
}

async function fetchTwilioCallsPage(url, authHeader, fetchImpl = fetch) {
  let response;

  try {
    response = await fetchImpl(url, {
      method: 'GET',
      headers: {
        Authorization: authHeader,
        Accept: 'application/json',
      },
    });
  } catch {
    throw new TwilioApiError(503, 'Twilio API is unreachable');
  }

  if (!response.ok) {
    throw new TwilioApiError(response.status);
  }

  return response.json();
}

export async function fetchTwilioCalls({ from, to, destinations = [], pageSize = DEFAULT_PAGE_SIZE, fetchImpl = fetch } = {}) {
  if (!Array.isArray(destinations) || destinations.length === 0) {
    return [];
  }

  assertTwilioConfigured();

  const { accountSid, apiKeySid, apiKeySecret } = getTwilioCredentials();
  const authHeader = buildTwilioAuthHeader(apiKeySid, apiKeySecret);
  const collected = [];
  let nextUrl = buildTwilioCallsUrl({ accountSid, from, to, pageSize });

  while (nextUrl) {
    const payload = await fetchTwilioCallsPage(nextUrl, authHeader, fetchImpl);
    const pageCalls = Array.isArray(payload.calls) ? payload.calls : [];
    collected.push(...pageCalls.map(mapTwilioCallToDetail));
    nextUrl = payload.next_page_uri ? buildTwilioCallsUrl({ nextPageUri: payload.next_page_uri }) : null;
  }

  return filterCallsByScopedDestinations(collected, destinations);
}
