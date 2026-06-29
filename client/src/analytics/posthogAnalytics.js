const ANON_ID_STORAGE_KEY = 'flensa_calls_report_analytics_id';

const SENSITIVE_KEY_FRAGMENTS = [
  'email',
  'name',
  'username',
  'phone',
  'token',
  'auth',
  'authorization',
  'password',
  'cookie',
  'session',
  'localstorage',
  'sessionstorage',
  'vin',
  'plate',
  'licenseplate',
  'driver',
  'latitude',
  'longitude',
  'lat',
  'lng',
  'raw',
  'payload',
  'notes',
  'description',
];

export const analyticsEvents = {
  CALLS_REPORT_LOADED: 'calls_report_loaded',
  CALL_STATUS_FILTER_APPLIED: 'call_status_filter_applied',
  CALL_ROW_OPENED: 'call_row_opened',
  CALL_DETAILS_OPENED: 'call_details_opened',
  SEARCH_SUBMITTED: 'search_submitted',
  EXPORT_CSV_CLICKED: 'export_csv_clicked',
};

let distinctId = null;
let initialized = false;

function readEnv(name) {
  return import.meta.env[name];
}

function isExplicitlyEnabled() {
  return readEnv('VITE_ENABLE_POSTHOG') === 'true';
}

function getAppEnv() {
  return String(readEnv('VITE_APP_ENV') || (import.meta.env.PROD ? 'production' : 'development')).toLowerCase();
}

function getPostHogKey() {
  return String(readEnv('VITE_POSTHOG_KEY') || '').trim();
}

function isPreviewLikeEnv() {
  return ['preview', 'qa', 'staging'].includes(getAppEnv());
}

export function isAnalyticsConfiguredToRun() {
  const key = getPostHogKey();
  if (!key.startsWith('phc_')) {
    return false;
  }

  if (import.meta.env.DEV) {
    return isExplicitlyEnabled();
  }

  if (isPreviewLikeEnv()) {
    return isExplicitlyEnabled();
  }

  return import.meta.env.PROD;
}

export function assertValidPostHogKey({ key = getPostHogKey(), context = 'runtime' } = {}) {
  const misconfigured = () => {
    const prefix = key ? key.slice(0, 8) : '(missing)';
    throw new Error(
      `PostHog analytics misconfigured (${context}): VITE_POSTHOG_KEY must start with "phc_" (got ${prefix})`
    );
  };

  if (isExplicitlyEnabled() && !key.startsWith('phc_')) {
    misconfigured();
  }

  if (import.meta.env.PROD && !isPreviewLikeEnv() && key && !key.startsWith('phc_')) {
    misconfigured();
  }
}

function isSensitiveKey(key) {
  const normalized = String(key).toLowerCase();
  return SENSITIVE_KEY_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}

export function sanitizeProperties(props = {}) {
  if (!props || typeof props !== 'object' || Array.isArray(props)) {
    return {};
  }

  const safe = {};

  for (const [key, value] of Object.entries(props)) {
    if (isSensitiveKey(key)) {
      continue;
    }

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      safe[key] = sanitizeProperties(value);
      continue;
    }

    safe[key] = value;
  }

  return safe;
}

export function getBrowserContextProps() {
  if (typeof window === 'undefined') {
    return {};
  }

  const safeCurrentUrl = `${window.location.origin}${window.location.pathname}`;

  return {
    app_host: window.location.hostname,
    $current_url: safeCurrentUrl,
    $host: window.location.hostname,
    $pathname: window.location.pathname,
  };
}

export function bucketResultCount(count) {
  const value = Number(count);
  if (!Number.isFinite(value) || value <= 0) {
    return '0';
  }
  if (value <= 10) {
    return '1-10';
  }
  if (value <= 50) {
    return '11-50';
  }
  if (value <= 100) {
    return '51-100';
  }
  if (value <= 500) {
    return '101-500';
  }
  return '500+';
}

function readStorage(storage) {
  try {
    return storage.getItem(ANON_ID_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStorage(storage, value) {
  try {
    storage.setItem(ANON_ID_STORAGE_KEY, value);
    return true;
  } catch {
    return false;
  }
}

function createAnonymousId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `anon_${crypto.randomUUID()}`;
  }

  return `anon_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function resolveDistinctId(userContext = {}) {
  const safeUserId = userContext?.userId ?? userContext?.id;
  if (safeUserId != null && String(safeUserId).trim() && String(safeUserId) !== 'unknown') {
    return String(safeUserId);
  }

  if (typeof window === 'undefined') {
    return createAnonymousId();
  }

  const sessionValue = readStorage(window.sessionStorage);
  if (sessionValue) {
    return sessionValue;
  }

  const localValue = readStorage(window.localStorage);
  if (localValue) {
    writeStorage(window.sessionStorage, localValue);
    return localValue;
  }

  const nextId = createAnonymousId();
  writeStorage(window.sessionStorage, nextId);
  writeStorage(window.localStorage, nextId);
  return nextId;
}

function getBaseProps() {
  return {
    app_name: readEnv('VITE_APP_NAME') || 'flensa-calls-report',
    environment: getAppEnv(),
  };
}

function getPostHogHost() {
  return String(readEnv('VITE_POSTHOG_HOST') || 'https://us.i.posthog.com').replace(/\/$/, '');
}

async function sendCapture(eventName, properties) {
  if (!isAnalyticsConfiguredToRun()) {
    return;
  }

  const apiKey = getPostHogKey();

  try {
    await fetch(`${getPostHogHost()}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        event: eventName,
        distinct_id: distinctId,
        properties,
      }),
      keepalive: true,
    });
  } catch {
    // Best-effort analytics transport; never break the app.
  }
}

export function initAnalytics(userContext) {
  assertValidPostHogKey();

  distinctId = resolveDistinctId(userContext);
  initialized = true;
}

export function resetAnalytics() {
  distinctId = null;
  initialized = false;
}

export function trackEvent(eventName, props = {}) {
  if (!initialized || !isAnalyticsConfiguredToRun()) {
    return;
  }

  const safeProps = sanitizeProperties(props);
  const screenName = safeProps.page || safeProps.module || 'unknown';

  void sendCapture(
    eventName,
    sanitizeProperties({
      ...getBaseProps(),
      ...getBrowserContextProps(),
      $screen_name: screenName,
      ...safeProps,
    })
  );
}
