import { maskDestinations } from '../utils/phoneMask.js';

const FULL_PHONE_PATTERN = /\+?\d{7,}/;

export function buildSafeScopeDiagnostics(scope, { mode, authMode, hasSession, includeResourceShape = false }) {
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
