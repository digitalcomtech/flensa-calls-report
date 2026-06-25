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

  if (response.headers.get('content-type')?.includes('application/json')) {
    return response.json();
  }

  return response;
}

export function getCallsReport({ from, to }) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  return request(`/reports/calls?${params}`);
}

export function exportCallsUrl({ from, to }) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  return `${API_BASE}/reports/calls/export?${params}`;
}
