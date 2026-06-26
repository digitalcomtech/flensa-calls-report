import { getPegasusTokenFromUser, isDevSessionAllowed } from '../env.js';
import { listUserResources } from './resources.js';
import { buildTriggerDiagnostics } from './triggerDiagnostics.js';
import {
  extractProcessRefsFromTriggers,
  fetchProcessDetails,
  mergeHydratedProcessesIntoTriggers,
  shouldHydrateProcessDetails,
} from './processDetails.js';
import { fetchTriggerDetails, shouldHydrateTriggerDetails } from './triggerDetails.js';
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
    triggerDiagnostics: buildTriggerDiagnostics([]),
    triggerHydration: null,
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

  const pegasusToken = getPegasusTokenFromUser(user);
  const hasPegasusToken = Boolean(pegasusToken);
  if (!hasPegasusToken) {
    return emptyScope({ warnings: ['missing pegasus token'] });
  }

  let resourceResult;
  try {
    resourceResult = await listUserResources({ token: pegasusToken });
  } catch {
    return emptyScope({
      hasPegasusToken: true,
      warnings: ['failed to fetch pegasus resources'],
    });
  }

  let triggers =
    resourceResult.triggers.length > 0
      ? resourceResult.triggers
      : await fetchTriggersForResources({
          token: pegasusToken,
          resources: resourceResult.resources,
          triggerIds: resourceResult.triggerIds,
        });

  let extracted = extractTwilioDestinations(triggers);
  const warnings = [...resourceResult.warnings];
  const normalizedTriggerCount = resourceResult.triggers.length || triggers.length;
  let triggerHydration = null;
  let processHydration = null;
  let hydratedTriggers = false;
  let hydratedProcesses = false;

  if (shouldHydrateTriggerDetails(triggers, extracted)) {
    const hydration = await fetchTriggerDetails({
      token: pegasusToken,
      triggerRefs: triggers,
    });
    triggerHydration = hydration.diagnostics;

    if (hydration.triggers.length > 0) {
      triggers = hydration.triggers;
      hydratedTriggers = true;
      extracted = extractTwilioDestinations(triggers);
      warnings.push('hydrated trigger details');
    } else if (triggerHydration.warnings.length > 0) {
      warnings.push('trigger detail hydration failed');
    }
  }

  let triggersForDiagnostics = triggers;

  if (shouldHydrateProcessDetails(triggers, extracted)) {
    const processRefs = extractProcessRefsFromTriggers(triggers);
    const hydration = await fetchProcessDetails({
      token: pegasusToken,
      processRefs,
    });
    processHydration = hydration.diagnostics;

    if (hydration.processes.length > 0) {
      triggers = mergeHydratedProcessesIntoTriggers(triggers, hydration.processes);
      hydratedProcesses = true;
      extracted = extractTwilioDestinations(triggers);
      warnings.push('hydrated process details');
    } else if (processHydration.warnings.length > 0) {
      warnings.push('process detail hydration failed');
    }
  }

  if (processHydration) {
    triggerHydration = {
      ...(triggerHydration ?? {
        attempted: false,
        inputTriggerRefCount: 0,
        uniqueTriggerIdCount: 0,
        hydratedTriggerCount: 0,
        method: 'none',
        endpointTried: null,
        httpStatus: null,
        candidateStatuses: [],
        warnings: [],
      }),
      processHydration,
    };
  }

  if (extracted.destinationCount === 0) {
    if (hydratedProcesses) {
      warnings.push('no twilio/call destinations found in hydrated processes');
    } else if (hydratedTriggers) {
      warnings.push('no twilio/call destinations found in hydrated triggers');
    } else if (resourceResult.triggers.length > 0) {
      warnings.push('no twilio/call destinations found in triggers');
    } else if (resourceResult.rawCount > 0) {
      warnings.push('no twilio/call destinations found for user resources');
    }
  }

  return {
    hasPegasusToken: true,
    isDevSession: false,
    resourceCount: resourceResult.rawCount,
    triggerCount: normalizedTriggerCount,
    destinationCount: extracted.destinationCount,
    destinations: extracted.destinations,
    warnings,
    resourceShape: resourceResult.shape,
    normalization: resourceResult.normalization,
    triggerDiagnostics: buildTriggerDiagnostics(triggersForDiagnostics),
    triggerHydration,
    processHydration,
  };
}
