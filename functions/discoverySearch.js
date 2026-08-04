const { taxonomy } = require('./travelTaxonomy');

const HEBREW_MARKS = /[\u0591-\u05C7]/g;
const NON_WORDS = /[^a-z0-9\u05D0-\u05EA]+/gi;
const FINAL_LETTERS = Object.freeze({ 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' });
const MAX_SEARCH_TOKENS = 240;
const MAX_SEARCH_PREFIXES = 480;

function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(HEBREW_MARKS, '')
    .toLowerCase()
    .replace(/[ךםןףץ]/g, (letter) => FINAL_LETTERS[letter] || letter)
    .replace(NON_WORDS, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function tokenizeSearchText(value) {
  return normalizeSearchText(value).split(' ').filter((token) => token.length >= 2);
}

function uniqueLimited(values, maximum) {
  return Array.from(new Set(values.filter(Boolean))).slice(0, maximum);
}

const synonymEntries = Object.entries(taxonomy.searchSynonyms || {}).map(([key, values]) => (
  uniqueLimited([key, ...(values || [])].flatMap(tokenizeSearchText), 20)
));

function expandToken(token) {
  const normalized = normalizeSearchText(token);
  const group = synonymEntries.find((entries) => entries.includes(normalized));
  return group || [normalized];
}

function prefixesForTokens(tokens) {
  const prefixes = [];
  for (const token of tokens) {
    const maximum = Math.min(token.length, 16);
    for (let length = 2; length <= maximum; length += 1) prefixes.push(token.slice(0, length));
  }
  return uniqueLimited(prefixes, MAX_SEARCH_PREFIXES);
}

function labelsForIds(ids, items) {
  const lookup = Object.fromEntries((items || []).map((item) => [item.id, item.label]));
  return (ids || []).map((id) => lookup[id] || '').filter(Boolean);
}

function destinationValues(destination, destinations) {
  const source = [destination, ...(Array.isArray(destinations) ? destinations : [])].filter(Boolean);
  return source.flatMap((item) => [
    item.countryName,
    item.cityName,
    item.name,
  ]).filter(Boolean);
}

function buildSearchIndex({
  title,
  description,
  destination,
  destinations,
  place,
  categoryIds = [],
  subcategoryIds = [],
  interestIds = [],
}) {
  const titleTokens = tokenizeSearchText(title);
  const descriptionTokens = tokenizeSearchText(description);
  const destinationTokens = destinationValues(destination, destinations)
    .concat([place?.name, place?.address].filter(Boolean))
    .flatMap(tokenizeSearchText);
  const taxonomyTokens = [
    ...labelsForIds(categoryIds, taxonomy.categories),
    ...labelsForIds(subcategoryIds, taxonomy.tags),
    ...labelsForIds(interestIds, taxonomy.interests),
  ].flatMap(tokenizeSearchText);
  const baseTokens = uniqueLimited([
    ...titleTokens,
    ...taxonomyTokens,
    ...destinationTokens,
    ...descriptionTokens,
  ], MAX_SEARCH_TOKENS);
  const expandedTokens = uniqueLimited(baseTokens.flatMap(expandToken), MAX_SEARCH_TOKENS);
  return {
    normalizedTitle: normalizeSearchText(title).slice(0, 240),
    titleTokens: uniqueLimited(titleTokens, 60),
    taxonomyTokens: uniqueLimited(taxonomyTokens, 100),
    destinationTokens: uniqueLimited(destinationTokens, 80),
    descriptionTokens: uniqueLimited(descriptionTokens, 160),
    tokens: expandedTokens,
    prefixes: prefixesForTokens(expandedTokens),
  };
}

function parseSearchQuery(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return { raw: '', normalized: '', terms: [], alternatives: [] };
  if (raw.length > 120) throw new Error('query is too long');
  const terms = uniqueLimited(tokenizeSearchText(raw), 6);
  return {
    raw,
    normalized: normalizeSearchText(raw),
    terms,
    alternatives: terms.map(expandToken),
  };
}

function fieldMatches(fieldTokens, alternatives) {
  return alternatives.some((candidate) => fieldTokens.some((token) => token.startsWith(candidate)));
}

function searchRelevance(item, parsedQuery) {
  if (!parsedQuery?.terms?.length) return { matches: true, score: 0 };
  const search = item?.search || buildSearchIndex({
    title: item?.title,
    description: item?.description,
    destination: item?.destination,
    destinations: item?.destinations,
    place: item?.place,
    categoryIds: item?.categoryIds || [item?.categoryId].filter(Boolean),
    subcategoryIds: item?.subcategoryIds || item?.tags,
    interestIds: item?.facets?.interests,
  });
  let score = search.normalizedTitle === parsedQuery.normalized ? 180 :
    search.normalizedTitle?.includes(parsedQuery.normalized) ? 100 : 0;
  for (const alternatives of parsedQuery.alternatives) {
    const title = fieldMatches(search.titleTokens || [], alternatives);
    const taxonomyMatch = fieldMatches(search.taxonomyTokens || [], alternatives);
    const destination = fieldMatches(search.destinationTokens || [], alternatives);
    const description = fieldMatches(search.descriptionTokens || [], alternatives);
    if (!title && !taxonomyMatch && !destination && !description) return { matches: false, score: 0 };
    score += title ? 45 : taxonomyMatch ? 30 : destination ? 22 : 10;
  }
  return { matches: true, score };
}

function destinationKey(countryId, cityId = '') {
  return cityId ? `${countryId}:${cityId}` : `${countryId}:*`;
}

function itemDestinationKeys(item) {
  const destinations = [item?.destination, ...(Array.isArray(item?.destinations) ? item.destinations : [])]
    .filter(Boolean);
  return new Set(destinations.flatMap((destination) => {
    if (!destination.countryId) return [];
    return [
      destinationKey(destination.countryId),
      ...(destination.cityId ? [destinationKey(destination.countryId, destination.cityId)] : []),
    ];
  }));
}

function matchesDestinations(item, destinations) {
  if (!destinations?.length) return true;
  const itemKeys = itemDestinationKeys(item);
  return destinations.some((destination) => itemKeys.has(destinationKey(destination.countryId, destination.cityId)));
}

module.exports = {
  MAX_SEARCH_PREFIXES,
  MAX_SEARCH_TOKENS,
  buildSearchIndex,
  destinationKey,
  itemDestinationKeys,
  matchesDestinations,
  normalizeSearchText,
  parseSearchQuery,
  prefixesForTokens,
  searchRelevance,
  tokenizeSearchText,
};
