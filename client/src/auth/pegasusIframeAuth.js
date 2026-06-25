import { exchangeIframeToken, getMe } from '../api/authClient.js';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/;

export function normalizePegasusToken(raw) {
  if (raw === null || raw === undefined) {
    return null;
  }

  let decoded = String(raw).trim();
  if (!decoded) {
    return null;
  }

  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    return null;
  }

  decoded = decoded.trim();
  if (!decoded || !TOKEN_PATTERN.test(decoded)) {
    return null;
  }

  return decoded;
}

function readHashToken(hash) {
  if (!hash || hash === '#') {
    return null;
  }

  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  return normalizePegasusToken(params.get('token'));
}

export function extractPegasusTokenFromUrl(href) {
  const url = new URL(href, 'http://localhost');

  const hashToken = readHashToken(url.hash);
  if (hashToken) {
    return hashToken;
  }

  const authToken = normalizePegasusToken(url.searchParams.get('auth'));
  if (authToken) {
    return authToken;
  }

  return normalizePegasusToken(url.searchParams.get('access_token'));
}

export function stripPegasusTokenFromUrl(href) {
  const url = new URL(href, 'http://localhost');

  if (url.hash) {
    const hashParams = new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : url.hash);
    if (hashParams.has('token')) {
      hashParams.delete('token');
      const remaining = hashParams.toString();
      url.hash = remaining ? `#${remaining}` : '';
    }
  }

  url.searchParams.delete('auth');
  url.searchParams.delete('access_token');

  const search = url.searchParams.toString();
  return `${url.pathname}${search ? `?${search}` : ''}${url.hash}`;
}

export function clearPegasusTokenFromBrowserUrl() {
  if (typeof window === 'undefined') {
    return;
  }

  const nextUrl = stripPegasusTokenFromUrl(window.location.href);
  window.history.replaceState({}, '', nextUrl);
}

export function readPegasusTokenFromBrowserUrl() {
  if (typeof window === 'undefined') {
    return null;
  }

  return extractPegasusTokenFromUrl(window.location.href);
}

export async function exchangePegasusIframeToken(token) {
  await exchangeIframeToken(token);
  const { user } = await getMe();
  return user;
}

export const PEGASUS_AUTH_ERROR_MESSAGE = 'Could not validate Pegasus session.';
