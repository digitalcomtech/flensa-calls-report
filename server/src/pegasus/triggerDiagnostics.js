import { containsFullPhoneNumber } from '../reports/scopeDiagnostics.js';
import { collectProcesses, PROCESS_TYPE_FIELDS } from './triggers.js';

const SAMPLE_LIMIT = 25;
const VALUE_LIMIT = 25;
const TOP_LEVEL_KEY_LIMIT = 25;
const PROCESS_SAMPLE_SHAPE_LIMIT = 5;
const PROCESS_WALK_MAX_DEPTH = 4;

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

const SENSITIVE_PROCESS_KEYS = new Set([
  ...SENSITIVE_TRIGGER_KEYS,
  'authorization',
  'apiKey',
  'api_key',
  'access_token',
]);

const EXTENDED_PROCESS_TYPE_FIELDS = [
  ...PROCESS_TYPE_FIELDS,
  'command',
  'method',
  'function',
  'functionName',
  'module',
  'handler',
  'code',
  'kind',
  'category',
  'subtype',
  'event',
  'eventType',
  'class',
  'className',
  'process',
  'processName',
];

const PROCESS_TYPE_FIELD_PREFIXES = ['', 'config.', 'params.', 'settings.', 'data.', 'payload.'];

const NESTED_OBJECT_ROOTS = [
  'config',
  'params',
  'settings',
  'data',
  'payload',
  'options',
  'properties',
  'arguments',
  'args',
  'value',
];

const SAMPLE_NESTED_OBJECT_ROOTS = ['config', 'params', 'settings', 'data', 'payload'];

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
  { path: 'config.to', getter: (process) => process.config?.to },
  { path: 'config.phone', getter: (process) => process.config?.phone },
  { path: 'config.phones', getter: (process) => process.config?.phones },
  { path: 'config.number', getter: (process) => process.config?.number },
  { path: 'config.numbers', getter: (process) => process.config?.numbers },
  { path: 'config.recipient', getter: (process) => process.config?.recipient },
  { path: 'config.recipients', getter: (process) => process.config?.recipients },
  { path: 'config.args.to', getter: (process) => process.config?.args?.to },
  { path: 'config.args.phone', getter: (process) => process.config?.args?.phone },
  { path: 'config.arguments.to', getter: (process) => process.config?.arguments?.to },
  { path: 'config.parameters.to', getter: (process) => process.config?.parameters?.to },
  { path: 'parameters.to', getter: (process) => process.parameters?.to },
  { path: 'parameters.phone', getter: (process) => process.parameters?.phone },
  { path: 'parameters.phones', getter: (process) => process.parameters?.phones },
  { path: 'payload.to', getter: (process) => process.payload?.to },
  { path: 'payload.phone', getter: (process) => process.payload?.phone },
  { path: 'payload.phones', getter: (process) => process.payload?.phones },
  { path: 'data.to', getter: (process) => process.data?.to },
  { path: 'data.phone', getter: (process) => process.data?.phone },
  { path: 'data.phones', getter: (process) => process.data?.phones },
  { path: 'value.to', getter: (process) => process.value?.to },
  { path: 'value.phone', getter: (process) => process.value?.phone },
  { path: 'value.phones', getter: (process) => process.value?.phones },
];

const PHONE_LIKE_PATTERN = /^\+?\d{7,15}$/;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function countArrayValue(value) {
  return Array.isArray(value) ? value.length : 0;
}

function countObjectValue(value) {
  return isPlainObject(value) ? 1 : 0;
}

function incrementPathCount(map, path) {
  map.set(path, (map.get(path) ?? 0) + 1);
}

function looksLikeJsonBlob(value) {
  if (typeof value !== 'string') {
    return false;
  }

  const trimmed = value.trim();
  if (trimmed.length < 2) {
    return false;
  }

  return (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  );
}

