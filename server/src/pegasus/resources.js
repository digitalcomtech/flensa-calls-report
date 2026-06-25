import { isScopeDiagnosticsEnabled } from '../env.js';
import { pegasusGet } from './client.js';

const NESTED_ARRAY_KEYS = [
  'resources',
  'data',
  'items',
  'results',
  'triggers',
  'tasks',
  'entities',
  'assets',
  'vehicles',
];

const TYPE_MAP_ARRAY_KEYS = [
  'triggers',
  'tasks',
  'vehicles',
  'assets',
  'resources',
  'entities',
  'items',
  'results',
  'data',
];

const PEGASUS_USER_RESOURCE_ARRAYS = [
  { key: 'assets', resourceType: 'asset' },
  { key: 'tasks', resourceType: 'task' },
  { key: 'vehicles', resourceType: 'vehicle' },
  { key: 'triggers', resourceType: 'trigger' },
];

const RESOURCE_RECORD_KEYS = new Set([
  'id',
  'resource_id',
  'resourceId',
  'trigger_id',
  'triggerId',
  'type',
  'name',
  'trigger',
  'triggers',
  'processes',
  'process',
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function looksLikeResourceRecord(value) {
  if (!isPlainObject(value)) {
    return false;
  }

  return [...RESOURCE_RECORD_KEYS].some((key) => key in value);
}

function getResourcesRawType(payload) {
  if (payload === null) {
    return 'null';
  }
  if (Array.isArray(payload)) {
    return 'array';
  }
  if (typeof payload === 'object') {
    return 'object';
  }
  return typeof payload;
}

function getTopLevelKeys(payload, limit = 20) {
  if (!isPlainObject(payload)) {
    return [];
  }
  return Object.keys(payload).slice(0, limit);
}

function findCandidateArrayPaths(value, path = '', depth = 0, maxDepth = 4) {
  const paths = [];

  if (depth > maxDepth || value === null || value === undefined) {
    return paths;
  }

  if (Array.isArray(value)) {
    paths.push({ path: path || '(root)', count: value.length });
    return paths;
  }

  if (!isPlainObject(value)) {
    return paths;
  }

  for (const [key, child] of Object.entries(value)) {
    const childPath = path ? `${path}.${key}` : key;
    if (Array.isArray(child)) {
      paths.push({ path: childPath, count: child.length });
    } else if (isPlainObject(child)) {
      paths.push(...findCandidateArrayPaths(child, childPath, depth + 1, maxDepth));
    }
  }

  return paths;
}

export function analyzeResourcesPayloadShape(payload) {
  return {
    resourcesRawType: getResourcesRawType(payload),
    resourcesTopLevelKeys: getTopLevelKeys(payload),
    candidateArrayPaths: findCandidateArrayPaths(payload),
  };
}

function annotateResourceType(item, resourceType) {
  if (!isPlainObject(item)) {
    return null;
  }

  const annotated = { ...item };

  if (!annotated.resourceType) {
    annotated.resourceType = resourceType;
  }

  if (!annotated.type) {
    annotated.type = resourceType;
  }

  return annotated;
}

export function normalizeResourceItem(item, resourceType) {
  if (isPlainObject(item)) {
    return annotateResourceType(item, resourceType);
  }

  if (typeof item === 'string' || typeof item === 'number') {
    const id = String(item).trim();
    if (!id) {
      return null;
    }

    return {
      id,
      resourceType,
      type: resourceType,
    };
  }

  return null;
}

export function getRawTopLevelArrayCounts(payload) {
  const counts = {
    assets: 0,
    tasks: 0,
    vehicles: 0,
    triggers: 0,
  };

  if (!isPlainObject(payload)) {
    return counts;
  }

  for (const key of Object.keys(counts)) {
    counts[key] = Array.isArray(payload[key]) ? payload[key].length : 0;
  }

  return counts;
}

function hasPegasus194TopLevelArrays(payload) {
  const counts = getRawTopLevelArrayCounts(payload);
  return Object.values(counts).some((count) => count > 0);
}

function isPegasusUserResourcesObject(payload) {
  if (!isPlainObject(payload)) {
    return false;
  }

  return PEGASUS_USER_RESOURCE_ARRAYS.some(
    ({ key }) => Array.isArray(payload[key]) && payload[key].length > 0
  );
}

function flattenPegasusUserResourceObject(payload) {
  const resources = [];

  for (const { key, resourceType } of PEGASUS_USER_RESOURCE_ARRAYS) {
    if (!Array.isArray(payload[key])) {
      continue;
    }

    for (const item of payload[key]) {
      const normalized = normalizeResourceItem(item, resourceType);
      if (normalized) {
        resources.push(normalized);
      }
    }
  }

  return resources;
}

function extractTopLevelTriggersFromPayload(payload) {
  if (!Array.isArray(payload?.triggers)) {
    return [];
  }

  return payload.triggers
    .map((item) => normalizeResourceItem(item, 'trigger'))
    .filter(Boolean);
}

export function extractTopLevelTriggers(payload) {
  return extractTopLevelTriggersFromPayload(payload);
}

function dedupeResourceRecords(resources) {
  const seen = new Set();
  const deduped = [];

  for (const resource of resources) {
    if (!isPlainObject(resource)) {
      continue;
    }

    const typeHint = resource.resourceType ?? resource.type ?? 'resource';
    const key =
      resource.id ??
      resource.resource_id ??
      resource.resourceId ??
      resource.trigger_id ??
      resource.triggerId ??
      JSON.stringify(resource);

    const dedupeKey = `${typeHint}:${key}`;

    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    deduped.push(resource);
  }

  return deduped;
}

function collectNestedArrayValues(payload, keys = NESTED_ARRAY_KEYS) {
  const collected = [];

  if (!isPlainObject(payload)) {
    return collected;
  }

  for (const key of keys) {
    if (Array.isArray(payload[key])) {
      collected.push(...payload[key]);
    }
  }

  for (const child of Object.values(payload)) {
    if (!isPlainObject(child)) {
      continue;
    }

    for (const key of keys) {
      if (Array.isArray(child[key])) {
        collected.push(...child[key]);
      }
    }
  }

  return collected;
}

function isTypeKeyedResourceMap(payload) {
  if (!isPlainObject(payload)) {
    return false;
  }

  return TYPE_MAP_ARRAY_KEYS.some((key) => Array.isArray(payload[key]) && payload[key].length > 0);
}

function flattenTypeKeyedResourceMap(payload) {
  const collected = [];

  for (const { key, resourceType } of PEGASUS_USER_RESOURCE_ARRAYS) {
    if (Array.isArray(payload[key])) {
      for (const item of payload[key]) {
        const normalized = normalizeResourceItem(item, resourceType);
        if (normalized) {
          collected.push(normalized);
        }
      }
    }
  }

  for (const key of TYPE_MAP_ARRAY_KEYS) {
    if (PEGASUS_USER_RESOURCE_ARRAYS.some((entry) => entry.key === key)) {
      continue;
    }

    if (Array.isArray(payload[key])) {
      for (const item of payload[key]) {
        if (isPlainObject(item)) {
          collected.push(item);
        }
      }
    }
  }

  if (isPlainObject(payload.entities)) {
    for (const key of TYPE_MAP_ARRAY_KEYS) {
      if (Array.isArray(payload.entities[key])) {
        for (const item of payload.entities[key]) {
          if (isPlainObject(item)) {
            collected.push(item);
          }
        }
      }
    }
  }

  return collected;
}

function isIdKeyedResourceMap(payload) {
  if (!isPlainObject(payload)) {
    return false;
  }

  const entries = Object.entries(payload);
  if (entries.length === 0) {
    return false;
  }

  const arrayValues = entries.filter(([, value]) => Array.isArray(value));
  if (arrayValues.length > 0) {
    return false;
  }

  const objectValues = entries.filter(([, value]) => isPlainObject(value));
  if (objectValues.length !== entries.length) {
    return false;
  }

  const recognizable = objectValues.filter(([, value]) => looksLikeResourceRecord(value));
  return recognizable.length >= Math.ceil(entries.length / 2);
}

function flattenIdKeyedResourceMap(payload) {
  return Object.values(payload).filter((value) => isPlainObject(value));
}

function normalizeResourceArray(payload) {
  if (Array.isArray(payload)) {
    return payload
      .map((item) => normalizeResourceItem(item, 'resource'))
      .filter(Boolean);
  }

  if (!isPlainObject(payload)) {
    return [];
  }

  if (hasPegasus194TopLevelArrays(payload)) {
    return flattenPegasusUserResourceObject(payload);
  }

  for (const key of ['data', 'resources', 'items', 'results']) {
    if (Array.isArray(payload[key]) && payload[key].length > 0) {
      return payload[key]
        .map((item) => normalizeResourceItem(item, 'resource'))
        .filter(Boolean);
    }
  }

  if (isPegasusUserResourcesObject(payload)) {
    return flattenPegasusUserResourceObject(payload);
  }

  if (isTypeKeyedResourceMap(payload)) {
    return flattenTypeKeyedResourceMap(payload);
  }

  const nested = collectNestedArrayValues(payload);
  if (nested.length > 0) {
    return nested.filter((item) => isPlainObject(item));
  }

  if (isIdKeyedResourceMap(payload)) {
    return flattenIdKeyedResourceMap(payload);
  }

  return [];
}

function pushTriggerId(ids, value) {
  if (value === null || value === undefined || value === '') {
    return;
  }
  ids.push(String(value));
}

function extractTriggerIds(resources) {
  const ids = [];

  for (const resource of resources) {
    if (!isPlainObject(resource)) {
      continue;
    }

    pushTriggerId(ids, resource.trigger_id);
    pushTriggerId(ids, resource.triggerId);

    if (resource.resourceType === 'trigger' || resource.type === 'trigger') {
      pushTriggerId(ids, resource.id);
    }

    if (resource.trigger && typeof resource.trigger === 'object') {
      pushTriggerId(ids, resource.trigger.id ?? resource.trigger.trigger_id);
    }

    if (Array.isArray(resource.triggers)) {
      for (const trigger of resource.triggers) {
        if (typeof trigger === 'string' || typeof trigger === 'number') {
          pushTriggerId(ids, trigger);
        } else if (trigger && typeof trigger === 'object') {
          pushTriggerId(ids, trigger.id ?? trigger.trigger_id ?? trigger.triggerId);
        }
      }
    }
  }

  return [...new Set(ids)];
}

function hasSupportedTopLevelResourceArrays(payload) {
  if (!isPlainObject(payload)) {
    return false;
  }

  return PEGASUS_USER_RESOURCE_ARRAYS.some(
    ({ key }) => Array.isArray(payload[key]) && payload[key].length > 0
  );
}

function buildResourceWarnings(payload, flattenedResources) {
  const warnings = [];
  const rawCounts = getRawTopLevelArrayCounts(payload);
  const hasTopLevelArrays = Object.values(rawCounts).some((count) => count > 0);

  if (payload !== null && flattenedResources.length === 0 && !hasTopLevelArrays) {
    warnings.push('resources response shape unrecognized or empty');
  }

  return warnings;
}

export function normalizeResourcesFromPayload(payload) {
  const shape = analyzeResourcesPayloadShape(payload);
  const rawTopLevelArrayCounts = getRawTopLevelArrayCounts(payload);
  const pegasusArraysPresent = hasPegasus194TopLevelArrays(payload);

  const flattenedResources = pegasusArraysPresent && isPlainObject(payload)
    ? flattenPegasusUserResourceObject(payload)
    : normalizeResourceArray(payload);
  const resources = dedupeResourceRecords(flattenedResources);

  let triggers = [];
  let usedTriggersFallback = false;

  if (pegasusArraysPresent && isPlainObject(payload)) {
    triggers = extractTopLevelTriggersFromPayload(payload);
  } else {
    triggers = extractTopLevelTriggers(payload);
  }

  if (
    rawTopLevelArrayCounts.triggers > 0 &&
    triggers.length === 0 &&
    Array.isArray(payload?.triggers)
  ) {
    triggers = payload.triggers
      .map((item) => normalizeResourceItem(item, 'trigger'))
      .filter(Boolean);
    usedTriggersFallback = triggers.length > 0;
  }

  const warnings = buildResourceWarnings(payload, flattenedResources);
  if (usedTriggersFallback) {
    warnings.push('used raw top-level triggers fallback');
  }

  const normalization = {
    normalizedResourceCount: flattenedResources.length,
    normalizedTriggerCount: triggers.length,
    rawTopLevelArrayCounts,
  };

  return {
    rawCount: normalization.normalizedResourceCount,
    resources,
    triggers,
    triggerIds: extractTriggerIds([...resources, ...triggers]),
    warnings,
    shape: {
      ...shape,
      ...normalization,
    },
    normalization,
  };
}

function logResourcesShapeDiagnostics(shape) {
  console.info('[scope-diagnostics] resources shape', {
    resourcesRawType: shape.resourcesRawType,
    resourcesTopLevelKeys: shape.resourcesTopLevelKeys,
    candidateArrayPaths: shape.candidateArrayPaths,
  });
}

/**
 * Fetch and normalize GET /user/resources for the authenticated Pegasus user.
 */
export async function listUserResources({ token }) {
  const payload = await pegasusGet('/user/resources', { token });
  const result = normalizeResourcesFromPayload(payload);

  if (isScopeDiagnosticsEnabled()) {
    logResourcesShapeDiagnostics(result.shape);
  }

  return result;
}

export {
  normalizeResourceArray,
  extractTriggerIds,
  looksLikeResourceRecord,
  isTypeKeyedResourceMap,
  isIdKeyedResourceMap,
  isPegasusUserResourcesObject,
};
