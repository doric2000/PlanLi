const EARTH_RADIUS_KM = 6371;
const HUMAN_SETTLEMENT_ID = 'Q486972';
// Keep automated reconciliation courteous to Wikidata. A single resolver
// process issues at most one request per interval; the migration is resumable
// and intentionally favours reliability over speed.
const WIKIDATA_MIN_REQUEST_INTERVAL_MS = Math.max(
  2500,
  Number(process.env.WIKIDATA_MIN_REQUEST_INTERVAL_MS || 3000)
);
let lastWikidataRequestAt = 0;
const wikidataEntityCache = new Map();
const settlementTypeCache = new Map();

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function wikidataRequest(url, fetchImpl) {
  const waitMs = Math.max(0, WIKIDATA_MIN_REQUEST_INTERVAL_MS - (Date.now() - lastWikidataRequestAt));
  if (waitMs) await sleep(waitMs);
  lastWikidataRequestAt = Date.now();
  const response = await fetchImpl(url, {
    headers: {
      Accept: 'application/json',
      // Override with a monitored contact URL/email in production if available.
      'User-Agent': process.env.WIKIDATA_USER_AGENT || 'PlanLi destination resolver/1.0',
    },
  });
  if (!response.ok) {
    const error = new Error(`Wikidata request failed with HTTP ${response.status}.`);
    error.status = response.status;
    const retryAfter = Number(response.headers?.get?.('retry-after'));
    if (Number.isFinite(retryAfter) && retryAfter > 0) error.retryAfterMs = retryAfter * 1000;
    throw error;
  }
  return response;
}

