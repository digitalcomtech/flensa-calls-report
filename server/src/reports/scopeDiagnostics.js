import { maskDestinations } from '../utils/phoneMask.js';

const FULL_PHONE_PATTERN = /\+?\d{7,}/;

export function buildSafeScopeDiagnostics(scope, { mode, authMode, hasSession }) {
  return {
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
}

export function buildSafeReportScopeMeta(scope, matchedMockRows) {
  return {
    destinationCount: scope.destinationCount ?? 0,
    matchedMockRows,
    warnings: [...(scope.warnings ?? [])],
  };
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
