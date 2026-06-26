const PROCESS_TYPE_FIELDS = [
  'type',
  'name',
  'action',
  'key',
  'plugin',
  'service',
  'provider',
  'process_type',
  'processType',
];
const PROCESS_DETAIL_ROOTS = ['config', 'params', 'settings', 'data', 'payload'];
const DESTINATION_TOP_LEVEL_KEYS = [
  'destinations',
  'destination',
  'phones',
  'phone',
  'numbers',
  'number',
  'recipients',
  'recipient',
  'to',
];
const PROCESS_OBJECT_MARKERS = [
  ...PROCESS_TYPE_FIELDS,
  'command',
  'method',
  ...PROCESS_DETAIL_ROOTS,
];
const SENSITIVE_OBJECT_KEYS = new Set([
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
  'authorization',
  'apiKey',
  'api_key',
  'access_token',
]);

const PHONE_LIKE_PATTERN = /^\+?\d{7,15}$/;
const URL_PATTERN = /^https?:\/\//i;
const EMAIL_PATTERN = /@/;
const TOKEN_PATTERN = /token|secret|api[_-]?key|bearer/i;
const TWILIO_PATTERN = /twilio/i;
const CALL_PATTERN = /(^|\/)call\b|\.call\b/i;
const MAX_SAFE_LABEL_LENGTH = 80;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeId(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const id = String(value).trim();
  return id || null;
}

export function classifyArrayElementType(item) {
  if (item === null) {
    return 'null';
  }
  if (Array.isArray(item)) {
    return 'array';
  }
  if (typeof item === 'string') {
    return 'string';
  }
  if (typeof item === 'number') {
    return 'number';
  }
  if (isPlainObject(item)) {
    return 'object';
  }
  return 'other';
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

export function looksLikePhoneString(value) {
  return Boolean(normalizePhoneLikeString(value));
}

export function looksLikeUrlString(value) {
  return typeof value === 'string' && URL_PATTERN.test(value.trim());
}

export function looksLikeEmailString(value) {
  return typeof value === 'string' && EMAIL_PATTERN.test(value);
}

export function looksLikeTokenString(value) {
  return typeof value === 'string' && TOKEN_PATTERN.test(value);
}

export function looksLikeTwilioString(value) {
  return typeof value === 'string' && TWILIO_PATTERN.test(value.trim());
}

export function looksLikeCallString(value) {
  return typeof value === 'string' && CALL_PATTERN.test(value.trim().toLowerCase());
}

export function isShortSafeLabel(value) {
  if (typeof value !== 'string') {
    return false;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_SAFE_LABEL_LENGTH) {
    return false;
  }
  return (
    !looksLikePhoneString(trimmed) &&
    !looksLikeUrlString(trimmed) &&
    !looksLikeEmailString(trimmed) &&
    !looksLikeTokenString(trimmed)
  );
}

export function looksLikeProcessIdCandidate(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return looksLikeProcessIdCandidate(String(value));
  }
  if (typeof value !== 'string') {
    return false;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 128) {
    return false;
  }
  if (
    looksLikePhoneString(trimmed) ||
    looksLikeUrlString(trimmed) ||
    looksLikeEmailString(trimmed) ||
    looksLikeTokenString(trimmed) ||
    looksLikeTwilioString(trimmed) ||
    looksLikeCallString(trimmed) ||
    trimmed.includes('/')
  ) {
    return false;
  }
  return /[0-9_-]/.test(trimmed) || trimmed.length >= 12;
}

function objectHasProcessMarkers(object) {
  if (!isPlainObject(object)) {
    return false;
  }

  if (PROCESS_OBJECT_MARKERS.some((field) => field in object)) {
    return true;
  }

  return DESTINATION_TOP_LEVEL_KEYS.some((field) => field in object);
}

export function hasProcessDetailShape(ref) {
  if (!isPlainObject(ref)) {
    return false;
  }

  if (PROCESS_TYPE_FIELDS.some((field) => typeof ref[field] === 'string' && ref[field].trim())) {
    return true;
  }

  if (typeof ref.command === 'string' && ref.command.trim()) {
    return true;
  }
  if (typeof ref.method === 'string' && ref.method.trim()) {
    return true;
  }

  for (const root of PROCESS_DETAIL_ROOTS) {
    const nested = ref[root];
    if (isPlainObject(nested) && Object.keys(nested).length > 0) {
      return true;
    }
    if (Array.isArray(nested) && nested.length > 0) {
      return true;
    }
  }

  return DESTINATION_TOP_LEVEL_KEYS.some((field) => ref[field] !== undefined && ref[field] !== null);
}

function findDetailObject(items) {
  return items.find((item) => isPlainObject(item) && objectHasProcessMarkers(item)) ?? null;
}

