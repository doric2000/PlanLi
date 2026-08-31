const crypto = require('crypto');

const { compactDestinationSearchText } = require('./destinationCatalogService');
const { distanceKm } = require('./destinationIdentityService');

const REGISTRY_PATH = 'system/destinationRegistry/entries';
const REGISTRY_VERSION = 3;
const CACHE_TTL_MS = 5 * 60 * 1000;
const DESTINATION_KINDS = Object.freeze([
  'city_hub',
  'island',
  'natural_feature',
  'tourism_region',
  'province',
]);
const GROUPING_POLICIES = Object.freeze(['self', 'parent', 'approved_children']);
const MATCH_PROFILE_VERSION = 3;
const DEFAULT_MATCH_RADIUS_KM = Object.freeze({
  city_hub: 35,
  island: 60,
  natural_feature: 15,
  tourism_region: 60,
  province: 80,
});
const MAX_PROVIDER_VIEWPORT_DIAGONAL_KM = Object.freeze({
  city_hub: 120,
  natural_feature: 120,
});
const SMALL_SETTLEMENT_TYPES = new Set(['neighborhood', 'sublocality', 'sublocality_level_1']);
const GEOGRAPHIC_TYPES = new Set([
  'locality', 'postal_town', 'neighborhood', 'sublocality', 'sublocality_level_1',
  'administrative_area_level_1', 'administrative_area_level_2',
  'administrative_area_level_3', 'administrative_area_level_4',
  'colloquial_area', 'natural_feature', 'island',
  'archipelago', 'national_park', 'park',
]);
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
  { id: 'in-hampi', countryCode: 'IN', names: { he: 'האמפי', en: 'Hampi' }, aliases: ['Hampi', 'Hampi Group of Monuments'], kind: 'tourism_region', groupingPolicy: 'self', center: { lat: 15.3350132, lng: 76.460024 }, radiusKm: 20 },
  { id: 'at-vienna', countryCode: 'AT', names: { he: 'וינה', en: 'Vienna' }, aliases: ['Vienna', 'Wien'], kind: 'city_hub', groupingPolicy: 'self', center: { lat: 48.2082, lng: 16.3738 }, radiusKm: 35, providerIdentity: { reviewedOverride: true, allowExactProviderMatch: false } },
  { id: 'ba-sarajevo', countryCode: 'BA', names: { he: 'סרייבו', en: 'Sarajevo' }, aliases: ['Sarajevo'], kind: 'city_hub', groupingPolicy: 'self', center: { lat: 43.8563, lng: 18.4131 }, radiusKm: 30, providerIdentity: { reviewedOverride: true, allowExactProviderMatch: false } },
  { id: 'it-milan', countryCode: 'IT', names: { he: 'מילאנו', en: 'Milan' }, aliases: ['Milan', 'Milano'], kind: 'city_hub', groupingPolicy: 'self', center: { lat: 45.4642, lng: 9.19 }, radiusKm: 35, providerIdentity: { reviewedOverride: true, allowExactProviderMatch: false } },
  { id: 'ie-west-of-ireland', countryCode: 'IE', names: { he: 'מערב אירלנד', en: 'West of Ireland' }, aliases: ['West of Ireland', 'Wild Atlantic Way'], kind: 'tourism_region', groupingPolicy: 'self', center: { lat: 53.2, lng: -9.0 }, radiusKm: 220, providerIdentity: { reviewedOverride: true, allowExactProviderMatch: false } },
  { id: 'al-vlore', countryCode: 'AL', names: { he: 'ולורה', en: 'Vlorë' }, aliases: ['Vlorë', 'Vlore', 'Vlora'], kind: 'city_hub', groupingPolicy: 'self', center: { lat: 40.4660668, lng: 19.491356 }, viewport: { southwest: { lat: 40.4103918276953, lng: 19.45301060857941 }, northeast: { lat: 40.491234240659715, lng: 19.510002135866756 } }, radiusKm: 18, providerRefs: { googlePlaceId: 'ChIJlRjM6PEzRRMRhg4-8ZoJMQ0' }, googleTypes: ['locality', 'political'], providerIdentity: { reviewedOverride: true } },
  { id: 'ni-ometepe', countryCode: 'NI', names: { he: 'אומטפה', en: 'Ometepe' }, aliases: ['Ometepe', 'Isla de Ometepe', 'Moyogalpa', 'Altagracia', 'Tilgue'], kind: 'island', groupingPolicy: 'self', center: { lat: 11.514, lng: -85.583 }, radiusKm: 35 },
  { id: 'gr-corfu', countryCode: 'GR', names: { he: 'קורפו', en: 'Corfu' }, aliases: ['Corfu', 'Kerkyra', 'Perama'], kind: 'island', groupingPolicy: 'self', center: { lat: 39.6243, lng: 19.9217 }, radiusKm: 42 },
  { id: 'it-dolomites', countryCode: 'IT', names: { he: 'הדולומיטים', en: 'Dolomites' }, aliases: ['Dolomites'], kind: 'tourism_region', groupingPolicy: 'self', center: { lat: 46.54, lng: 11.84 }, radiusKm: 65 },
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

