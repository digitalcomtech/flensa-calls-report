import { pegasusGet } from '../pegasus/client.js';

export function normalizeLoginProfile(payload) {
  if (!payload || typeof payload !== 'object') {
    return { id: 'unknown', name: 'Pegasus User', email: null };
  }

  return {
    id: String(payload.id ?? payload.user_id ?? payload.sub ?? 'unknown'),
    name: payload.name ?? payload.username ?? payload.email ?? 'Pegasus User',
    email: payload.email ?? null,
  };
}

/**
 * Validate a Pegasus iframe/user token via GET /login with Authenticate header.
 */
export async function validatePegasusToken(token) {
  const profile = await pegasusGet('/login', { token });
  return normalizeLoginProfile(profile);
}