function buildConvertedFromDetailObject(array, detailObject) {
  const converted = { ...detailObject };
  let assignedType = false;
  let assignedAction = false;

  for (const item of array) {
    if (item === detailObject || !isShortSafeLabel(item)) {
      continue;
    }
    const label = String(item).trim();
    const lower = label.toLowerCase();

    if (!assignedType && (lower.includes('twilio') || lower.includes('/'))) {
      converted.type = label;
      assignedType = true;
      continue;
    }

    if (!assignedAction && (lower === 'call' || lower.endsWith('/call'))) {
      converted.action = label;
      assignedAction = true;
    }
  }

  return converted;
}

export function convertArrayProcessEntry(array) {
  if (!Array.isArray(array) || array.length === 0) {
    return null;
  }

  const detailObject = findDetailObject(array);
  if (detailObject && array.length === 1) {
    return { ...detailObject };
  }

  if (
    array.length >= 3 &&
    looksLikeProcessIdCandidate(array[0]) &&
    isShortSafeLabel(array[1]) &&
    isPlainObject(array[2])
  ) {
    return {
      id: normalizeId(array[0]),
      type: String(array[1]).trim(),
      config: array[2],
    };
  }

  if (
    array.length >= 3 &&
    isShortSafeLabel(array[0]) &&
    isShortSafeLabel(array[1]) &&
    isPlainObject(array[2])
  ) {
    const payload = array[2];
    const config = isPlainObject(payload.config) ? payload.config : payload;
    return {
      type: String(array[0]).trim(),
      action: String(array[1]).trim(),
      config,
    };
  }

  if (array.length >= 2 && isShortSafeLabel(array[0]) && isPlainObject(array[1])) {
    const payload = array[1];
    if (objectHasProcessMarkers(payload) && !('config' in payload)) {
      return { type: String(array[0]).trim(), ...payload };
    }
    return { type: String(array[0]).trim(), config: payload };
  }

  if (array.length === 1 && looksLikeProcessIdCandidate(array[0])) {
    return { id: normalizeId(array[0]) };
  }

  if (detailObject) {
    return buildConvertedFromDetailObject(array, detailObject);
  }

  if (array.length === 1 && isPlainObject(array[0])) {
    return { ...array[0] };
  }

  return null;
}

export function normalizeProcessItem(item) {
  if (isPlainObject(item)) {
    return item;
  }
  if (Array.isArray(item)) {
    return convertArrayProcessEntry(item);
  }
  return null;
}

export function extractProcessIdFromArrayEntry(array) {
  if (!Array.isArray(array)) {
    return null;
  }

  for (const item of array) {
    if (isPlainObject(item)) {
      const id = normalizeId(item.id ?? item._id ?? item.process_id ?? item.processId);
      if (id) {
        return id;
      }
    }
  }

  for (const index of [0, 1]) {
    const item = array[index];
    if (item !== undefined && looksLikeProcessIdCandidate(item)) {
      return normalizeId(item);
    }
  }

  return null;
}

export function extractProcessIdFromRef(ref) {
  if (Array.isArray(ref)) {
    return extractProcessIdFromArrayEntry(ref);
  }

  if (typeof ref === 'string' || typeof ref === 'number') {
    return normalizeId(ref);
  }

  if (!isPlainObject(ref)) {
    return null;
  }

  return normalizeId(ref.id ?? ref._id ?? ref.process_id ?? ref.processId);
}

function classifyArrayString(value) {
  return {
    looksLikePhone: looksLikePhoneString(value),
    looksLikeUrl: looksLikeUrlString(value),
    looksLikeEmail: looksLikeEmailString(value),
    looksLikeToken: looksLikeTokenString(value),
    looksLikeTwilio: looksLikeTwilioString(value),
    looksLikeCall: looksLikeCallString(value),
    shortSafeLabel: isShortSafeLabel(value),
  };
}

function filterSafeObjectKeys(object) {
  return Object.keys(object)
    .filter((key) => !SENSITIVE_OBJECT_KEYS.has(key))
    .sort();
}

function shapeSignature(shape) {
  return JSON.stringify(shape);
}

function incrementIndexCount(map, index) {
  map.set(index, (map.get(index) ?? 0) + 1);
}

