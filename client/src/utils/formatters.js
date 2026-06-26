export function formatInteger(value) {
  if (value == null || Number.isNaN(Number(value))) {
    return '—';
  }
  return Number(value).toLocaleString('es-MX');
}

export function formatPercentage(value) {
  if (value == null || Number.isNaN(Number(value))) {
    return '—';
  }
  const num = Number(value);
  if (num % 1 === 0) {
    return `${num.toFixed(0)}`;
  }
  return `${num.toFixed(1)}`;
}

export function formatPercentageWithSymbol(value) {
  const formatted = formatPercentage(value);
  return formatted === '—' ? formatted : `${formatted}%`;
}

export function formatSeconds(value) {
  if (value == null || Number.isNaN(Number(value))) {
    return '—';
  }
  const num = Number(value);
  if (num === 0) {
    return '0s';
  }
  if (num % 1 === 0) {
    return `${num}s`;
  }
  return `${num.toFixed(1)}s`;
}
