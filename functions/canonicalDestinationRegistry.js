const crypto = require('crypto');

const { compactDestinationSearchText } = require('./destinationCatalogService');
const { distanceKm } = require('./destinationIdentityService');

const REGISTRY_PATH = 'system/destinationRegistry/entries';
const REGISTRY_VERSION = 1;
const CACHE_TTL_MS = 5 * 60 * 1000;
const DESTINATION_KINDS = Object.freeze(['city_hub', 'island', 'tourism_region', 'province']);
const GROUPING_POLICIES = Object.freeze(['self', 'parent', 'approved_children']);

// These policies are deliberately small and ship with the resolver so the known
// failures are fixed before the private registry seed is applied. The seed tool
// enriches the full researched catalog with Google identity and viewport data.
const BUILTIN_POLICIES = Object.freeze([
  { id: 'in-munnar', countryCode: 'IN', names: { he: 'מונאר', en: 'Munnar' }, aliases: ['Munnar', 'Kannan Devan Hills', 'Rajamalai'], kind: 'tourism_region', groupingPolicy: 'self', center: { lat: 10.0889, lng: 77.0595 }, radiusKm: 32 },
  { id: 'in-goa', countryCode: 'IN', names: { he: 'גואה', en: 'Goa' }, aliases: ['Goa', 'North Goa', 'South Goa'], kind: 'tourism_region', groupingPolicy: 'self', center: { lat: 15.2993, lng: 74.124 }, radiusKm: 85 },
  { id: 'in-dharamshala', countryCode: 'IN', names: { he: 'דרמסלה', en: 'Dharamshala' }, aliases: ['Dharamshala', 'McLeod Ganj', 'Mcleodganj'], kind: 'city_hub', groupingPolicy: 'self', center: { lat: 32.219, lng: 76.3234 }, radiusKm: 18 },
  { id: 'in-manali', countryCode: 'IN', names: { he: 'מנאלי', en: 'Manali' }, aliases: ['Manali', 'Old Manali'], kind: 'city_hub', groupingPolicy: 'self', center: { lat: 32.2432, lng: 77.1892 }, radiusKm: 22 },
  { id: 'in-rishikesh', countryCode: 'IN', names: { he: 'רישיקש', en: 'Rishikesh' }, aliases: ['Rishikesh'], kind: 'city_hub', groupingPolicy: 'self', center: { lat: 30.0869, lng: 78.2676 }, radiusKm: 20 },
  { id: 'in-parvati-valley', countryCode: 'IN', names: { he: 'עמק פרוואטי', en: 'Parvati Valley' }, aliases: ['Parvati Valley', 'Kasol', 'Tosh', 'Manikaran'], kind: 'tourism_region', groupingPolicy: 'self', center: { lat: 32.01, lng: 77.31 }, radiusKm: 42 },
  { id: 'ni-ometepe', countryCode: 'NI', names: { he: 'אומטפה', en: 'Ometepe' }, aliases: ['Ometepe', 'Isla de Ometepe', 'Moyogalpa', 'Altagracia', 'Tilgue'], kind: 'island', groupingPolicy: 'self', center: { lat: 11.514, lng: -85.583 }, radiusKm: 35 },
  { id: 'gr-corfu', countryCode: 'GR', names: { he: 'קורפו', en: 'Corfu' }, aliases: ['Corfu', 'Kerkyra', 'Perama'], kind: 'island', groupingPolicy: 'self', center: { lat: 39.6243, lng: 19.9217 }, radiusKm: 42 },
  { id: 'th-chiang-mai', countryCode: 'TH', names: { he: 'צ׳יאנג מאי', en: 'Chiang Mai' }, aliases: ['Chiang Mai', 'Chiang Mai Province'], kind: 'province', groupingPolicy: 'self', center: { lat: 18.7883, lng: 98.9853 }, radiusKm: 115 },
  { id: 'th-chiang-rai', countryCode: 'TH', names: { he: 'צ׳יאנג ראי', en: 'Chiang Rai' }, aliases: ['Chiang Rai', 'Chiang Rai Province'], kind: 'province', groupingPolicy: 'self', center: { lat: 19.9105, lng: 99.8406 }, radiusKm: 105 },
  { id: 'cy-cyprus', countryCode: 'CY', names: { he: 'קפריסין', en: 'Cyprus' }, aliases: ['Cyprus'], kind: 'island', groupingPolicy: 'approved_children', center: { lat: 35.1264, lng: 33.4299 }, radiusKm: 125 },
  { id: 'cy-paphos', countryCode: 'CY', names: { he: 'פאפוס', en: 'Paphos' }, aliases: ['Paphos'], kind: 'city_hub', parentId: 'cy-cyprus', groupingPolicy: 'self', center: { lat: 34.7754, lng: 32.4245 }, radiusKm: 25 },
  { id: 'cy-larnaca', countryCode: 'CY', names: { he: 'לרנקה', en: 'Larnaca' }, aliases: ['Larnaca'], kind: 'city_hub', parentId: 'cy-cyprus', groupingPolicy: 'self', center: { lat: 34.9003, lng: 33.6232 }, radiusKm: 24 },
  { id: 'cy-ayia-napa', countryCode: 'CY', names: { he: 'איה נאפה', en: 'Ayia Napa' }, aliases: ['Ayia Napa', 'Agia Napa'], kind: 'city_hub', parentId: 'cy-cyprus', groupingPolicy: 'self', center: { lat: 34.9923, lng: 34.014 }, radiusKm: 20 },
  { id: 'ph-palawan', countryCode: 'PH', names: { he: 'פלאוון', en: 'Palawan' }, aliases: ['Palawan'], kind: 'island', groupingPolicy: 'approved_children', center: { lat: 9.8349, lng: 118.7384 }, radiusKm: 260 },
  { id: 'ph-el-nido', countryCode: 'PH', names: { he: 'אל נידו', en: 'El Nido' }, aliases: ['El Nido'], kind: 'city_hub', parentId: 'ph-palawan', groupingPolicy: 'self', center: { lat: 11.2027, lng: 119.4166 }, radiusKm: 42 },
  { id: 'ph-coron', countryCode: 'PH', names: { he: 'קורון', en: 'Coron' }, aliases: ['Coron'], kind: 'city_hub', parentId: 'ph-palawan', groupingPolicy: 'self', center: { lat: 12.0, lng: 120.204 }, radiusKm: 48 },
]);