export function inspectArrayProcessEntry(array, state) {
  if (!Array.isArray(array)) {
    return;
  }

  const itemTypes = array.map((item) => classifyArrayElementType(item));
  const objectIndexes = [];
  const primitiveIndexes = [];

  for (let index = 0; index < array.length; index += 1) {
    const item = array[index];
    if (isPlainObject(item)) {
      objectIndexes.push(index);
      const keys = filterSafeObjectKeys(item);
      const existing = state.processArrayNestedObjectKeysSeen.find((entry) => entry.index === index);
      if (existing) {
        for (const key of keys) {
          if (!existing.keys.includes(key)) {
            existing.keys.push(key);
          }
        }
        existing.keys.sort();
      } else {
        state.processArrayNestedObjectKeysSeen.push({ index, keys });
      }
    } else if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
      primitiveIndexes.push(index);
    }

    if (typeof item === 'string') {
      const classification = classifyArrayString(item);
      let entry = state.processArrayStringClassifications.find((row) => row.index === index);
      if (!entry) {
        entry = {
          index,
          looksLikeTwilioCount: 0,
          looksLikeCallCount: 0,
          looksLikePhoneCount: 0,
          shortSafeLabelCount: 0,
        };
        state.processArrayStringClassifications.push(entry);
      }
      if (classification.looksLikeTwilio) {
        entry.looksLikeTwilioCount += 1;
        incrementIndexCount(state.processArrayCandidateTypeIndexes, index);
      }
      if (classification.looksLikeCall) {
        entry.looksLikeCallCount += 1;
        incrementIndexCount(state.processArrayCandidateTypeIndexes, index);
      }
      if (classification.looksLikePhone) {
        entry.looksLikePhoneCount += 1;
        incrementIndexCount(state.processArrayCandidatePhoneIndexes, index);
      }
      if (classification.shortSafeLabel) {
        entry.shortSafeLabelCount += 1;
        if (
          item.toLowerCase().includes('twilio') ||
          item.toLowerCase().includes('call') ||
          item.includes('/')
        ) {
          incrementIndexCount(state.processArrayCandidateTypeIndexes, index);
        }
      }
    }

    if (looksLikePhoneString(item) || (Array.isArray(item) && item.some((child) => looksLikePhoneString(child)))) {
      incrementIndexCount(state.processArrayCandidatePhoneIndexes, index);
    }
  }

  const shape = {
    length: array.length,
    itemTypes,
    objectIndexes,
    primitiveIndexes,
  };
  const signature = shapeSignature(shape);
  const existingShape = state.processArrayItemShapeMap.get(signature);
  if (existingShape) {
    existingShape.count += 1;
  } else {
    state.processArrayItemShapeMap.set(signature, { ...shape, count: 1 });
  }
}

export function finalizeArrayProcessDiagnostics(state) {
  return {
    processArrayItemShapes: [...state.processArrayItemShapeMap.values()]
      .sort((left, right) => right.count - left.count || left.length - right.length)
      .slice(0, 25)
      .map(({ length, count, itemTypes, objectIndexes, primitiveIndexes }) => ({
        length,
        count,
        itemTypes,
        objectIndexes,
        primitiveIndexes,
      })),
    processArrayNestedObjectKeysSeen: state.processArrayNestedObjectKeysSeen
      .sort((left, right) => left.index - right.index)
      .slice(0, 25),
    processArrayCandidateTypeIndexes: [...state.processArrayCandidateTypeIndexes.entries()]
      .sort((left, right) => left[0] - right[0])
      .map(([index, count]) => ({ index, count }))
      .slice(0, 25),
    processArrayCandidatePhoneIndexes: [...state.processArrayCandidatePhoneIndexes.entries()]
      .sort((left, right) => left[0] - right[0])
      .map(([index, count]) => ({ index, count }))
      .slice(0, 25),
    processArrayStringClassifications: state.processArrayStringClassifications
      .sort((left, right) => left.index - right.index)
      .slice(0, 25),
  };
}

export function createArrayProcessDiagnosticsState() {
  return {
    processArrayItemShapeMap: new Map(),
    processArrayNestedObjectKeysSeen: [],
    processArrayCandidateTypeIndexes: new Map(),
    processArrayCandidatePhoneIndexes: new Map(),
    processArrayStringClassifications: [],
  };
}

export function isProcessRef(ref) {
  if (Array.isArray(ref)) {
    const converted = convertArrayProcessEntry(ref);
    if (converted && hasProcessDetailShape(converted)) {
      return false;
    }
    return Boolean(extractProcessIdFromArrayEntry(ref));
  }

  if (typeof ref === 'string' || typeof ref === 'number') {
    return Boolean(extractProcessIdFromRef(ref));
  }

  if (!isPlainObject(ref)) {
    return false;
  }

  return Boolean(extractProcessIdFromRef(ref)) && !hasProcessDetailShape(ref);
}

export function isInspectableProcessObject(ref) {
  if (isPlainObject(ref)) {
    return true;
  }
  if (Array.isArray(ref)) {
    return Boolean(convertArrayProcessEntry(ref));
  }
  return false;
}