function legacyRegistryId(countryCode, countryId, cityId) {
  const prefix = String(countryCode || countryId || '').trim().toLowerCase();
  const digest = crypto.createHash('sha256')
    .update(`${countryId}\n${cityId}`)
    .digest('hex')
    .slice(0, 16);
  return `${prefix}-legacy-${digest}`;
}

function viewportDiagonalKm(viewport) {
  const southwest = viewport?.southwest;
  const northeast = viewport?.northeast;
  const coordinates = [southwest?.lat, southwest?.lng, northeast?.lat, northeast?.lng]
    .map(Number);
  if (!coordinates.every(Number.isFinite)) return null;
  return distanceKm(
    { lat: coordinates[0], lng: coordinates[1] },
    { lat: coordinates[2], lng: coordinates[3] }
  );
}

function stripAdministrativeIdentityLabel(value) {
  return compactDestinationSearchText(value)
    .replace(/^(federalterritoryof|specialadministrativeregionof|autonomousregionof|stateof|provinceof|regionof)/, '')
    .replace(/(federalterritory|specialadministrativeregion|autonomousregion|municipality|prefecture|province|district|region)$/, '');
}

function providerIdentityNameMatches(entry, providerDisplayName = entry?.providerDisplayName) {
  const providerName = compactDestinationSearchText(providerDisplayName);
  if (!providerName) return false;
  const providerAdministrativeName = stripAdministrativeIdentityLabel(providerDisplayName);
  return normalizedAliases(entry).some((alias) => alias === providerName ||
    stripAdministrativeIdentityLabel(alias) === providerAdministrativeName);
}

function providerIdentityPolicy(kind, googleTypes = [], {
  reviewedOverride = false,
  administrativeNameMatch = false,
} = {}) {
  const types = new Set(Array.isArray(googleTypes) ? googleTypes : []);
  if (!types.size) return {
    compatible: reviewedOverride,
    source: reviewedOverride ? 'reviewed_provider_identity' : 'provider_types_missing',
  };
  if (reviewedOverride) return { compatible: true, source: 'reviewed_provider_identity' };
  const hasGeographicType = [...types].some((type) => GEOGRAPHIC_TYPES.has(type));
  let compatible = false;
  if (kind === 'city_hub') {
    compatible = ['locality', 'postal_town', 'neighborhood', 'sublocality',
      'sublocality_level_1', 'administrative_area_level_3']
      .some((type) => types.has(type));
    if (!compatible && administrativeNameMatch && types.has('political') &&
        !types.has('point_of_interest') && !types.has('establishment')) {
      compatible = ['country', 'administrative_area_level_1', 'administrative_area_level_2']
        .some((type) => types.has(type));
    }
  } else if (kind === 'province') {
    compatible = ['administrative_area_level_1', 'administrative_area_level_2']
      .some((type) => types.has(type));
  } else if (kind === 'island') {
    compatible = types.has('island') || types.has('archipelago') || types.has('country') ||
      types.has('natural_feature') || hasGeographicType;
  } else if (kind === 'natural_feature') {
    compatible = ['natural_feature', 'national_park', 'park']
      .some((type) => types.has(type));
  } else if (kind === 'tourism_region') {
    compatible = hasGeographicType || reviewedOverride;
  }
  return {
    compatible,
    source: compatible
      ? reviewedOverride && !hasGeographicType
        ? 'reviewed_provider_identity'
        : administrativeNameMatch && kind === 'city_hub' &&
          ['country', 'administrative_area_level_1', 'administrative_area_level_2']
            .some((type) => types.has(type))
          ? 'matching_administrative_provider_identity'
          : 'geographic_provider_identity'
      : 'incompatible_provider_identity',
  };
}

