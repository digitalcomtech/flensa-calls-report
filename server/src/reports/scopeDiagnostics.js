import { maskDestinations } from '../utils/phoneMask.js';

const FULL_PHONE_PATTERN = /\+?\d{7,}/;

const PROCESS_ITEM_TYPES = ['object', 'string', 'number', 'array', 'null', 'other'];
const SAMPLE_NESTED_OBJECT_ROOT_KEYS = ['config', 'params', 'settings', 'data', 'payload'];

function mapProcessItemTypesSeen(entries) {
  const counts = Object.fromEntries(PROCESS_ITEM_TYPES.map((type) => [type, 0]));
  for (const entry of entries ?? []) {
    if (entry?.type && entry.type in counts) {
      counts[entry.type] = entry.count ?? 0;
    }
  }
  return PROCESS_ITEM_TYPES.map((type) => ({ type, count: counts[type] }));
}

function mapProcessHydrationForApi(source) {
  if (!source) {
    return null;
  }

  return {
    attempted: Boolean(source.attempted),
    inputProcessRefCount: source.inputProcessRefCount ?? 0,
    uniqueProcessIdCount: source.uniqueProcessIdCount ?? 0,
    hydratedProcessCount: source.hydratedProcessCount ?? 0,
    method: source.method ?? 'none',
    endpointTried: source.endpointTried ?? null,
    httpStatus: source.httpStatus ?? null,
    candidateStatuses: (source.candidateStatuses ?? []).map((entry) => ({
      candidate: entry.candidate,
      httpStatus: entry.httpStatus,
    })),
    warnings: [...(source.warnings ?? [])],
  };
}

function mapPathCountEntries(entries) {
  return (entries ?? []).map((entry) => ({
    path: entry.path,
    count: entry.count ?? 0,
  }));
}

function mapProcessSampleShapes(shapes) {
  return (shapes ?? []).map((shape) => ({
    topLevelKeys: [...(shape.topLevelKeys ?? [])],
    nestedObjectKeys: Object.fromEntries(
      SAMPLE_NESTED_OBJECT_ROOT_KEYS.map((key) => [key, [...(shape.nestedObjectKeys?.[key] ?? [])]])
    ),
  }));
}

/** Stable API shape for trigger diagnostics; never emits null for array fields. */
export function normalizeTriggerDiagnosticsForApi(source = {}) {
  return {
    sampledTriggerCount: source.sampledTriggerCount ?? 0,
    triggerTopLevelKeysSeen: [...(source.triggerTopLevelKeysSeen ?? [])],
    processArrayPaths: mapPathCountEntries(source.processArrayPaths),
    processObjectPaths: mapPathCountEntries(source.processObjectPaths),
    processTypeFieldsSeen: [...(source.processTypeFieldsSeen ?? [])],
    processTypeValuesSeen: [...(source.processTypeValuesSeen ?? [])],
    destinationFieldPathsSeen: mapPathCountEntries(source.destinationFieldPathsSeen),
    processTopLevelKeysSeen: [...(source.processTopLevelKeysSeen ?? [])],
    processNestedObjectPathsSeen: mapPathCountEntries(source.processNestedObjectPathsSeen),
    processNestedArrayPathsSeen: mapPathCountEntries(source.processNestedArrayPathsSeen),
    processPrimitiveFieldNamesSeen: [...(source.processPrimitiveFieldNamesSeen ?? [])],
    processCandidatePhoneFieldNamesSeen: mapPathCountEntries(source.processCandidatePhoneFieldNamesSeen),
    processSampleShapes: mapProcessSampleShapes(source.processSampleShapes),
    processItemTypesSeen: mapProcessItemTypesSeen(source.processItemTypesSeen),
    processRefCount: source.processRefCount ?? 0,
    processObjectCount: source.processObjectCount ?? 0,
  };
}

