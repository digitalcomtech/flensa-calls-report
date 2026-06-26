export function showCaBadges(env = import.meta.env) {
  return env?.VITE_SHOW_CA_BADGES === 'true';
}
