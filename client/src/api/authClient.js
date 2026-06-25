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
  return fetch(`${API_BASE}/auth/iframe`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  }).then(async (response) => {
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      if (response.status === 401) {
        throw new Error('Could not validate Pegasus session.');
      }
      throw new Error(body.error || `Request failed: ${response.status}`);
    }
    return response.json();
  });
}

export function createDevSession() {
  return request('/auth/dev-session', { method: 'POST' });
}
