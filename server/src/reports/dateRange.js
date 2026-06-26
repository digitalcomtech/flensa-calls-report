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
  next.setUTCHours(23, 59, 59, 999);
  return next;
}

export function normalizeDateOnly(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${value}`);
  }

  return date.toISOString().slice(0, 10);
}

export function buildReportDateBounds(from, to) {
  const requestedTo = to ? normalizeDateOnly(to) : normalizeDateOnly(new Date());
  const defaultFromDate = new Date(`${requestedTo}T00:00:00.000Z`);
  defaultFromDate.setUTCDate(defaultFromDate.getUTCDate() - 7);
  const requestedFrom = from ? normalizeDateOnly(from) : normalizeDateOnly(defaultFromDate);

  const fromInclusive = new Date(`${requestedFrom}T00:00:00.000Z`);
  const toInclusive = new Date(`${requestedTo}T23:59:59.999Z`);

  if (fromInclusive > toInclusive) {
    throw new Error('`from` must be on or before `to`');
  }

  return {
    requestedFrom,
    requestedTo,
    fromInclusive,
    toInclusive,
  };
}

export function parseReportDateRange(from, to) {
  const bounds = buildReportDateBounds(from, to);
  return {
    start: bounds.fromInclusive,
    end: bounds.toInclusive,
    ...bounds,
  };
}

export function formatTwilioDateParam(value) {
  return normalizeDateOnly(value);
}

export function parseCallStartTime(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value !== 'string' && typeof value !== 'number') {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function isWithinReportDateRange(callTime, fromInclusive, toInclusive) {
  if (!callTime) {
    return false;
  }

  const timestamp = callTime.getTime();
  return timestamp >= fromInclusive.getTime() && timestamp <= toInclusive.getTime();
}

export function filterCallsByDateRange(calls, bounds) {
  const rowsBeforeDateFilter = calls.length;
  const filtered = [];
  let invalidStartTimeCount = 0;

  for (const call of calls) {
    const startTime = parseCallStartTime(call.dateTime);
    if (!startTime) {
      invalidStartTimeCount += 1;
      continue;
    }

    if (isWithinReportDateRange(startTime, bounds.fromInclusive, bounds.toInclusive)) {
      filtered.push(call);
    }
  }

  return {
    calls: filtered,
    rowsBeforeDateFilter,
    rowsAfterDateFilter: filtered.length,
    invalidStartTimeCount,
  };
}
