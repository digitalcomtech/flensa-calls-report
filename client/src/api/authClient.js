const API_BASE = '/api';

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${response.status}`);
  }

  return response.json();
}

export function getMe() {
  return request('/auth/me');
}

export function logout() {
  return request('/auth/logout', { method: 'POST' });
}

export function getIframeConfig() {
  return request('/auth/iframe-config');
}

export function exchangeIframeToken(token) {
  return request('/auth/iframe', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

export function createDevSession() {
  return request('/auth/dev-session', { method: 'POST' });
}