let cache = new Map();

function normalizedAliases(entry) {
  return Array.from(new Set([
    entry?.names?.he,
    entry?.names?.en,
    ...(Array.isArray(entry?.aliases) ? entry.aliases : []),
  ].map(compactDestinationSearchText).filter(Boolean)));
}

function canonicalDestinationId(countryId, registryId) {
  const digest = crypto.createHash('sha256').update(`${countryId}:${registryId}`).digest('base64url');
  return `dst_${digest.slice(0, 20)}`;
}

function normalizeEntry(entry) {
  const countryCode = String(entry?.countryCode || '').trim().toUpperCase();
  return {
    ...entry,
    countryCode,
    aliasesNormalized: normalizedAliases(entry),
    status: entry?.status || 'active',
    registryVersion: Number(entry?.registryVersion || REGISTRY_VERSION),
  };
}

function validateRegistryEntry(entry, { requireProviderIdentity = true } = {}) {
  const normalized = normalizeEntry(entry);
  const errors = [];
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(String(normalized.id || ''))) errors.push('invalid_id');
  if (!/^[A-Z]{2}$/.test(normalized.countryCode)) errors.push('invalid_country_code');
  if (!normalized.names?.he || !/[\u0590-\u05ff]/.test(normalized.names.he)) errors.push('invalid_hebrew_name');
  if (!normalized.names?.en) errors.push('missing_english_name');
  if (!DESTINATION_KINDS.includes(normalized.kind)) errors.push('invalid_kind');
  if (!GROUPING_POLICIES.includes(normalized.groupingPolicy)) errors.push('invalid_grouping_policy');
  if (!normalized.aliasesNormalized.length) errors.push('missing_aliases');
  if (requireProviderIdentity && !normalized.providerRefs?.googlePlaceId) errors.push('missing_google_place_id');
  const viewportCoordinates = [
    normalized.viewport?.southwest?.lat,
    normalized.viewport?.southwest?.lng,
    normalized.viewport?.northeast?.lat,
    normalized.viewport?.northeast?.lng,
  ];
  const validViewport = viewportCoordinates.every((value) => Number.isFinite(Number(value)));
  const validRadius = Number.isFinite(Number(normalized.center?.lat)) &&
    Number.isFinite(Number(normalized.center?.lng)) &&
    Number.isFinite(Number(normalized.radiusKm)) && Number(normalized.radiusKm) > 0;
  if (requireProviderIdentity && !validViewport && !validRadius) errors.push('missing_geometry');
  const sources = Array.isArray(normalized.researchSources) ? normalized.researchSources : [];
  if (normalized.approval?.approvedByAdmin !== true && new Set(sources.map((source) => source?.url).filter(Boolean)).size < 2) errors.push('insufficient_research_sources');
  return { valid: errors.length === 0, errors, entry: normalized };
}

