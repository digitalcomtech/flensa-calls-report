export function maskPhoneNumber(phone) {
  if (typeof phone !== 'string' || !phone) {
    return '***';
  }
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 0) {
    return '***';
  }
  if (digits.length <= 4) {
    return `***${digits}`;
  }
  return `***${digits.slice(-4)}`;
}

export function maskDestinations(destinations) {
  if (!Array.isArray(destinations)) {
    return [];
  }
  return destinations.map(maskPhoneNumber);
}