function normalize(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0591-\u05C7]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\u05d0-\u05ea]+/gi, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function coordinates(value) {
  const lat = Number(value?.lat ?? value?.latitude);
  const lng = Number(value?.lng ?? value?.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

function cityCoordinates(city) {
  return coordinates(city?.identity?.coordinates) || coordinates(city?.coordinates);
}

function cityName(city) {
  return String(city?.identity?.names?.he || city?.identity?.names?.en || city?.name || '').trim();
}

function distanceKm(a, b) {
  const toRadians = (value) => value * Math.PI / 180;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

function claimValue(entity, property) {
  return entity?.claims?.[property]?.[0]?.mainsnak?.datavalue?.value || null;
}

function entityCoordinates(entity) {
  const value = claimValue(entity, 'P625');
  return coordinates(value && { lat: value.latitude, lng: value.longitude });
}

function labelsAndAliases(entity) {
  return Object.values(entity?.labels || {})
    .concat(Object.values(entity?.aliases || {}).flat())
    .map((entry) => normalize(entry?.value))
    .filter(Boolean);
}

function label(entity, language) {
  return String(entity?.labels?.[language]?.value || '').trim() || null;
}

async function wikidataEntities(ids, fetchImpl = global.fetch) {
  if (!ids.length || typeof fetchImpl !== 'function') return {};
  const uniqueIds = [...new Set(ids)];
  const missingIds = uniqueIds.filter((id) => !wikidataEntityCache.has(id));
  if (!missingIds.length) {
    return Object.fromEntries(uniqueIds.map((id) => [id, wikidataEntityCache.get(id)]));
  }
  const url = new URL('https://www.wikidata.org/w/api.php');
  url.searchParams.set('action', 'wbgetentities');
  url.searchParams.set('ids', missingIds.join('|'));
  url.searchParams.set('props', 'labels|aliases|claims');
  url.searchParams.set('languages', 'he|en');
  url.searchParams.set('format', 'json');
  url.searchParams.set('origin', '*');
  const response = await wikidataRequest(url, fetchImpl);
  const entities = (await response.json())?.entities || {};
  missingIds.forEach((id) => wikidataEntityCache.set(id, entities[id] || null));
  return Object.fromEntries(uniqueIds.map((id) => [id, wikidataEntityCache.get(id)]));
}

async function searchWikidata(query, fetchImpl = global.fetch) {
  const url = new URL('https://www.wikidata.org/w/api.php');
  url.searchParams.set('action', 'wbsearchentities');
  url.searchParams.set('search', query);
  url.searchParams.set('language', 'he');
  url.searchParams.set('limit', '10');
  url.searchParams.set('format', 'json');
  url.searchParams.set('origin', '*');
  const response = await wikidataRequest(url, fetchImpl);
  return (await response.json())?.search || [];
}

async function settlementCandidateIds(ids, fetchImpl = global.fetch) {
  const uniqueIds = [...new Set(ids)].filter(Boolean);
  const missingIds = uniqueIds.filter((id) => !settlementTypeCache.has(id));
  if (missingIds.length) {
    const values = missingIds.map((id) => `wd:${id}`).join(' ');
    const sparql = `SELECT DISTINCT ?item WHERE { VALUES ?item { ${values} } ?item wdt:P31/wdt:P279* wd:${HUMAN_SETTLEMENT_ID}. }`;
    const url = new URL('https://query.wikidata.org/sparql');
    url.searchParams.set('query', sparql);
    url.searchParams.set('format', 'json');
    const response = await wikidataRequest(url, fetchImpl);
    const bindings = (await response.json())?.results?.bindings || [];
    const settlements = new Set(bindings.map((binding) => String(binding?.item?.value || '').split('/').pop()));
    missingIds.forEach((id) => settlementTypeCache.set(id, settlements.has(id)));
  }
  return new Set(uniqueIds.filter((id) => settlementTypeCache.get(id)));
}

async function resolveWikidataIdentity({ city, country, fetchImpl = global.fetch }) {
  const query = cityName(city);
  const sourceCoordinates = cityCoordinates(city);
  const countryCode = String(country?.code || city?.identity?.countryCode || '').trim().toUpperCase();
  if (!query || !sourceCoordinates || !countryCode) return null;

  const results = await searchWikidata(query, fetchImpl);
  const candidateIds = results.map((result) => result?.id).filter(Boolean).slice(0, 10);
  const candidates = await wikidataEntities(candidateIds, fetchImpl);
  const countryIds = [...new Set(Object.values(candidates)
    .map((entity) => claimValue(entity, 'P17')?.id)
    .filter(Boolean))];
  const countries = await wikidataEntities(countryIds, fetchImpl);
  const wantedName = normalize(query);
  const geographicallyValid = Object.entries(candidates).map(([id, entity]) => {
    const point = entityCoordinates(entity);
    const countryId = claimValue(entity, 'P17')?.id;
    const candidateCountryCode = String(claimValue(countries[countryId], 'P297') || '').toUpperCase();
    const exactName = labelsAndAliases(entity).includes(wantedName);
    const km = point ? distanceKm(sourceCoordinates, point) : Infinity;
    return { id, entity, point, countryId, candidateCountryCode, exactName, km };
  }).filter((candidate) => candidate.exactName && candidate.candidateCountryCode === countryCode && candidate.km <= 25)
    .sort((a, b) => a.km - b.km || a.id.localeCompare(b.id));

  const settlementIds = await settlementCandidateIds(
    geographicallyValid.map((candidate) => candidate.id),
    fetchImpl
  );
  const matches = geographicallyValid.filter((candidate) => settlementIds.has(candidate.id));

  if (!matches.length) return null;
  if (matches.length > 1 && matches[1].km - matches[0].km < 5) return null;
  const selected = matches[0];
  const countryEntity = countries[selected.countryId];
  return {
    source: 'wikidata',
    sourceId: selected.id,
    names: {
      he: label(selected.entity, 'he') || query,
      en: label(selected.entity, 'en') || query,
    },
    countryCode,
    coordinates: selected.point,
    countryNames: {
      he: label(countryEntity, 'he') || String(country?.name || '').trim() || null,
      en: label(countryEntity, 'en') || null,
    },
  };
}

module.exports = {
  cityCoordinates,
  cityName,
  distanceKm,
  normalize,
  resolveWikidataIdentity,
  settlementCandidateIds,
};
