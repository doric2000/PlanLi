export function toggleValue(list, value) {
  if (!Array.isArray(list)) return [value];
  return list.includes(value) ? list.filter(v => v !== value) : [...list, value];
}
