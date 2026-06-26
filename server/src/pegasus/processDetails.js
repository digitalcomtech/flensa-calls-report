import { pegasusGet, PegasusApiError } from './client.js';
import {
  extractProcessIdFromRef,
  hasProcessDetailShape,
  isProcessRef,
  normalizeProcessItem,
} from './processArrayShape.js';
import {
  HYDRATION_BY_ID_CONCURRENCY,
  HYDRATION_CAP,
  HYDRATION_MAX_PAGES,
  HYDRATION_PAGE_SIZE,
  HYDRATION_TIMEOUT_MS,
} from './triggerDetails.js';

export const LIST_ENDPOINT_CANDIDATES = [
  { label: 'processes-list-select', basePath: '/processes', withSelect: true },
  { label: 'processes-list', basePath: '/processes', withSelect: false },
  { label: 'api-processes-list-select', basePath: '/api/processes', withSelect: true },
  { label: 'api-processes-list', basePath: '/api/processes', withSelect: false },
];

const BY_ID_ENDPOINT_CANDIDATES = [
  {
    label: 'processes-by-id',
    paths: (id) => [`/processes/${id}`, `/processes?id=${id}`],
  },
  {
    label: 'api-processes-by-id',
    paths: (id) => [`/api/processes/${id}`, `/api/processes?id=${id}`],
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

export {
  extractProcessIdFromRef,
  hasProcessDetailShape,
  isInspectableProcessObject,
  isProcessRef,
  normalizeProcessItem,
} from './processArrayShape.js';

export function extractProcessIdsFromRefs(refs) {
  const ids = [];
  const seen = new Set();

  for (const ref of refs ?? []) {
    const id = extractProcessIdFromRef(ref);
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    ids.push(id);
  }

  return ids;
}

export function collectRawProcessItems(trigger) {
  if (!isPlainObject(trigger)) {
    return [];
  }

  const items = [];

  const addArray = (value) => {
    if (Array.isArray(value)) {
      items.push(...value);
    }
  };

  addArray(trigger.processes);
  addArray(trigger.process);
  if (isPlainObject(trigger.process)) {
    items.push(trigger.process);
  }
  addArray(trigger.config?.processes);
  if (isPlainObject(trigger.config?.process)) {
    items.push(trigger.config.process);
  }

  return items;
}

export function extractProcessRefsFromTriggers(triggers) {
  const refs = [];

  for (const trigger of triggers ?? []) {
    refs.push(...collectRawProcessItems(trigger));
  }

  return refs;
}

export function isShallowProcess(ref) {
  if (Array.isArray(ref)) {
    const converted = normalizeProcessItem(ref);
    if (converted && hasProcessDetailShape(converted)) {
      return false;
    }
    return Boolean(extractProcessIdFromRef(ref));
  }

  if (typeof ref === 'string' || typeof ref === 'number') {
    return true;
  }

  if (!isPlainObject(ref)) {
    return false;
  }

  return !hasProcessDetailShape(ref);
}

export function shouldHydrateProcessDetails(triggers, extracted) {
  if (!Array.isArray(triggers) || triggers.length === 0) {
    return false;
  }

  if ((extracted?.destinationCount ?? 0) > 0) {
    return false;
  }

  const refs = extractProcessRefsFromTriggers(triggers);
  if (refs.length === 0) {
    return false;
  }

  if (!refs.some(isProcessRef)) {
    return false;
  }

  return extractProcessIdsFromRefs(refs).length > 0;
}

function isIdKeyedProcessMap(payload) {
  if (!isPlainObject(payload)) {
    return false;
  }

  const entries = Object.entries(payload);
  if (entries.length === 0) {
    return false;
  }

  return entries.every(([key, value]) => normalizeId(key) && isPlainObject(value));
}

export function normalizeProcessListPayload(payload) {
  if (Array.isArray(payload)) {
    return payload.filter((item) => isPlainObject(item));
  }

  if (!isPlainObject(payload)) {
    return [];
  }

  for (const key of ['data', 'results', 'items', 'processes']) {
    if (Array.isArray(payload[key])) {
      return payload[key].filter((item) => isPlainObject(item));
    }
  }

  if (isIdKeyedProcessMap(payload)) {
    return Object.values(payload).filter((item) => isPlainObject(item));
  }

  if (isPlainObject(payload.process)) {
    return [payload.process];
  }

  if (extractProcessIdFromRef(payload)) {
    return [payload];
  }

  return [];
}

function buildListPath(basePath, { page, set, withSelect }) {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('set', String(set));
  if (withSelect) {
    params.set('select', 'id,name,type,config,params,settings,data,payload');
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

  for (const process of pageItems) {
    const id = extractProcessIdFromRef(process);
    if (!id || !idSet.has(id) || hydratedById.has(id) || isShallowProcess(process)) {
      continue;
    }

    hydratedById.set(id, process);
    contributed += 1;
  }

  return contributed;
}

async function fetchProcessesListPage({ token, candidate, page, signal }) {
  const path = buildListPath(candidate.basePath, {
    page,
    set: HYDRATION_PAGE_SIZE,
    withSelect: candidate.withSelect,
  });
  const result = await tryPegasusGet(path, { token, signal });
  return {
    httpStatus: result.httpStatus,
    items: result.httpStatus === 200 ? normalizeProcessListPayload(result.payload) : [],
  };
}

async function resolveListEndpoint({ token, signal, candidateStatuses }) {
  for (const candidate of LIST_ENDPOINT_CANDIDATES) {
    const { httpStatus, items } = await fetchProcessesListPage({
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

async function fetchProcessById({ token, id, signal, candidateStatuses }) {
  const encodedId = encodeURIComponent(id);

  for (const candidate of BY_ID_ENDPOINT_CANDIDATES) {
    for (const path of candidate.paths(encodedId)) {
      const result = await tryPegasusGet(path, { token, signal });
      recordCandidateStatus(candidateStatuses, candidate.label, result.httpStatus);

      if (result.httpStatus !== 200) {
        continue;
      }

      const processes = normalizeProcessListPayload(result.payload);
      const process =
        processes.find((entry) => extractProcessIdFromRef(entry) === id) ?? processes[0] ?? null;

      if (process && !isShallowProcess(process)) {
        return { process, endpointTried: candidate.label };
      }
    }
  }

  return { process: null, endpointTried: null };
}

async function fetchProcessesByIdBatch({ token, ids, signal, candidateStatuses }) {
  const hydratedById = new Map();
  let endpointTried = null;

  for (let index = 0; index < ids.length; index += HYDRATION_BY_ID_CONCURRENCY) {
    const batch = ids.slice(index, index + HYDRATION_BY_ID_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (id) => {
        const result = await fetchProcessById({ token, id, signal, candidateStatuses });
        return [id, result.process, result.endpointTried];
      })
    );

    for (const [id, process, triedLabel] of results) {
      if (process) {
        hydratedById.set(id, process);
        endpointTried = triedLabel ?? endpointTried;
      }
    }
  }

  return { hydratedById, endpointTried };
}

function createEmptyDiagnostics({ attempted = false } = {}) {
  return {
    attempted,
    inputProcessRefCount: 0,
    uniqueProcessIdCount: 0,
    hydratedProcessCount: 0,
    method: 'none',
    endpointTried: null,
    httpStatus: null,
    candidateStatuses: [],
    warnings: [],
  };
}

export function mergeHydratedProcessesIntoTriggers(triggers, hydratedProcesses) {
  const hydratedById = new Map();

  for (const process of hydratedProcesses ?? []) {
    const id = extractProcessIdFromRef(process);
    if (id && isPlainObject(process)) {
      hydratedById.set(id, process);
    }
  }

  if (hydratedById.size === 0) {
    return triggers;
  }

  const mergeProcessItem = (item) => {
    const id = extractProcessIdFromRef(item);
    if (id && hydratedById.has(id)) {
      return hydratedById.get(id);
    }
    const normalized = normalizeProcessItem(item);
    if (normalized) {
      return normalized;
    }
    return isPlainObject(item) ? item : null;
  };

  const mergeTrigger = (trigger) => {
    if (!isPlainObject(trigger)) {
      return trigger;
    }

    let changed = false;
    const next = { ...trigger };

    if (Array.isArray(trigger.processes)) {
      const merged = trigger.processes.map(mergeProcessItem).filter(Boolean);
      if (merged.length > 0) {
        next.processes = merged;
        changed = true;
      }
    }

    if (Array.isArray(trigger.process)) {
      const merged = trigger.process.map(mergeProcessItem).filter(Boolean);
      if (merged.length > 0) {
        next.process = merged;
        changed = true;
      }
    } else if (isPlainObject(trigger.process)) {
      const merged = mergeProcessItem(trigger.process);
      if (merged) {
        next.process = merged;
        changed = true;
      }
    }

    if (isPlainObject(trigger.config) && Array.isArray(trigger.config.processes)) {
      const merged = trigger.config.processes.map(mergeProcessItem).filter(Boolean);
      if (merged.length > 0) {
        next.config = { ...trigger.config, processes: merged };
        changed = true;
      }
    }

    return changed ? next : trigger;
  };

  return (triggers ?? []).map(mergeTrigger);
}

export async function fetchProcessDetails({ token, processRefs, limit = HYDRATION_CAP }) {
  const refs = Array.isArray(processRefs) ? processRefs : [];
  const diagnostics = createEmptyDiagnostics({ attempted: refs.length > 0 });
  diagnostics.inputProcessRefCount = refs.length;

  const allIds = extractProcessIdsFromRefs(refs);
  diagnostics.uniqueProcessIdCount = allIds.length;

  if (allIds.length === 0) {
    diagnostics.attempted = false;
    return { processes: [], diagnostics };
  }

  const idsToFetch = allIds.slice(0, limit);
  if (allIds.length > limit) {
    diagnostics.warnings.push(`process hydration capped at ${limit} processes`);
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
        const { httpStatus: pageStatus, items } = await fetchProcessesListPage({
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
      diagnostics.warnings.push('process list hydration request failed');
      const lastStatus = diagnostics.candidateStatuses.at(-1)?.httpStatus ?? null;
      diagnostics.httpStatus = lastStatus;
    }

    const missingIds = idsToFetch.filter((id) => !hydratedById.has(id));
    if (missingIds.length > 0) {
      const byIdResults = await fetchProcessesByIdBatch({
        token,
        ids: missingIds,
        signal,
        candidateStatuses: diagnostics.candidateStatuses,
      });

      for (const [id, process] of byIdResults.hydratedById.entries()) {
        if (!hydratedById.has(id)) {
          hydratedById.set(id, process);
          byIdContributedCount += 1;
        }
      }

      byIdEndpointTried = byIdResults.endpointTried;
    }

    const processes = idsToFetch.map((id) => hydratedById.get(id)).filter(Boolean);
    diagnostics.hydratedProcessCount = processes.length;

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

    if (processes.length === 0) {
      diagnostics.warnings.push('no process details returned from Pegasus');
    }

    return { processes, diagnostics };
  } catch {
    diagnostics.method = 'none';
    diagnostics.endpointTried = null;
    diagnostics.warnings.push('process detail hydration request failed');
    return { processes: [], diagnostics };
  } finally {
    clearTimeout(timeout);
  }
}
