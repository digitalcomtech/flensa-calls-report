import { formatAnsweredLabel, formatProviderStatus } from './callStatus.js';

export const DETALLE_COLUMNS = [
  { key: 'dateTime', header: 'Fecha/hora llamada' },
  { key: 'destination', header: 'Teléfono llamado' },
  { key: 'duration', header: 'Duración llamada (seg)' },
  { key: 'answered', header: 'Contestada' },
  { key: 'providerStatus', header: 'Estado proveedor' },
];

export function formatCallDateTime(value) {
  if (!value) {
    return '—';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('es-MX');
}

export function formatDurationSecondsValue(value) {
  if (value == null || Number.isNaN(Number(value))) {
    return '—';
  }

  const num = Number(value);
  if (num === 0) {
    return '0';
  }
  if (num % 1 === 0) {
    return String(num);
  }
  return num.toFixed(1);
}

export function mapCallToDetailRow(call) {
  return {
    dateTime: formatCallDateTime(call?.dateTime),
    destination: call?.destination ?? '—',
    duration: formatDurationSecondsValue(call?.duration),
    answered: formatAnsweredLabel(call?.status),
    providerStatus: formatProviderStatus(call?.status),
  };
}

export function mapCallsToDetailRows(calls = []) {
  return calls.map(mapCallToDetailRow);
}

export function callMatchesSearch(call, query) {
  const row = mapCallToDetailRow(call);
  const haystack = [
    row.dateTime,
    row.destination,
    row.duration,
    row.answered,
    row.providerStatus,
    call?.status,
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(query);
}
