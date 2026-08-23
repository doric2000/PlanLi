export function normalizeRouteTimeInput(value) {
  const input = String(value || '').trim();
  if (!input) return '';
  const match = input.match(/^(\d{1,2}):([0-5]\d)$/);
  if (!match) return null;
  const hour = Number(match[1]);
  if (!Number.isSafeInteger(hour) || hour < 0 || hour > 23) return null;
  return `${String(hour).padStart(2, '0')}:${match[2]}`;
}
