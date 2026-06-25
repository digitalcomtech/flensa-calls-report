import crypto from 'crypto';
import { env } from '../env.js';

const STATE_COOKIE = 'pegasus_oauth_state';

export function getAuthorizationUrl(state) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: env.pegasus.clientId,
    redirect_uri: env.pegasus.redirectUri,
    scope: 'openid profile',
    state,
  });

  return `${env.pegasus.apiUrl}/oauth/authorize?${params}`;
}

export function createOAuthState() {
  return crypto.randomBytes(24).toString('hex');
}

export async function exchangeCodeForTokens(code) {
  const response = await fetch(`${env.pegasus.apiUrl}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: env.pegasus.clientId,
      client_secret: env.pegasus.clientSecret,
      redirect_uri: env.pegasus.redirectUri,
    }),
  });

  if (!response.ok) {
    throw new Error(`Pegasus token exchange failed (${response.status})`);
  }

  return response.json();
}

export async function fetchUserProfile(accessToken) {
  const response = await fetch(`${env.pegasus.apiUrl}/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Pegasus profile fetch failed (${response.status})`);
  }

  return response.json();
}

export { STATE_COOKIE };