export function buildSafeScopeDiagnostics(
  scope,
  { mode, authMode, hasSession, includeResourceShape = false, includeTriggerDiagnostics = false } = {}
) {
  const diagnostics = {
    mode,
    authMode,
    hasSession,
    hasPegasusToken: Boolean(scope.hasPegasusToken),
    resourceCount: scope.resourceCount ?? 0,
    triggerCount: scope.triggerCount ?? 0,
    destinationCount: scope.destinationCount ?? 0,
    destinationsPreview: maskDestinations(scope.destinations ?? []),
    warnings: [...(scope.warnings ?? [])],
  };

  if (includeResourceShape && scope.resourceShape) {
    diagnostics.resourcesRawType = scope.resourceShape.resourcesRawType;
    diagnostics.resourcesTopLevelKeys = [...(scope.resourceShape.resourcesTopLevelKeys ?? [])];
    diagnostics.candidateArrayPaths = (scope.resourceShape.candidateArrayPaths ?? []).map((entry) => ({
      path: entry.path,
      count: entry.count,
    }));
    diagnostics.normalizedResourceCount =
      scope.normalization?.normalizedResourceCount ??
      scope.resourceShape.normalizedResourceCount ??
      scope.resourceCount ??
      0;
    diagnostics.normalizedTriggerCount =
      scope.normalization?.normalizedTriggerCount ??
      scope.resourceShape.normalizedTriggerCount ??
      scope.triggerCount ??
      0;
    diagnostics.rawTopLevelArrayCounts = {
      ...(scope.normalization?.rawTopLevelArrayCounts ??
        scope.resourceShape.rawTopLevelArrayCounts ?? {
          assets: 0,
          tasks: 0,
          vehicles: 0,
          triggers: 0,
        }),
    };
  }

  if (includeTriggerDiagnostics) {
    diagnostics.triggerDiagnostics = normalizeTriggerDiagnosticsForApi(scope.triggerDiagnostics ?? {});

    if (scope.triggerHydration || scope.processHydration) {
      const hydration = scope.triggerHydration ?? {
        attempted: false,
        inputTriggerRefCount: 0,
        uniqueTriggerIdCount: 0,
        hydratedTriggerCount: 0,
        method: 'none',
        endpointTried: null,
        httpStatus: null,
        candidateStatuses: [],
        warnings: [],
      };

      diagnostics.triggerHydration = {
        attempted: Boolean(hydration.attempted),
        inputTriggerRefCount: hydration.inputTriggerRefCount ?? 0,
        uniqueTriggerIdCount: hydration.uniqueTriggerIdCount ?? 0,
        hydratedTriggerCount: hydration.hydratedTriggerCount ?? 0,
        method: hydration.method ?? 'none',
        endpointTried: hydration.endpointTried ?? null,
        httpStatus: hydration.httpStatus ?? null,
        candidateStatuses: (hydration.candidateStatuses ?? []).map((entry) => ({
          candidate: entry.candidate,
          httpStatus: entry.httpStatus,
        })),
        warnings: [...(hydration.warnings ?? [])],
      };

      const processHydration = mapProcessHydrationForApi(
        hydration.processHydration ?? scope.processHydration
      );
      if (processHydration) {
        diagnostics.triggerHydration.processHydration = processHydration;
      }
    }
  }

  return diagnostics;
}

export function buildSafeReportScopeMeta(scope, matchedRows, { source = 'mock' } = {}) {
  const meta = {
    destinationCount: scope.destinationCount ?? 0,
    warnings: [...(scope.warnings ?? [])],
  };

  if (source === 'twilio') {
    meta.matchedTwilioRows = matchedRows;
  } else {
    meta.matchedMockRows = matchedRows;
  }

  return meta;
}

export function containsFullPhoneNumber(value) {
  if (typeof value === 'string') {
    return FULL_PHONE_PATTERN.test(value.replace(/\*/g, ''));
  }

  if (Array.isArray(value)) {
    return value.some((item) => containsFullPhoneNumber(item));
  }

  if (value && typeof value === 'object') {
    return Object.values(value).some((item) => containsFullPhoneNumber(item));
  }

  return false;
}
