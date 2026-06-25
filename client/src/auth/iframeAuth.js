import { exchangeIframeToken, getIframeConfig, getMe } from '../api/authClient.js';

function readQueryToken() {
  const params = new URLSearchParams(window.location.search);
  return params.get('auth')?.trim() || null;
}

function removeQueryToken() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('auth')) {
    return;
  }
  params.delete('auth');
  const query = params.toString();
  const nextUrl = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
  window.history.replaceState({}, '', nextUrl);
}

function isAllowedOrigin(eventOrigin, allowedParentOrigin) {
  if (!allowedParentOrigin) {
    return true;
  }
  return eventOrigin === allowedParentOrigin;
}

function listenForParentToken(allowedParentOrigin, onToken) {
  function handleMessage(event) {
    if (!isAllowedOrigin(event.origin, allowedParentOrigin)) {
      return;
    }

    const data = event.data;
    if (!data || typeof data !== 'object' || data.type !== 'PEGASUS_AUTH') {
      return;
    }

    const token = typeof data.token === 'string' ? data.token.trim() : '';
    if (!token) {
      return;
    }

    onToken(token);
  }

  window.addEventListener('message', handleMessage);
  return () => window.removeEventListener('message', handleMessage);
}

async function establishSessionFromToken(token) {
  await exchangeIframeToken(token);
  const { user } = await getMe();
  return user;
}

/**
 * Bootstrap Pegasus iframe auth.
 * Priority: existing session → URL ?auth= → parent postMessage → dev manual token.
 */
export async function bootstrapIframeAuth({ manualToken } = {}) {
  try {
    const existing = await getMe();
    if (existing?.user) {
      return { status: 'authenticated', user: existing.user };
    }
  } catch {
    // continue bootstrap
  }

  const queryToken = readQueryToken();
  if (queryToken) {
    const user = await establishSessionFromToken(queryToken);
    removeQueryToken();
    return { status: 'authenticated', user };
  }

  if (manualToken?.trim()) {
    const user = await establishSessionFromToken(manualToken.trim());
    return { status: 'authenticated', user };
  }

  const config = await getIframeConfig();

  return {
    status: 'awaiting_parent',
    allowedParentOrigin: config.allowedParentOrigin || '',
    listenForToken: (onToken) => listenForParentToken(config.allowedParentOrigin, onToken),
  };
}
