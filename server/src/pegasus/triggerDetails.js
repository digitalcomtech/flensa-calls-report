import { pegasusGet, PegasusApiError } from './client.js';

export const HYDRATION_CAP = 500;
export const HYDRATION_TIMEOUT_MS = 15_000;
export const HYDRATION_PAGE_SIZE = 500;
export const HYDRATION_MAX_PAGES = 10;
export const HYDRATION_BY_ID_CONCURRENCY = 10;

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

export function extractTriggerIdFromRef(ref) {
  if (typeof ref === 'string' || typeof ref === 'number') {
    return normalizeId(ref);
  }

  if (!isPlainObject(ref)) {
    return null;
  }

  return normalizeId(ref.id ?? ref._id ?? ref.trigger_id ?? ref.triggerId);
}

export function extractTriggerIdsFromRefs(refs) {
  const ids = [];
  const seen = new Set();

  for (const ref of refs ?? []) {
    const id = extractTriggerIdFromRef(ref);
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    ids.push(id);
  }

  return ids;
}

function hasTriggerDetailShape(ref) {
  if (!isPlainObject(ref)) {
    return false;
  }

  if (Array.isArray(ref.processes) && ref.processes.length > 0) {
    return true;
  }

  if (ref.process) {
    if (Array.isArray(ref.process) && ref.process.length > 0) {
      return true;
    }
    if (isPlainObject(ref.process)) {
      return true;
    }
  }

  if (Array.isArray(ref.actions) && ref.actions.length > 0) {
    return true;
  }

  if (Array.isArray(ref.tasks) && ref.tasks.length > 0) {
    return true;
  }

  if (isPlainObject(ref.config)) {
    if (Array.isArray(ref.config.processes) && ref.config.processes.length > 0) {
      return true;
    }
    if (ref.config.process && (Array.isArray(ref.config.process) || isPlainObject(ref.config.process))) {
      return true;
    }
    if (Array.isArray(ref.config.actions) && ref.config.actions.length > 0) {
      return true;
    }
    if (Array.isArray(ref.config.tasks) && ref.config.tasks.length > 0) {
      return true;
    }
  }

  return false;
}

export function isShallowTrigger(ref) {
  if (typeof ref === 'string' || typeof ref === 'number') {
    return true;
  }

  if (!isPlainObject(ref)) {
    return false;
  }

  return !hasTriggerDetailShape(ref);
}

export function shouldHydrateTriggerDetails(triggers, extracted) {
  if (!Array.isArray(triggers) || triggers.length === 0) {
    return false;
  }

  if ((extracted?.destinationCount ?? 0) > 0) {
    return false;
  }

  if (!triggers.some(isShallowTrigger)) {
    return false;
  }

  return extractTriggerIdsFromRefs(triggers).length > 0;
}

export function normalizeTriggerListPayload(payload) {
  if (Array.isArray(payload)) {
    return payload.filter((item) => isPlainObject(item));
  }

  if (!isPlainObject(payload)) {
    return [];
  }

  for (const key of ['data', 'triggers', 'items', 'results']) {
    if (Array.isArray(payload[key])) {
      return payload[key].filter((item) => isPlainObject(item));
    }
  }

  if (isPlainObject(payload.trigger)) {
    return [payload.trigger];
  }

  if (extractTriggerIdFromRef(payload)) {
    return [payload];
  }

  return [];
}

function buildListPath({ page, set, select }) {
  const params = new URLSearchParams();
  if (page) {
    params.set('page', String(page));
  }
  if (set) {
    params.set('set', String(set));
  }
  if (select) {
    params.set('select', select);
  }

  const query = params.toString();
  return query ? `/api/triggers?${query}` : '/api/triggers';
}

async function fetchTriggersListPage({ token, page, set, select, signal }) {
  const path = buildListPath({ page, set, select });
  const payload = await pegasusGet(path, { token, signal });
  return normalizeTriggerListPayload(payload);
}

async function fetchTriggerById({ token, id, signal }) {
  const encodedId = encodeURIComponent(id);

  for (const path of [`/api/triggers/${encodedId}`, `/api/triggers?id=${encodedId}`]) {
    try {
      const payload = await pegasusGet(path, { token, signal });
      const triggers = normalizeTriggerListPayload(payload);
      if (triggers.length > 0) {
        return triggers[0];
      }
    } catch (error) {
      if (!(error instanceof PegasusApiError)) {
        throw error;
      }
    }
  }

  return null;
}

