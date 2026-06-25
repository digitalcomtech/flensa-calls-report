import { getIframeConfig, getMe } from '../api/authClient.js';
import {
  clearPegasusTokenFromBrowserUrl,
  exchangePegasusIframeToken,
  PEGASUS_AUTH_ERROR_MESSAGE,
  readPegasusTokenFromBrowserUrl,
} from './pegasusIframeAuth.js';

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
  try {
    return await exchangePegasusIframeToken(token);
  } catch {
    throw new Error(PEGASUS_AUTH_ERROR_MESSAGE);
  }
}

async function exchangeBrowserUrlToken() {
  const urlToken = readPegasusTokenFromBrowserUrl();
  if (!urlToken) {
    return null;
  }

  try {
    const user = await establishSessionFromToken(urlToken);
    clearPegasusTokenFromBrowserUrl();
    return user;
  } catch (error) {
    clearPegasusTokenFromBrowserUrl();
    throw error;
  }
}

/**
 * Bootstrap Pegasus iframe auth.
 * Priority: existing session → URL token → parent postMessage → dev manual token.
 */
export async function bootstrapIframeAuth({ manualToken } = {}) {
  try {
    const existing = await getMe();
    if (existing?.user) {
      clearPegasusTokenFromBrowserUrl();
      return { status: 'authenticated', user: existing.user };
    }
  } catch {
    // continue bootstrap
  }

  const urlUser = await exchangeBrowserUrlToken();
  if (urlUser) {
    return { status: 'authenticated', user: urlUser };
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
