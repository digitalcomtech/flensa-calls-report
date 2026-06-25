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
];

const TYPE_MAP_ARRAY_KEYS = [
  'triggers',
  'tasks',
  'vehicles',
  'resources',
  'entities',
  'items',
  'results',
  'data',
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

function dedupeResourceRecords(resources) {
  const seen = new Set();
  const deduped = [];

  for (const resource of resources) {
    if (!isPlainObject(resource)) {
      continue;
    }

    const key =
      resource.id ??
      resource.resource_id ??
      resource.resourceId ??
      resource.trigger_id ??
      resource.triggerId ??
      JSON.stringify(resource);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
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

  return TYPE_MAP_ARRAY_KEYS.some((key) => Array.isArray(payload[key]));
}

function flattenTypeKeyedResourceMap(payload) {
  const collected = [];

  for (const key of TYPE_MAP_ARRAY_KEYS) {
    if (Array.isArray(payload[key])) {
      collected.push(...payload[key]);
    }
  }

  if (isPlainObject(payload.entities)) {
    for (const key of TYPE_MAP_ARRAY_KEYS) {
      if (Array.isArray(payload.entities[key])) {
        collected.push(...payload.entities[key]);
      }
    }
  }

  return collected.filter((item) => isPlainObject(item));
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
    return payload.filter((item) => isPlainObject(item));
  }

  if (!isPlainObject(payload)) {
    return [];
  }

  for (const key of ['data', 'resources', 'items', 'results']) {
    if (Array.isArray(payload[key])) {
      return payload[key].filter((item) => isPlainObject(item));
    }
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
    pushTriggerId(ids, resource.id);

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
  const shape = analyzeResourcesPayloadShape(payload);
  const resources = dedupeResourceRecords(normalizeResourceArray(payload));
  const triggerIds = extractTriggerIds(resources);
  const warnings = [];

  if (payload !== null && resources.length === 0) {
    warnings.push('resources response shape unrecognized or empty');
  }

  if (isScopeDiagnosticsEnabled()) {
    logResourcesShapeDiagnostics(shape);
  }

  return {
    rawCount: resources.length,
    resources,
    triggerIds,
    warnings,
    shape,
  };
}

export {
  normalizeResourceArray,
  extractTriggerIds,
  looksLikeResourceRecord,
  isTypeKeyedResourceMap,
  isIdKeyedResourceMap,
};
