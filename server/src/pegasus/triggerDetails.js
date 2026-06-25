import { pegasusGet, PegasusApiError } from './client.js';

export const HYDRATION_CAP = 500;
export const HYDRATION_TIMEOUT_MS = 15_000;
export const HYDRATION_PAGE_SIZE = 500;
export const HYDRATION_MAX_PAGES = 10;
export const HYDRATION_BY_ID_CONCURRENCY = 10;

export const LIST_ENDPOINT_CANDIDATES = [
  { label: 'triggers-list-select', basePath: '/triggers', withSelect: true },
  { label: 'triggers-list', basePath: '/triggers', withSelect: false },
  { label: 'api-triggers-list-select', basePath: '/api/triggers', withSelect: true },
  { label: 'api-triggers-list', basePath: '/api/triggers', withSelect: false },
];

const BY_ID_ENDPOINT_CANDIDATES = [
  {
    label: 'triggers-by-id',
    paths: (id) => [`/triggers/${id}`, `/triggers?id=${id}`],
  },
  {
    label: 'api-triggers-by-id',
    paths: (id) => [`/api/triggers/${id}`, `/api/triggers?id=${id}`],
  },
];

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

function isIdKeyedTriggerMap(payload) {
  if (!isPlainObject(payload)) {
    return false;
  }

  const entries = Object.entries(payload);
  if (entries.length === 0) {
    return false;
  }

  return entries.every(([key, value]) => normalizeId(key) && isPlainObject(value));
}

export function normalizeTriggerListPayload(payload) {
  if (Array.isArray(payload)) {
    return payload.filter((item) => isPlainObject(item));
  }

  if (!isPlainObject(payload)) {
    return [];
  }

  for (const key of ['data', 'results', 'items', 'triggers']) {
    if (Array.isArray(payload[key])) {
      return payload[key].filter((item) => isPlainObject(item));
    }
  }

  if (isIdKeyedTriggerMap(payload)) {
    return Object.values(payload).filter((item) => isPlainObject(item));
  }

  if (isPlainObject(payload.trigger)) {
    return [payload.trigger];
  }

  if (extractTriggerIdFromRef(payload)) {
    return [payload];
  }

  return [];
}

function buildListPath(basePath, { page, set, withSelect }) {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('set', String(set));
  if (withSelect) {
    params.set('select', 'id,name,processes,actions,config');
  }
  return `${basePath}?${params.toString()}`;
}

async function tryPegasusGet(path, { token, signal }) {
  try {
    const payload = await pegasusGet(path, { token, signal });
    return { httpStatus: 200, payload };
  } catch (error) {
    if (error instanceof PegasusApiError) {
      return { httpStatus: error.status, payload: null };
    }
    throw error;
  }
}

function recordCandidateStatus(candidateStatuses, label, httpStatus) {
  const existing = candidateStatuses.find((entry) => entry.candidate === label);
  if (existing) {
    if (existing.httpStatus !== 200 && httpStatus === 200) {
      existing.httpStatus = httpStatus;
    }
    return;
  }

  candidateStatuses.push({ candidate: label, httpStatus });
}

function mergeDetailedListItems(pageItems, idSet, hydratedById) {
  let contributed = 0;

  for (const trigger of pageItems) {
    const id = extractTriggerIdFromRef(trigger);
    if (!id || !idSet.has(id) || hydratedById.has(id) || isShallowTrigger(trigger)) {
      continue;
    }

    hydratedById.set(id, trigger);
    contributed += 1;
  }

  return contributed;
}

async function fetchTriggersListPage({ token, candidate, page, signal }) {
  const path = buildListPath(candidate.basePath, {
    page,
    set: HYDRATION_PAGE_SIZE,
    withSelect: candidate.withSelect,
  });
  const result = await tryPegasusGet(path, { token, signal });
  return {
    httpStatus: result.httpStatus,
    items: result.httpStatus === 200 ? normalizeTriggerListPayload(result.payload) : [],
  };
}

async function resolveListEndpoint({ token, signal, candidateStatuses }) {
  for (const candidate of LIST_ENDPOINT_CANDIDATES) {
    const { httpStatus, items } = await fetchTriggersListPage({
      token,
      candidate,
      page: 1,
      signal,
    });
    recordCandidateStatus(candidateStatuses, candidate.label, httpStatus);

    if (httpStatus === 200) {
      return { candidate, firstPageItems: items, httpStatus };
    }
  }

  return null;
}

