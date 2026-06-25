export function normalizePhoneForComparison(phone) {
  if (phone === null || phone === undefined) {
    return '';
  }

  return String(phone).trim().replace(/[\s\-().]/g, '');
}

export function digitsOnlyPhone(phone) {
  return normalizePhoneForComparison(phone).replace(/\D/g, '');
}

export function phonesMatch(candidate, destination) {
  const normalizedCandidate = normalizePhoneForComparison(candidate);
  const normalizedDestination = normalizePhoneForComparison(destination);

  if (!normalizedCandidate || !normalizedDestination) {
    return false;
  }

  if (normalizedCandidate === normalizedDestination) {
    return true;
  }

  return digitsOnlyPhone(normalizedCandidate) === digitsOnlyPhone(normalizedDestination);
}

export function buildDestinationMatcher(destinations = []) {
  const allowed = Array.isArray(destinations) ? destinations.filter(Boolean) : [];

  return (candidate) => allowed.some((destination) => phonesMatch(candidate, destination));
}

export function filterCallsByScopedDestinations(calls, destinations = []) {
  const matchesDestination = buildDestinationMatcher(destinations);
  return calls.filter((call) => matchesDestination(call.destination ?? call.to));
}