function pointInsideViewport(point, viewport) {
  const lat = Number(point?.lat);
  const lng = Number(point?.lng);
  const south = Number(viewport?.southwest?.lat);
  const west = Number(viewport?.southwest?.lng);
  const north = Number(viewport?.northeast?.lat);
  const east = Number(viewport?.northeast?.lng);
  if (![lat, lng, south, west, north, east].every(Number.isFinite)) return false;
  return lat >= Math.min(south, north) && lat <= Math.max(south, north) &&
    (west <= east ? lng >= west && lng <= east : lng >= west || lng <= east);
}

function entryContainsPoint(entry, coordinates) {
  if (entry.viewport && pointInsideViewport(coordinates, entry.viewport)) return true;
  return entry.center && Number.isFinite(Number(entry.radiusKm)) &&
    distanceKm(entry.center, coordinates) <= Number(entry.radiusKm);
}

function groupedEntryFor(entry, entries) {
  if (!entry) return null;
  const byId = new Map(entries.map((candidate) => [candidate.id, candidate]));
  let current = entry;
  const visited = new Set();
  while (current?.parentId && !visited.has(current.id)) {
    visited.add(current.id);
    const parent = byId.get(current.parentId);
    if (!parent) break;
    const childApproved = parent.groupingPolicy === 'approved_children' &&
      current.groupingPolicy !== 'parent';
    if (childApproved) break;
    current = parent;
  }
  return current;
}

function uniqueGroupedEntries(entries, candidates) {
  const grouped = new Map();
  entries.forEach((entry) => {
    const effective = groupedEntryFor(entry, candidates);
    if (effective) grouped.set(effective.id, effective);
  });
  return Array.from(grouped.values());
}

function registryCollectionIssues(entries) {
  const normalized = entries.map(normalizeEntry);
  const byId = new Map();
  const issues = [];
  const providerOwners = new Map();
  normalized.forEach((entry) => {
    if (byId.has(entry.id)) issues.push({ code: 'duplicate_id', id: entry.id });
    byId.set(entry.id, entry);
    const providerIds = [
      entry.providerRefs?.googlePlaceId,
      ...(Array.isArray(entry.providerRefs?.googlePlaceIds) ? entry.providerRefs.googlePlaceIds : []),
    ].filter(Boolean);
    providerIds.forEach((providerId) => {
      const owner = providerOwners.get(providerId);
      if (owner && owner !== entry.id) {
        issues.push({ code: 'duplicate_google_place_id', id: entry.id, relatedId: owner });
      } else {
        providerOwners.set(providerId, entry.id);
      }
    });
  });

  normalized.forEach((entry) => {
    if (entry.groupingPolicy === 'parent' && !entry.parentId) {
      issues.push({ code: 'parent_policy_without_parent', id: entry.id });
    }
    if (!entry.parentId) return;
    const parent = byId.get(entry.parentId);
    if (entry.parentId === entry.id) {
      issues.push({ code: 'self_parent', id: entry.id });
    } else if (!parent) {
      issues.push({ code: 'missing_parent', id: entry.id, relatedId: entry.parentId });
    } else if (parent.countryCode !== entry.countryCode) {
      issues.push({ code: 'cross_country_parent', id: entry.id, relatedId: entry.parentId });
    } else if (entry.groupingPolicy !== 'parent' && parent.groupingPolicy !== 'approved_children') {
      issues.push({ code: 'unapproved_child', id: entry.id, relatedId: entry.parentId });
    }
  });

  normalized.forEach((entry) => {
    const visited = new Set();
    let current = entry;
    while (current?.parentId) {
      if (visited.has(current.id)) {
        issues.push({ code: 'parent_cycle', id: entry.id });
        break;
      }
      visited.add(current.id);
      current = byId.get(current.parentId);
      if (!current) break;
    }
  });

  for (let leftIndex = 0; leftIndex < normalized.length; leftIndex += 1) {
    const left = normalized[leftIndex];
    if (!left.center) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < normalized.length; rightIndex += 1) {
      const right = normalized[rightIndex];
      if (left.countryCode !== right.countryCode || !right.center) continue;
      const related = left.parentId === right.id || right.parentId === left.id;
      if (related) continue;
      const centerDistance = distanceKm(left.center, right.center);
      if (centerDistance < 3 && entryContainsPoint(left, right.center) &&
          entryContainsPoint(right, left.center)) {
        issues.push({ code: 'unresolved_overlap', id: left.id, relatedId: right.id });
      }
    }
  }
  return issues.filter((issue, index, values) => values.findIndex((candidate) =>
    candidate.code === issue.code && candidate.id === issue.id &&
    candidate.relatedId === issue.relatedId
  ) === index);
}

