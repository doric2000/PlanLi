export function normalizeDestinationText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase();
}

export function destinationSearchText(city) {
  return [city?.name, city?.country, city?.countryName, city?.countryId, city?.description]
    .map(normalizeDestinationText)
    .filter(Boolean);
}

export function destinationPopularity(city) {
  return Number(city?.stats?.recommendationCount ?? city?.recommendationsCount ?? 0) || 0;
}

export function filterAndSortDestinations(destinations, {
  query = '',
  sortBy = 'popular',
  savedOnly = false,
  favoriteKeys = new Set(),
} = {}) {
  const normalizedQuery = normalizeDestinationText(query);
  const list = (Array.isArray(destinations) ? destinations : [])
    .filter((city) => !savedOnly || favoriteKeys.has(`${city.countryId}:${city.id}`))
    .map((city) => {
      const fields = destinationSearchText(city);
      const starts = normalizedQuery && fields.some((field) => field.startsWith(normalizedQuery));
      const includes = !normalizedQuery || fields.some((field) => field.includes(normalizedQuery));
      return { city, starts, includes };
    })
    .filter((entry) => entry.includes);

  return list.sort((a, b) => {
    if (normalizedQuery && a.starts !== b.starts) return a.starts ? -1 : 1;
    if (sortBy === 'name') {
      return String(a.city?.name || '').localeCompare(String(b.city?.name || ''), 'he');
    }
    return destinationPopularity(b.city) - destinationPopularity(a.city)
      || String(a.city?.name || '').localeCompare(String(b.city?.name || ''), 'he');
  }).map((entry) => entry.city);
}

export function mergeDestinations(...groups) {
  const map = new Map();
  groups.flat().filter(Boolean).forEach((city) => {
    const key = `${city.countryId}:${city.id}`;
    map.set(key, { ...(map.get(key) || {}), ...city });
  });
  return [...map.values()];
}
