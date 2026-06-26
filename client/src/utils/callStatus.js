const PROVIDER_STATUS_LABELS = {
  completed: 'Completada',
  'no-answer': 'Sin respuesta',
  busy: 'Ocupado',
  failed: 'Fallida',
  canceled: 'Cancelada',
  queued: 'En cola',
  ringing: 'Timbrando',
  'in-progress': 'En curso',
};

const NOT_ANSWERED_STATUSES = new Set(['no-answer', 'busy', 'failed', 'canceled']);

export function formatProviderStatus(status) {
  if (status == null || status === '') {
    return '—';
  }

  const key = String(status).toLowerCase();
  return PROVIDER_STATUS_LABELS[key] ?? status;
}

export function formatAnsweredLabel(status) {
  if (status == null || status === '') {
    return '—';
  }

  const key = String(status).toLowerCase();
  if (key === 'completed') {
    return 'Sí';
  }
  if (NOT_ANSWERED_STATUSES.has(key)) {
    return 'No';
  }
  return '—';
}
