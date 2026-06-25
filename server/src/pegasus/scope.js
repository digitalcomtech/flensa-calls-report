import { isDevSessionAllowed } from '../env.js';
import { listUserResources } from './resources.js';
import {
  collectTriggersFromResources,
  extractTwilioDestinations,
  listTriggers,
} from './triggers.js';

/** Subset of mock call destinations for ALLOW_DEV_SESSION local testing. */
export const DEV_FALLBACK_DESTINATIONS = ['+525512345678', '+525587654321'];

function emptyScope(overrides = {}) {
  return {
    hasPegasusToken: false,
    isDevSession: false,
    resourceCount: 0,
    triggerCount: 0,
    destinationCount: 0,
    destinations: [],
    warnings: [],
    ...overrides,
  };
}

async function fetchTriggersForResources({ token, resources, triggerIds }) {
  const embedded = collectTriggersFromResources(resources);
  if (embedded.length > 0) {
    return embedded;
  }

  const fetched = [];
  const seenIds = new Set();

  for (const resource of resources) {
    const resourceId = resource?.id ?? resource?.resource_id ?? resource?.resourceId;
    if (!resourceId) {
      continue;
    }

    try {
      const triggers = await listTriggers({ token, resourceId });
      for (const trigger of triggers) {
        const triggerId = trigger?.id ?? trigger?.trigger_id;
        if (triggerId && seenIds.has(triggerId)) {
          continue;
        }
        if (triggerId) {
          seenIds.add(triggerId);
        }
        fetched.push(trigger);
      }
    } catch {
      // Skip failed resource trigger fetch; scope remains conservative.
    }
  }

  if (fetched.length > 0) {
    return fetched;
  }

  if (triggerIds.length === 0) {
    return [];
  }

  try {
    return await listTriggers({ token });
  } catch {
    return [];
  }
}

/**
 * Resolve destination numbers visible to the authenticated user.
 * Never returns destinations outside Pegasus scope (or dev fallback when allowed).
 */
export async function resolveUserScope(user) {
  if (!user) {
    return emptyScope();
  }

  const isDevSession = user.isDevSession === true;

  if (isDevSession) {
    if (isDevSessionAllowed()) {
      return emptyScope({
        isDevSession: true,
        destinationCount: DEV_FALLBACK_DESTINATIONS.length,
        destinations: [...DEV_FALLBACK_DESTINATIONS],
        warnings: ['using dev fallback destinations'],
      });
    }
    return emptyScope({ warnings: ['dev session is not allowed'] });
  }

  const hasPegasusToken = Boolean(user.accessToken);
  if (!hasPegasusToken) {
    return emptyScope({ warnings: ['missing pegasus token'] });
  }

  let resourceResult;
  try {
    resourceResult = await listUserResources({ token: user.accessToken });
  } catch {
    return emptyScope({
      hasPegasusToken: true,
      warnings: ['failed to fetch pegasus resources'],
    });
  }

  const triggers = await fetchTriggersForResources({
    token: user.accessToken,
    resources: resourceResult.resources,
    triggerIds: resourceResult.triggerIds,
  });

  const extracted = extractTwilioDestinations(triggers);
  const warnings = [...resourceResult.warnings];

  if (resourceResult.rawCount > 0 && extracted.destinationCount === 0) {
    warnings.push('no twilio/call destinations found for user resources');
  }

  return {
    hasPegasusToken: true,
    isDevSession: false,
    resourceCount: resourceResult.rawCount,
    triggerCount: extracted.triggerCount,
    destinationCount: extracted.destinationCount,
    destinations: extracted.destinations,
    warnings,
  };
}