async function fetchTriggersByIdBatch({ token, ids, signal }) {
  const hydratedById = new Map();

  for (let index = 0; index < ids.length; index += HYDRATION_BY_ID_CONCURRENCY) {
    const batch = ids.slice(index, index + HYDRATION_BY_ID_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (id) => {
        const trigger = await fetchTriggerById({ token, id, signal });
        return [id, trigger];
      })
    );

    for (const [id, trigger] of results) {
      if (trigger) {
        hydratedById.set(id, trigger);
      }
    }
  }

  return hydratedById;
}

function createEmptyDiagnostics({ attempted = false } = {}) {
  return {
    attempted,
    inputTriggerRefCount: 0,
    uniqueTriggerIdCount: 0,
    hydratedTriggerCount: 0,
    method: 'none',
    httpStatus: null,
    warnings: [],
  };
}

export async function fetchTriggerDetails({ token, triggerRefs, limit = HYDRATION_CAP }) {
  const refs = Array.isArray(triggerRefs) ? triggerRefs : [];
  const diagnostics = createEmptyDiagnostics({ attempted: refs.length > 0 });
  diagnostics.inputTriggerRefCount = refs.length;

  const allIds = extractTriggerIdsFromRefs(refs);
  diagnostics.uniqueTriggerIdCount = allIds.length;

  if (allIds.length === 0) {
    diagnostics.attempted = false;
    return { triggers: [], diagnostics };
  }

  const idsToFetch = allIds.slice(0, limit);
  if (allIds.length > limit) {
    diagnostics.warnings.push(`hydration capped at ${limit} triggers`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HYDRATION_TIMEOUT_MS);
  const signal = controller.signal;
  const idSet = new Set(idsToFetch);
  const hydratedById = new Map();
  let listHttpStatus = 200;
  let listContributedCount = 0;
  let byIdContributedCount = 0;

  try {
    let page = 1;
    while (page <= HYDRATION_MAX_PAGES && hydratedById.size < idsToFetch.length) {
      let pageItems = [];

      try {
        pageItems = await fetchTriggersListPage({
          token,
          page,
          set: HYDRATION_PAGE_SIZE,
          select: 'id,name,processes,actions,config',
          signal,
        });
        listHttpStatus = 200;
      } catch (error) {
        if (page === 1) {
          try {
            pageItems = await fetchTriggersListPage({
              token,
              page: null,
              set: null,
              select: null,
              signal,
            });
            listHttpStatus = 200;
          } catch (fallbackError) {
            listHttpStatus = fallbackError instanceof PegasusApiError ? fallbackError.status : null;
            diagnostics.warnings.push('trigger list hydration request failed');
            break;
          }
        } else {
          break;
        }
      }

      if (pageItems.length === 0) {
        break;
      }

      for (const trigger of pageItems) {
        const id = extractTriggerIdFromRef(trigger);
        if (id && idSet.has(id) && !hydratedById.has(id)) {
          hydratedById.set(id, trigger);
          listContributedCount += 1;
        }
      }

      if (pageItems.length < HYDRATION_PAGE_SIZE) {
        break;
      }

      page += 1;
    }

    const missingIds = idsToFetch.filter((id) => !hydratedById.has(id));
    if (missingIds.length > 0) {
      const byIdResults = await fetchTriggersByIdBatch({ token, ids: missingIds, signal });
      for (const [id, trigger] of byIdResults.entries()) {
        if (!hydratedById.has(id)) {
          hydratedById.set(id, trigger);
          byIdContributedCount += 1;
        }
      }
    }

    const triggers = idsToFetch.map((id) => hydratedById.get(id)).filter(Boolean);
    diagnostics.hydratedTriggerCount = triggers.length;
    diagnostics.httpStatus = listHttpStatus;

    if (listContributedCount > 0) {
      diagnostics.method = 'list';
    } else if (byIdContributedCount > 0) {
      diagnostics.method = 'by-id';
    } else {
      diagnostics.method = 'none';
    }

    if (triggers.length === 0) {
      diagnostics.warnings.push('no trigger details returned from Pegasus');
    }

    return { triggers, diagnostics };
  } catch {
    diagnostics.method = 'none';
    diagnostics.warnings.push('trigger detail hydration request failed');
    return { triggers: [], diagnostics };
  } finally {
    clearTimeout(timeout);
  }
}
