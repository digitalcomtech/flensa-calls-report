export function parseDate(value, fallback) {
  if (!value) {
    return fallback;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${value}`);
  }

  return date;
}

export function endOfDay(date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

export function parseReportDateRange(from, to) {
  const end = endOfDay(parseDate(to, new Date()));
  const start = parseDate(from, new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000));
  start.setHours(0, 0, 0, 0);

  if (start > end) {
    throw new Error('`from` must be on or before `to`');
  }

  return { start, end };
}

export function formatTwilioDateParam(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${value}`);
  }

  return date.toISOString().slice(0, 10);
}