function looksLikeUnsafeTypeValue(value) {
  if (typeof value !== 'string') {
    return true;
  }

  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();

  return (
    !trimmed ||
    trimmed.length > 80 ||
    lower.includes('@') ||
    lower.includes('http') ||
    lower.includes('webhook') ||
    lower.includes('token') ||
    looksLikeJsonBlob(trimmed) ||
    containsFullPhoneNumber(trimmed)
  );
}

function isSafeProcessTypeValue(value) {
  return typeof value === 'string' && !looksLikeUnsafeTypeValue(value);
}

function normalizePhoneLikeString(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return normalizePhoneLikeString(String(value));
  }

  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().replace(/[\s\-().]/g, '');
  if (!normalized) {
    return null;
  }

  return PHONE_LIKE_PATTERN.test(normalized) ? normalized : null;
}

function looksLikePhoneValue(value) {
  if (Array.isArray(value)) {
    return value.some((item) => Boolean(normalizePhoneLikeString(item)));
  }

  return Boolean(normalizePhoneLikeString(value));
}

function isPrimitiveValue(value) {
  const valueType = typeof value;
  return valueType === 'string' || valueType === 'number' || valueType === 'boolean';
}

function getValueAtPath(object, path) {
  if (!path) {
    return object;
  }

  let current = object;
  for (const segment of path.split('.')) {
    if (!isPlainObject(current)) {
      return undefined;
    }
    current = current[segment];
  }

  return current;
}

