export function normalizeDestinationText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase();
}

export function destinationSearchText(city) {
  return [
    city?.identity?.names?.he,
    city?.identity?.names?.en,
    city?.names?.he,
    city?.names?.en,
    city?.name,
    city?.countryNames?.he,
    city?.countryNames?.en,
    city?.country,
    city?.countryName,
    city?.countryId,
  ]
    .map(normalizeDestinationText)
    .filter(Boolean);
}

export function destinationPopularity(city) {
  return Number(city?.stats?.recommendationCount ?? city?.recommendationsCount ?? 0) || 0;
}

function destinationName(city) {
  return city?.identity?.names?.he || city?.names?.he || city?.name || city?.id || '';
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
      return destinationName(a.city).localeCompare(destinationName(b.city), 'he');
    }
    return destinationPopularity(b.city) - destinationPopularity(a.city)
      || destinationName(a.city).localeCompare(destinationName(b.city), 'he');
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
