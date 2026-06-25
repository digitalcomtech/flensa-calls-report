import { pegasusGet } from './client.js';

function normalizeResourceArray(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (payload && typeof payload === 'object') {
    if (Array.isArray(payload.data)) {
      return payload.data;
    }
    if (Array.isArray(payload.resources)) {
      return payload.resources;
    }
    if (Array.isArray(payload.items)) {
      return payload.items;
    }
    if (Array.isArray(payload.results)) {
      return payload.results;
    }
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
    if (!resource || typeof resource !== 'object') {
      continue;
    }

    pushTriggerId(ids, resource.trigger_id);
    pushTriggerId(ids, resource.triggerId);

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

/**
 * Fetch and normalize GET /api/user/resources for the authenticated user.
 */
export async function listUserResources({ token }) {
  const payload = await pegasusGet('/api/user/resources', { token });
  const resources = normalizeResourceArray(payload);
  const triggerIds = extractTriggerIds(resources);
  const warnings = [];

  if (payload !== null && resources.length === 0) {
    warnings.push('resources response shape unrecognized or empty');
  }

  return {
    rawCount: resources.length,
    resources,
    triggerIds,
    warnings,
  };
}

export { normalizeResourceArray, extractTriggerIds };