function matchCanonicalEntry(entries, { countryCode, providerPlaceId, aliases = [], coordinates }) {
  const code = String(countryCode || '').toUpperCase();
  const candidates = entries.map(normalizeEntry)
    .filter((entry) => entry.status === 'active' && entry.countryCode === code);
  if (providerPlaceId) {
    const exact = candidates.find((entry) => entry.providerRefs?.googlePlaceId === providerPlaceId ||
      (entry.providerRefs?.googlePlaceIds || []).includes(providerPlaceId));
    if (exact) return { entry: groupedEntryFor(exact, candidates), source: 'canonical_google_place_id' };
  }
  const aliasKeys = new Set(aliases.map(compactDestinationSearchText).filter(Boolean));
  const rawAliasMatches = candidates.filter((entry) => entry.aliasesNormalized.some((alias) => aliasKeys.has(alias)));
  const rawContaining = candidates.filter((entry) => coordinates && entryContainsPoint(entry, coordinates));
  const aliasMatches = uniqueGroupedEntries(rawAliasMatches, candidates);
  const containing = uniqueGroupedEntries(rawContaining, candidates);
  if (aliasMatches.length === 1) {
    return {
      entry: aliasMatches[0],
      source: containing.includes(aliasMatches[0]) ? 'canonical_alias_and_geometry' : 'canonical_alias',
    };
  }
  if (aliasMatches.length > 1) {
    const containedAliasMatches = aliasMatches.filter((entry) => containing.includes(entry));
    if (containedAliasMatches.length === 1) {
      return { entry: containedAliasMatches[0], source: 'canonical_alias_and_geometry' };
    }
    if (!containedAliasMatches.length) return { ambiguity: aliasMatches.slice(0, 3) };
  }
  const aliasMatchIds = new Set(aliasMatches.map((entry) => entry.id));
  const eligible = containing.filter((entry) => aliasMatchIds.has(entry.id));
  const pool = eligible.length ? eligible : containing;
  if (!pool.length) return null;
  const children = pool.filter((entry) => entry.parentId &&
    candidates.find((candidate) => candidate.id === entry.parentId)?.groupingPolicy === 'approved_children');
  const preferred = children.length ? children : pool;
  const sorted = preferred.sort((left, right) => {
    const leftDistance = left.center ? distanceKm(left.center, coordinates) : 0;
    const rightDistance = right.center ? distanceKm(right.center, coordinates) : 0;
    return leftDistance - rightDistance || left.id.localeCompare(right.id);
  });
  if (sorted.length > 1) {
    const firstDistance = sorted[0].center ? distanceKm(sorted[0].center, coordinates) : 0;
    const secondDistance = sorted[1].center ? distanceKm(sorted[1].center, coordinates) : 0;
    if (Math.abs(firstDistance - secondDistance) < 3 && sorted[0].parentId === sorted[1].parentId) {
      return { ambiguity: sorted.slice(0, 3) };
    }
  }
  return { entry: sorted[0], source: aliasMatchIds.has(sorted[0].id) ? 'canonical_alias_and_geometry' : 'canonical_geometry' };
}

async function registryEntriesForCountry(db, countryCode, now = Date.now()) {
  const code = String(countryCode || '').toUpperCase();
  const cached = cache.get(code);
  if (cached && cached.expiresAt > now) return cached.entries;
  let persisted = [];
  try {
    const snapshot = await db.collection(REGISTRY_PATH).where('countryCode', '==', code).get();
    persisted = snapshot.docs.map((document) => normalizeEntry({ id: document.id, ...document.data() }));
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
  }
  const merged = new Map(BUILTIN_POLICIES.filter((entry) => entry.countryCode === code)
    .map((entry) => [entry.id, normalizeEntry(entry)]));
  persisted.forEach((entry) => merged.set(entry.id, entry));
  const entries = Array.from(merged.values());
  cache.set(code, { expiresAt: now + CACHE_TTL_MS, entries });
  return entries;
}

function clearRegistryCache() {
  cache = new Map();
}

module.exports = {
  BUILTIN_POLICIES,
  DESTINATION_KINDS,
  GROUPING_POLICIES,
  REGISTRY_PATH,
  REGISTRY_VERSION,
  canonicalDestinationId,
  clearRegistryCache,
  entryContainsPoint,
  matchCanonicalEntry,
  normalizeEntry,
  registryCollectionIssues,
  registryEntriesForCountry,
  validateRegistryEntry,
};
