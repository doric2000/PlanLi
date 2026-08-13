const COMBINING_MARKS = /[\u0300-\u036f\u0591-\u05C7]/g;
const NON_ALPHANUMERIC = /[^a-z0-9\u05D0-\u05EA]+/gi;
const HEBREW_FINAL_LETTERS = Object.freeze({ ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' });

function foldDestinationText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(COMBINING_MARKS, '')
    .toLocaleLowerCase('he')
    .replace(/[ךםןףץ]/g, (letter) => HEBREW_FINAL_LETTERS[letter] || letter);
}

export function normalizeDestinationText(value) {
  return foldDestinationText(value)
    .replace(NON_ALPHANUMERIC, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function compactDestinationText(value) {
  return normalizeDestinationText(value).replace(/\s+/g, '');
}

export function destinationSearchForms(value) {
  const folded = foldDestinationText(value);
  const normalized = normalizeDestinationText(folded);
  const words = normalized.split(' ').filter(Boolean);
  const chunks = folded.split(/\s+/)
    .map((chunk) => chunk.replace(NON_ALPHANUMERIC, ''))
    .filter(Boolean);
  return Array.from(new Set([
    compactDestinationText(normalized),
    ...chunks,
    ...words,
  ].filter(Boolean)));
}

function queryParts(query) {
  const folded = foldDestinationText(query);
  const normalized = normalizeDestinationText(folded);
  return {
    compact: compactDestinationText(normalized),
    terms: Array.from(new Set([
      ...folded.split(/\s+/).map((chunk) => chunk.replace(NON_ALPHANUMERIC, '')),
      ...normalized.split(' '),
    ].filter(Boolean))),
  };
}

export function destinationSearchRank(values, query) {
  const parsed = queryParts(query);
  if (!parsed.compact) return 0;
  const forms = Array.from(new Set((Array.isArray(values) ? values : [values])
    .flatMap(destinationSearchForms)));
  if (forms.includes(parsed.compact)) return 3;
  if (forms.some((form) => form.startsWith(parsed.compact))) return 2;
  if (parsed.terms.every((term) => forms.some((form) => form.includes(term)))) return 1;
  return forms.some((form) => form.includes(parsed.compact)) ? 1 : -1;
}

export function destinationSearchText(city) {
  return [
    city?.identity?.names?.he,
    city?.identity?.names?.en,
    city?.names?.he,
    city?.names?.en,
    city?.name,
    city?.description,
    city?.countryNames?.he,
    city?.countryNames?.en,
    city?.country,
    city?.countryName,
    city?.countryId,
  ]
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
  const normalizedQuery = compactDestinationText(query);
  const list = (Array.isArray(destinations) ? destinations : [])
    .filter((city) => !savedOnly || favoriteKeys.has(`${city.countryId}:${city.id}`))
    .map((city) => {
      const fields = destinationSearchText(city);
      const rank = normalizedQuery ? destinationSearchRank(fields, query) : 0;
      return { city, rank };
    })
    .filter((entry) => entry.rank >= 0);

  return list.sort((a, b) => {
    if (normalizedQuery && a.rank !== b.rank) return b.rank - a.rank;
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