async function fetchTriggerById({ token, id, signal, candidateStatuses }) {
  const encodedId = encodeURIComponent(id);

  for (const candidate of BY_ID_ENDPOINT_CANDIDATES) {
    for (const path of candidate.paths(encodedId)) {
      const result = await tryPegasusGet(path, { token, signal });
      recordCandidateStatus(candidateStatuses, candidate.label, result.httpStatus);

      if (result.httpStatus !== 200) {
        continue;
      }

      const triggers = normalizeTriggerListPayload(result.payload);
      const trigger =
        triggers.find((entry) => extractTriggerIdFromRef(entry) === id) ?? triggers[0] ?? null;

      if (trigger && !isShallowTrigger(trigger)) {
        return { trigger, endpointTried: candidate.label };
      }
    }
  }

  return { trigger: null, endpointTried: null };
}

async function fetchTriggersByIdBatch({ token, ids, signal, candidateStatuses }) {
  const hydratedById = new Map();
  let endpointTried = null;

  for (let index = 0; index < ids.length; index += HYDRATION_BY_ID_CONCURRENCY) {
    const batch = ids.slice(index, index + HYDRATION_BY_ID_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (id) => {
        const result = await fetchTriggerById({ token, id, signal, candidateStatuses });
        return [id, result.trigger, result.endpointTried];
      })
    );

    for (const [id, trigger, triedLabel] of results) {
      if (trigger) {
        hydratedById.set(id, trigger);
        endpointTried = triedLabel ?? endpointTried;
      }
    }
  }

  return { hydratedById, endpointTried };
}

function createEmptyDiagnostics({ attempted = false } = {}) {
  return {
    attempted,
    inputTriggerRefCount: 0,
    uniqueTriggerIdCount: 0,
    hydratedTriggerCount: 0,
    method: 'none',
    endpointTried: null,
    httpStatus: null,
    candidateStatuses: [],
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
  let listContributedCount = 0;
  let byIdContributedCount = 0;
  let listEndpointTried = null;
  let byIdEndpointTried = null;

  try {
    const listResolution = await resolveListEndpoint({
      token,
      signal,
      candidateStatuses: diagnostics.candidateStatuses,
    });

    if (listResolution) {
      const { candidate, firstPageItems, httpStatus } = listResolution;
      diagnostics.httpStatus = httpStatus;
      listEndpointTried = candidate.label;
      listContributedCount += mergeDetailedListItems(firstPageItems, idSet, hydratedById);

      let previousPageSize = firstPageItems.length;
      let page = 2;
      while (
        page <= HYDRATION_MAX_PAGES &&
        hydratedById.size < idsToFetch.length &&
        previousPageSize >= HYDRATION_PAGE_SIZE
      ) {
        const { httpStatus: pageStatus, items } = await fetchTriggersListPage({
          token,
          candidate,
          page,
          signal,
        });
        recordCandidateStatus(diagnostics.candidateStatuses, candidate.label, pageStatus);

        if (pageStatus !== 200 || items.length === 0) {
          break;
        }

        listContributedCount += mergeDetailedListItems(items, idSet, hydratedById);
        previousPageSize = items.length;

        if (items.length < HYDRATION_PAGE_SIZE) {
          break;
        }

        page += 1;
      }
    } else {
      diagnostics.warnings.push('trigger list hydration request failed');
      const lastStatus = diagnostics.candidateStatuses.at(-1)?.httpStatus ?? null;
      diagnostics.httpStatus = lastStatus;
    }

    const missingIds = idsToFetch.filter((id) => !hydratedById.has(id));
    if (missingIds.length > 0) {
      const byIdResults = await fetchTriggersByIdBatch({
        token,
        ids: missingIds,
        signal,
        candidateStatuses: diagnostics.candidateStatuses,
      });

      for (const [id, trigger] of byIdResults.hydratedById.entries()) {
        if (!hydratedById.has(id)) {
          hydratedById.set(id, trigger);
          byIdContributedCount += 1;
        }
      }

      byIdEndpointTried = byIdResults.endpointTried;
    }

    const triggers = idsToFetch.map((id) => hydratedById.get(id)).filter(Boolean);
    diagnostics.hydratedTriggerCount = triggers.length;

    if (listContributedCount > 0) {
      diagnostics.method = 'list';
      diagnostics.endpointTried = listEndpointTried;
    } else if (byIdContributedCount > 0) {
      diagnostics.method = 'by-id';
      diagnostics.endpointTried = byIdEndpointTried;
      diagnostics.httpStatus = 200;
    } else {
      diagnostics.method = 'none';
      diagnostics.endpointTried = null;
    }

    if (triggers.length === 0) {
      diagnostics.warnings.push('no trigger details returned from Pegasus');
    }

    return { triggers, diagnostics };
  } catch {
    diagnostics.method = 'none';
    diagnostics.endpointTried = null;
    diagnostics.warnings.push('trigger detail hydration request failed');
    return { triggers: [], diagnostics };
  } finally {
    clearTimeout(timeout);
  }
}