function providerGeometryPolicy(kind, viewport, options = {}) {
  const diagonalKm = viewportDiagonalKm(viewport);
  const hasCenter = Number.isFinite(Number(options?.center?.lat)) &&
    Number.isFinite(Number(options?.center?.lng));
  const hasRadius = Number.isFinite(Number(options?.radiusKm)) && Number(options.radiusKm) > 0;
  const autoMatchEligible = Boolean(kind !== 'natural_feature' && DESTINATION_KINDS.includes(kind) &&
    (diagonalKm !== null || (hasCenter && hasRadius)));
  return {
    autoMatchEligible,
    aliasAutoMatchEligible: autoMatchEligible,
    source: autoMatchEligible ? 'provider_geometry_available' : 'provider_geometry_missing',
    version: MATCH_PROFILE_VERSION,
  };
}

function normalizeArea(area) {
  if (area?.type === 'circle') {
    const lat = Number(area.center?.lat);
    const lng = Number(area.center?.lng);
    const radiusKm = Number(area.radiusKm);
    if ([lat, lng, radiusKm].every(Number.isFinite) && radiusKm > 0) {
      return { type: 'circle', center: { lat, lng }, radiusKm };
    }
  }
  if (area?.type === 'viewport') {
    const southwest = area.viewport?.southwest;
    const northeast = area.viewport?.northeast;
    if ([southwest?.lat, southwest?.lng, northeast?.lat, northeast?.lng]
      .map(Number).every(Number.isFinite)) {
      return { type: 'viewport', viewport: area.viewport };
    }
  }
  return null;
}

function derivedRadiusKm(entry) {
  const types = new Set(Array.isArray(entry?.googleTypes) ? entry.googleTypes : []);
  if (entry?.kind === 'city_hub' && [...types].some((type) => SMALL_SETTLEMENT_TYPES.has(type))) {
    return 15;
  }
  return DEFAULT_MATCH_RADIUS_KM[entry?.kind] || 35;
}

function destinationTypeForKind(kind) {
  return {
    city_hub: 'city',
    island: 'island',
    natural_feature: 'natural_feature',
    tourism_region: 'region',
    province: 'region',
  }[kind] || null;
}

function buildMatchProfile(entry, { radiusCapKm = Infinity } = {}) {
  const hasProviderIdentity = Boolean((Array.isArray(entry?.googleTypes) && entry.googleTypes.length) ||
    entry?.providerRefs?.googlePlaceId ||
    (Array.isArray(entry?.providerRefs?.googlePlaceIds) && entry.providerRefs.googlePlaceIds.length));
  const reviewedOverride = entry?.providerIdentity?.reviewedOverride === true;
  const identity = hasProviderIdentity
    ? providerIdentityPolicy(entry?.kind, entry?.googleTypes, {
        reviewedOverride,
        administrativeNameMatch: providerIdentityNameMatches(entry),
      })
    : { compatible: true, source: 'planli_defined_identity' };
  const explicitAreas = (Array.isArray(entry?.matchProfile?.areas) ? entry.matchProfile.areas : [])
    .map(normalizeArea).filter(Boolean);
  const legacyReviewed = Number.isFinite(Number(entry?.radiusKm)) && Number(entry.radiusKm) > 0;
  const center = Number.isFinite(Number(entry?.center?.lat)) && Number.isFinite(Number(entry?.center?.lng))
    ? { lat: Number(entry.center.lat), lng: Number(entry.center.lng) }
    : null;
  const areas = explicitAreas.slice();
  if (!areas.length && entry?.viewport) {
    const diagonal = viewportDiagonalKm(entry.viewport);
    const maximumViewportKm = MAX_PROVIDER_VIEWPORT_DIAGONAL_KM[entry?.kind] || 2500;
    if (diagonal !== null && diagonal <= maximumViewportKm) {
      areas.push({ type: 'viewport', viewport: entry.viewport });
    }
  }
  if (!areas.some((area) => area.type === 'circle') && center) {
    const requestedRadius = legacyReviewed ? Number(entry.radiusKm) : derivedRadiusKm(entry);
    const cappedRadius = legacyReviewed ? requestedRadius : Math.min(requestedRadius, radiusCapKm);
    if (Number.isFinite(cappedRadius) && cappedRadius > 0) {
      areas.push({ type: 'circle', center, radiusKm: Math.max(3, cappedRadius) });
    }
  }
  const explicitlyBlocked = entry?.geometryPolicy?.autoMatchEligible === false;
  const exactOnlyNaturalFeature = entry?.kind === 'natural_feature';
  const trusted = identity.compatible && areas.length > 0 && !explicitlyBlocked && !exactOnlyNaturalFeature;
  return {
    version: MATCH_PROFILE_VERSION,
    trust: trusted ? 'trusted' : 'blocked',
    source: entry?.matchProfile?.source || (legacyReviewed ? 'planli_reviewed_circle' : 'provider_derived'),
    identitySource: identity.source,
    identityReviewed: reviewedOverride,
    areas,
    aliasMaxDistanceKm: Number(entry?.matchProfile?.aliasMaxDistanceKm ||
      Math.max(15, ...areas.filter((area) => area.type === 'circle').map((area) => area.radiusKm), 0)),
  };
}

