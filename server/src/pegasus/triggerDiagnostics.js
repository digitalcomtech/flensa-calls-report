import { containsFullPhoneNumber } from '../reports/scopeDiagnostics.js';
import { collectProcesses, PROCESS_TYPE_FIELDS } from './triggers.js';

const SAMPLE_LIMIT = 25;
const VALUE_LIMIT = 25;
const TOP_LEVEL_KEY_LIMIT = 25;

const SENSITIVE_TRIGGER_KEYS = new Set([
  'email',
  'token',
  'pegasusToken',
  'accessToken',
  'password',
  'secret',
  'webhook',
  'url',
  'callback',
  'auth',
  'cookie',
  'prefs',
  'username',
  'name',
  'vehicle',
  'group',
]);

const PROCESS_ARRAY_PATHS = [
  { path: 'processes', getter: (trigger) => trigger.processes },
  { path: 'process', getter: (trigger) => (Array.isArray(trigger.process) ? trigger.process : null) },
  { path: 'config.processes', getter: (trigger) => trigger.config?.processes },
  { path: 'actions', getter: (trigger) => trigger.actions },
  { path: 'config.actions', getter: (trigger) => trigger.config?.actions },
  { path: 'tasks', getter: (trigger) => trigger.tasks },
  { path: 'config.tasks', getter: (trigger) => trigger.config?.tasks },
];

const PROCESS_OBJECT_PATHS = [
  { path: 'process', getter: (trigger) => (!Array.isArray(trigger.process) ? trigger.process : null) },
  { path: 'config.process', getter: (trigger) => trigger.config?.process },
];

const DESTINATION_FIELD_PATHS = [
  { path: 'config.destinations', getter: (process) => process.config?.destinations },
  { path: 'destinations', getter: (process) => process.destinations },
  { path: 'destination', getter: (process) => process.destination },
  { path: 'phones', getter: (process) => process.phones },
  { path: 'phone', getter: (process) => process.phone },
  { path: 'numbers', getter: (process) => process.numbers },
  { path: 'recipients', getter: (process) => process.recipients },
  { path: 'to', getter: (process) => process.to },
  { path: 'params.to', getter: (process) => process.params?.to },
  { path: 'params.destinations', getter: (process) => process.params?.destinations },
  { path: 'settings.to', getter: (process) => process.settings?.to },
  { path: 'settings.destinations', getter: (process) => process.settings?.destinations },
  { path: 'config.destination', getter: (process) => process.config?.destination },
  { path: 'number', getter: (process) => process.number },
  { path: 'recipient', getter: (process) => process.recipient },
  { path: 'config.params.to', getter: (process) => process.config?.params?.to },
  { path: 'config.params.destinations', getter: (process) => process.config?.params?.destinations },
  { path: 'config.settings.to', getter: (process) => process.config?.settings?.to },
  { path: 'config.settings.destinations', getter: (process) => process.config?.settings?.destinations },
];

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function countArrayValue(value) {
  return Array.isArray(value) ? value.length : 0;
}

function countObjectValue(value) {
  return isPlainObject(value) ? 1 : 0;
}

function isSafeProcessTypeValue(value) {
  if (typeof value !== 'string') {
    return false;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 64) {
    return false;
  }

  const lower = trimmed.toLowerCase();
  if (lower.includes('@') || lower.includes('http') || lower.includes('webhook')) {
    return false;
  }

  if (containsFullPhoneNumber(trimmed)) {
    return false;
  }

  return true;
}

function collectProcessTypeValues(process, valuesSeen, fieldsSeen) {
  if (!isPlainObject(process)) {
    return;
  }

  for (const field of PROCESS_TYPE_FIELDS) {
    if (field in process) {
      fieldsSeen.add(field);
      const value = process[field];
      if (isSafeProcessTypeValue(value)) {
        valuesSeen.add(String(value).trim());
      }
    }

    if (isPlainObject(process.config) && field in process.config) {
      fieldsSeen.add(`config.${field}`);
      const value = process.config[field];
      if (isSafeProcessTypeValue(value)) {
        valuesSeen.add(String(value).trim());
      }
    }
  }
}

function countDestinationField(value) {
  if (Array.isArray(value)) {
    return value.length;
  }
  if (value === null || value === undefined || value === '') {
    return 0;
  }
  return 1;
}

export function buildTriggerDiagnostics(triggersInput, { sampleLimit = SAMPLE_LIMIT } = {}) {
  const triggers = Array.isArray(triggersInput) ? triggersInput : [];
  const sampled = triggers.slice(0, sampleLimit);
  const triggerTopLevelKeysSeen = new Set();
  const processTypeFieldsSeen = new Set();
  const processTypeValuesSeen = new Set();
  const processArrayCounts = new Map(PROCESS_ARRAY_PATHS.map((entry) => [entry.path, 0]));
  const processObjectCounts = new Map(PROCESS_OBJECT_PATHS.map((entry) => [entry.path, 0]));
  const destinationFieldCounts = new Map(DESTINATION_FIELD_PATHS.map((entry) => [entry.path, 0]));

  for (const trigger of sampled) {
    if (!isPlainObject(trigger)) {
      continue;
    }

    for (const key of Object.keys(trigger)) {
      if (!SENSITIVE_TRIGGER_KEYS.has(key)) {
        triggerTopLevelKeysSeen.add(key);
      }
    }

    for (const entry of PROCESS_ARRAY_PATHS) {
      const current = processArrayCounts.get(entry.path) ?? 0;
      processArrayCounts.set(entry.path, current + countArrayValue(entry.getter(trigger)));
    }

    for (const entry of PROCESS_OBJECT_PATHS) {
      const current = processObjectCounts.get(entry.path) ?? 0;
      processObjectCounts.set(entry.path, current + countObjectValue(entry.getter(trigger)));
    }

    for (const process of collectProcesses(trigger)) {
      collectProcessTypeValues(process, processTypeValuesSeen, processTypeFieldsSeen);

      for (const entry of DESTINATION_FIELD_PATHS) {
        const current = destinationFieldCounts.get(entry.path) ?? 0;
        destinationFieldCounts.set(entry.path, current + countDestinationField(entry.getter(process)));
      }
    }
  }

  return {
    sampledTriggerCount: sampled.length,
    triggerTopLevelKeysSeen: [...triggerTopLevelKeysSeen].slice(0, TOP_LEVEL_KEY_LIMIT),
    processArrayPaths: PROCESS_ARRAY_PATHS.map((entry) => ({
      path: entry.path,
      count: processArrayCounts.get(entry.path) ?? 0,
    })),
    processObjectPaths: PROCESS_OBJECT_PATHS.map((entry) => ({
      path: entry.path,
      count: processObjectCounts.get(entry.path) ?? 0,
    })),
    processTypeFieldsSeen: [...processTypeFieldsSeen].slice(0, VALUE_LIMIT),
    processTypeValuesSeen: [...processTypeValuesSeen].slice(0, VALUE_LIMIT),
    destinationFieldPathsSeen: DESTINATION_FIELD_PATHS.map((entry) => ({
      path: entry.path,
      count: destinationFieldCounts.get(entry.path) ?? 0,
    })),
  };
}
