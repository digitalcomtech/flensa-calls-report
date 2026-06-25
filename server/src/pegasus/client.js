import { env } from '../env.js';

export class PegasusApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'PegasusApiError';
    this.status = status;
  }
}

function buildUrl(path) {
  const base = env.pegasus.apiUrl.replace(/\/$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

function pegasusHeaders(token) {
  return {
    Authenticate: token,
    Accept: 'application/json',
  };
}

/**
 * Authenticated Pegasus GET. Never logs the token.
 */
export async function pegasusGet(path, { token, signal } = {}) {
  if (!token) {
    throw new PegasusApiError(401, 'Pegasus token is required');
  }
  if (!env.pegasus.apiUrl) {
    throw new PegasusApiError(503, 'Pegasus API URL is not configured');
  }

  let response;
  try {
    response = await fetch(buildUrl(path), {
      method: 'GET',
      headers: pegasusHeaders(token),
      signal,
    });
  } catch {
    throw new PegasusApiError(503, 'Pegasus API is unreachable');
  }

  if (!response.ok) {
    throw new PegasusApiError(response.status, `Pegasus request failed (${response.status})`);
  }

  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return null;
  }

  return response.json();
}