function collectProcessTypeValues(process, valuesSeen, fieldsSeen) {
  if (!isPlainObject(process)) {
    return;
  }

  for (const prefix of PROCESS_TYPE_FIELD_PREFIXES) {
    const container = prefix ? getValueAtPath(process, prefix.slice(0, -1)) : process;
    if (!isPlainObject(container)) {
      continue;
    }

    for (const field of EXTENDED_PROCESS_TYPE_FIELDS) {
      if (!(field in container)) {
        continue;
      }

      const fieldPath = `${prefix}${field}`;
      fieldsSeen.add(fieldPath);
      const value = container[field];
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

function buildProcessSampleShape(process) {
  const topLevelKeys = Object.keys(process)
    .filter((key) => !SENSITIVE_PROCESS_KEYS.has(key))
    .sort();

  const nestedObjectKeys = {};
  for (const root of SAMPLE_NESTED_OBJECT_ROOTS) {
    const nested = process[root];
    if (isPlainObject(nested)) {
      nestedObjectKeys[root] = Object.keys(nested)
        .filter((key) => !SENSITIVE_PROCESS_KEYS.has(key))
        .sort();
    }
  }

  return { topLevelKeys, nestedObjectKeys };
}

function sampleShapeSignature(shape) {
  return JSON.stringify(shape);
}

function inspectProcessShape(process, state) {
  if (!isPlainObject(process)) {
    return;
  }

  for (const key of Object.keys(process)) {
    if (!SENSITIVE_PROCESS_KEYS.has(key)) {
      state.processTopLevelKeysSeen.add(key);
    }
  }

  for (const root of NESTED_OBJECT_ROOTS) {
    const nested = process[root];
    if (isPlainObject(nested)) {
      incrementPathCount(state.processNestedObjectPathCounts, root);
    }
    if (Array.isArray(nested)) {
      incrementPathCount(state.processNestedArrayPathCounts, root);
    }
  }

  walkProcessShape(process, '', state, 0);

  if (state.processSampleShapes.length < PROCESS_SAMPLE_SHAPE_LIMIT) {
    const shape = buildProcessSampleShape(process);
    const signature = sampleShapeSignature(shape);
    if (!state.processSampleShapeSignatures.has(signature)) {
      state.processSampleShapeSignatures.add(signature);
      state.processSampleShapes.push(shape);
    }
  }
}

function walkProcessShape(value, path, state, depth) {
  if (depth > PROCESS_WALK_MAX_DEPTH) {
    return;
  }

  if (Array.isArray(value)) {
    if (path) {
      incrementPathCount(state.processNestedArrayPathCounts, path);
      if (looksLikePhoneValue(value)) {
        incrementPathCount(state.processCandidatePhoneFieldCounts, path);
      }
    }

    for (const item of value) {
      if (isPlainObject(item)) {
        walkProcessShape(item, path, state, depth + 1);
      }
    }
    return;
  }

  if (!isPlainObject(value)) {
    if (path && isPrimitiveValue(value)) {
      const fieldName = path.includes('.') ? path : path.split('.').pop();
      if (fieldName && !SENSITIVE_PROCESS_KEYS.has(fieldName)) {
        state.processPrimitiveFieldNamesSeen.add(path);
      }
      if (looksLikePhoneValue(value)) {
        incrementPathCount(state.processCandidatePhoneFieldCounts, path);
      }
    }
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    if (SENSITIVE_PROCESS_KEYS.has(key)) {
      continue;
    }

    const childPath = path ? `${path}.${key}` : key;

    if (isPrimitiveValue(child)) {
      state.processPrimitiveFieldNamesSeen.add(childPath);
      if (looksLikePhoneValue(child)) {
        incrementPathCount(state.processCandidatePhoneFieldCounts, childPath);
      }
      continue;
    }

    if (Array.isArray(child)) {
      incrementPathCount(state.processNestedArrayPathCounts, childPath);
      if (looksLikePhoneValue(child)) {
        incrementPathCount(state.processCandidatePhoneFieldCounts, childPath);
      }
      walkProcessShape(child, childPath, state, depth + 1);
      continue;
    }

    if (isPlainObject(child)) {
      incrementPathCount(state.processNestedObjectPathCounts, childPath);
      walkProcessShape(child, childPath, state, depth + 1);
    }
  }
}

function mapPathCountsToList(map, limit = VALUE_LIMIT) {
  return [...map.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([path, count]) => ({ path, count }));
}

export function buildTriggerDiagnostics(triggersInput, { sampleLimit = SAMPLE_LIMIT } = {}) {
  const triggers = Array.isArray(triggersInput) ? triggersInput : [];
  const sampled = triggers.slice(0, sampleLimit);
  const triggerTopLevelKeysSeen = new Set();
  const processTypeFieldsSeen = new Set();
  const processTypeValuesSeen = new Set();
  const processTopLevelKeysSeen = new Set();
  const processPrimitiveFieldNamesSeen = new Set();
  const processArrayCounts = new Map(PROCESS_ARRAY_PATHS.map((entry) => [entry.path, 0]));
  const processObjectCounts = new Map(PROCESS_OBJECT_PATHS.map((entry) => [entry.path, 0]));
  const destinationFieldCounts = new Map(DESTINATION_FIELD_PATHS.map((entry) => [entry.path, 0]));
  const processNestedObjectPathCounts = new Map();
  const processNestedArrayPathCounts = new Map();
  const processCandidatePhoneFieldCounts = new Map();
  const processSampleShapeSignatures = new Set();
  const processSampleShapes = [];

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

    const shapeState = {
      processTopLevelKeysSeen,
      processPrimitiveFieldNamesSeen,
      processNestedObjectPathCounts,
      processNestedArrayPathCounts,
      processCandidatePhoneFieldCounts,
      processSampleShapeSignatures,
      processSampleShapes,
    };

    for (const process of collectProcesses(trigger)) {
      collectProcessTypeValues(process, processTypeValuesSeen, processTypeFieldsSeen);
      inspectProcessShape(process, shapeState);

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
    processTopLevelKeysSeen: [...processTopLevelKeysSeen].slice(0, TOP_LEVEL_KEY_LIMIT),
    processNestedObjectPathsSeen: mapPathCountsToList(processNestedObjectPathCounts),
    processNestedArrayPathsSeen: mapPathCountsToList(processNestedArrayPathCounts),
    processPrimitiveFieldNamesSeen: [...processPrimitiveFieldNamesSeen].slice(0, VALUE_LIMIT),
    processCandidatePhoneFieldNamesSeen: mapPathCountsToList(processCandidatePhoneFieldCounts),
    processSampleShapes,
  };
}
