import { maskDestinations } from '../utils/phoneMask.js';

const FULL_PHONE_PATTERN = /\+?\d{7,}/;

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

  if (includeTriggerDiagnostics && scope.triggerDiagnostics) {
    diagnostics.triggerDiagnostics = {
      sampledTriggerCount: scope.triggerDiagnostics.sampledTriggerCount ?? 0,
      triggerTopLevelKeysSeen: [...(scope.triggerDiagnostics.triggerTopLevelKeysSeen ?? [])],
      processArrayPaths: (scope.triggerDiagnostics.processArrayPaths ?? []).map((entry) => ({
        path: entry.path,
        count: entry.count,
      })),
      processObjectPaths: (scope.triggerDiagnostics.processObjectPaths ?? []).map((entry) => ({
        path: entry.path,
        count: entry.count,
      })),
      processTypeFieldsSeen: [...(scope.triggerDiagnostics.processTypeFieldsSeen ?? [])],
      processTypeValuesSeen: [...(scope.triggerDiagnostics.processTypeValuesSeen ?? [])],
      destinationFieldPathsSeen: (scope.triggerDiagnostics.destinationFieldPathsSeen ?? []).map((entry) => ({
        path: entry.path,
        count: entry.count,
      })),
    };

    if (scope.triggerHydration) {
      diagnostics.triggerHydration = {
        attempted: Boolean(scope.triggerHydration.attempted),
        inputTriggerRefCount: scope.triggerHydration.inputTriggerRefCount ?? 0,
        uniqueTriggerIdCount: scope.triggerHydration.uniqueTriggerIdCount ?? 0,
        hydratedTriggerCount: scope.triggerHydration.hydratedTriggerCount ?? 0,
        method: scope.triggerHydration.method ?? 'none',
        endpointTried: scope.triggerHydration.endpointTried ?? null,
        httpStatus: scope.triggerHydration.httpStatus ?? null,
        candidateStatuses: (scope.triggerHydration.candidateStatuses ?? []).map((entry) => ({
          candidate: entry.candidate,
          httpStatus: entry.httpStatus,
        })),
        warnings: [...(scope.triggerHydration.warnings ?? [])],
      };
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