function normalizeEntry(entry) {
  const countryCode = String(entry?.countryCode || '').trim().toUpperCase();
  const reviewedLegacyGeometry = Number.isFinite(Number(entry?.radiusKm)) &&
    Number(entry.radiusKm) > 0;
  const normalized = {
    ...entry,
    countryCode,
    aliasesNormalized: normalizedAliases(entry),
    status: entry?.status || 'active',
    registryVersion: Number(entry?.registryVersion || REGISTRY_VERSION),
    geometryPolicy: entry?.geometryPolicy || (reviewedLegacyGeometry ? {
      autoMatchEligible: true,
      aliasAutoMatchEligible: true,
      source: 'planli_reviewed_legacy',
      version: MATCH_PROFILE_VERSION,
    } : providerGeometryPolicy(entry?.kind, entry?.viewport, entry)),
  };
  return { ...normalized, matchProfile: buildMatchProfile(normalized) };
}

function validateRegistryEntry(entry, {
  requireProviderIdentity = true,
  requireResearchSources = true,
} = {}) {
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
  if (requireProviderIdentity && normalized.matchProfile.identitySource === 'incompatible_provider_identity') {
    errors.push('incompatible_google_place_type');
  }
  if (requireProviderIdentity && normalized.providerRefs?.googlePlaceId &&
      normalized.matchProfile.identitySource === 'provider_types_missing') {
    errors.push('missing_google_place_types');
  }
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
  if (requireResearchSources && normalized.approval?.approvedByAdmin !== true &&
      new Set(sources.map((source) => source?.url).filter(Boolean)).size < 2) {
    errors.push('insufficient_research_sources');
  }
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
  const normalized = entry?.matchProfile ? entry : normalizeEntry(entry);
  if (normalized.matchProfile?.trust !== 'trusted') return false;
  return normalized.matchProfile.areas.some((area) => area.type === 'viewport'
    ? pointInsideViewport(coordinates, area.viewport)
    : distanceKm(area.center, coordinates) <= Number(area.radiusKm));
}

function prepareEntries(entries) {
  const normalized = entries.map(normalizeEntry);
  return normalized.map((entry) => {
    const explicitOrReviewed = Array.isArray(entry?.matchProfile?.areas) &&
      (entry.matchProfile.source === 'planli_reviewed_circle' ||
        entry.matchProfile.source === 'planli_reviewed');
    if (explicitOrReviewed || !entry.center) return entry;
    const nearest = normalized.filter((candidate) => candidate.id !== entry.id &&
      candidate.countryCode === entry.countryCode && candidate.center &&
      candidate.parentId !== entry.id && entry.parentId !== candidate.id)
      .map((candidate) => distanceKm(entry.center, candidate.center))
      .filter((value) => Number.isFinite(value) && value > 0)
      .sort((left, right) => left - right)[0];
    const radiusCapKm = Number.isFinite(nearest) ? nearest * 0.45 : Infinity;
    return {
      ...entry,
      matchProfile: buildMatchProfile({ ...entry, matchProfile: null }, { radiusCapKm }),
    };
  });
}

function entryMatchRadiusKm(entry) {
  const areas = entry?.matchProfile?.areas || [];
  const radii = areas.map((area) => area.type === 'circle'
    ? Number(area.radiusKm)
    : viewportDiagonalKm(area.viewport) / 2).filter(Number.isFinite);
  return Math.max(3, ...radii, 3);
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

function matchCanonicalEntry(entries, {
  countryCode,
  providerPlaceId,
  aliases = [],
  coordinates,
  excludedKinds = [],
  allowBlockedExactKinds = [],
  exactOnlyKinds = [],
}) {
  const code = String(countryCode || '').toUpperCase();
  const excluded = new Set(excludedKinds);
  const blockedExact = new Set(allowBlockedExactKinds);
  const exactOnly = new Set(exactOnlyKinds);
  const activeEntries = prepareEntries(entries)
    .filter((entry) => entry.status === 'active' && entry.countryCode === code &&
      !excluded.has(entry.kind));
  const candidates = activeEntries.filter((entry) => entry.matchProfile?.trust === 'trusted' &&
    !exactOnly.has(entry.kind));
  if (providerPlaceId) {
    const exactCandidates = activeEntries.filter((entry) =>
      entry.matchProfile?.trust === 'trusted' ||
      (blockedExact.has(entry.kind) &&
        !['incompatible_provider_identity', 'provider_types_missing']
          .includes(entry.matchProfile?.identitySource))
    );
    const exact = exactCandidates.find((entry) =>
      entry.providerIdentity?.allowExactProviderMatch !== false &&
      (entry.providerRefs?.googlePlaceId === providerPlaceId ||
        (entry.providerRefs?.googlePlaceIds || []).includes(providerPlaceId)));
    if (exact) return {
      entry: groupedEntryFor(exact, [...candidates, exact]),
      source: 'canonical_google_place_id',
    };
  }
  const aliasKeys = new Set(aliases.map(compactDestinationSearchText).filter(Boolean));
  const rawContaining = candidates.filter((entry) => coordinates && entryContainsPoint(entry, coordinates));
  const rawContainingIds = new Set(rawContaining.map((entry) => entry.id));
  const rawAliasMatches = candidates.filter((entry) => {
    if (!entry.aliasesNormalized.some((alias) => aliasKeys.has(alias))) return false;
    if (!coordinates || !entry.center || !rawContainingIds.has(entry.id)) return false;
    return distanceKm(entry.center, coordinates) <= Number(entry.matchProfile.aliasMaxDistanceKm || Infinity);
  });
  const aliasMatches = uniqueGroupedEntries(rawAliasMatches, candidates);
  const containing = uniqueGroupedEntries(rawContaining, candidates);
  if (aliasMatches.length === 1) {
    return {
      entry: aliasMatches[0],
      source: 'canonical_alias_and_geometry',
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
    const leftDistance = left.center ? distanceKm(left.center, coordinates) / entryMatchRadiusKm(left) : 0;
    const rightDistance = right.center ? distanceKm(right.center, coordinates) / entryMatchRadiusKm(right) : 0;
    return leftDistance - rightDistance || left.id.localeCompare(right.id);
  });
  if (sorted.length > 1) {
    const firstDistance = sorted[0].center
      ? distanceKm(sorted[0].center, coordinates) / entryMatchRadiusKm(sorted[0]) : 0;
    const secondDistance = sorted[1].center
      ? distanceKm(sorted[1].center, coordinates) / entryMatchRadiusKm(sorted[1]) : 0;
    if ((firstDistance === 0 && secondDistance === 0) ||
        firstDistance > secondDistance * 0.75) {
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
  persisted.forEach((entry) => {
    const reviewed = merged.get(entry.id);
    merged.set(entry.id, reviewed ? normalizeEntry({
      ...entry,
      names: reviewed.names,
      aliases: Array.from(new Set([...(entry.aliases || []), ...(reviewed.aliases || [])])),
      kind: reviewed.kind,
      parentId: reviewed.parentId || null,
      groupingPolicy: reviewed.groupingPolicy,
      center: reviewed.center,
      ...(reviewed.viewport ? { viewport: reviewed.viewport } : {}),
      ...(reviewed.radiusKm ? { radiusKm: reviewed.radiusKm } : {}),
      providerIdentity: {
        ...(entry.providerIdentity || {}),
        ...(reviewed.providerIdentity || {}),
      },
      geometryPolicy: {
        autoMatchEligible: true,
        aliasAutoMatchEligible: true,
        source: 'planli_reviewed',
        version: MATCH_PROFILE_VERSION,
      },
    }) : entry);
  });
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
  MATCH_PROFILE_VERSION,
  buildMatchProfile,
  canonicalDestinationId,
  legacyRegistryId,
  clearRegistryCache,
  destinationTypeForKind,
  entryContainsPoint,
  matchCanonicalEntry,
  normalizeEntry,
  providerIdentityNameMatches,
  providerIdentityPolicy,
  prepareEntries,
  providerGeometryPolicy,
  registryCollectionIssues,
  registryEntriesForCountry,
  validateRegistryEntry,
  viewportDiagonalKm,
};
