/* eslint-disable no-await-in-loop, no-console */
const admin = require('firebase-admin');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { distanceKm } = require('../destinationIdentityService');
const { fetchWithGoogleMapsOAuth } = require('../placesProviderAdapter');

const { initializeAdmin } = require('./localCredentials');
const { CANDIDATES, REGIONAL_COUNTS } = require('../data/canonicalDestinationCandidates');
const {
  BUILTIN_POLICIES,
  REGISTRY_PATH,
  REGISTRY_VERSION,
  buildMatchProfile,
  providerGeometryPolicy,
  providerIdentityNameMatches,
  providerIdentityPolicy,
  registryCollectionIssues,
  validateRegistryEntry,
} = require('../canonicalDestinationRegistry');

const DEFAULT_PROJECT_ID = 'planli-f0b12';
const SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';
const SEARCH_FIELDS = [
  'places.id', 'places.displayName', 'places.formattedAddress', 'places.location',
  'places.viewport', 'places.types', 'places.addressComponents',
].join(',');
const REVIEWED_PROVIDER_IDENTITY_IDS = new Set([
  'it-amalfi-coast',
  'gr-meteora',
  'is-south-iceland',
  'no-norwegian-fjords',
]);

// Google Text Search has a small set of stable tourism destinations whose
// obvious query is either ambiguous (island vs. city) or has no country
// component (cross-border natural regions). These reviewed overrides select a
// specific provider identity; they never accept an arbitrary first result.
const ENRICHMENT_OVERRIDES = Object.freeze({
  'at-vienna': { includedType: 'locality' },
  'ba-sarajevo': { includedType: 'locality' },
  'it-milan': { includedType: 'locality' },
  'jp-tokyo': { includedType: 'locality' },
  'vn-da-nang': { includedType: 'locality' },
  'vn-ho-chi-minh-city': { includedType: 'locality' },
  'al-vlore': { includedType: 'locality', expectedPlaceId: 'ChIJlRjM6PEzRRMRhg4-8ZoJMQ0' },
  'es-ibiza': { expectedPlaceId: 'ChIJQzkJhWNHmRIR1iaEzSVHBgk' },
  'it-amalfi-coast': { expectedPlaceId: 'ChIJoXFMw62VOxMR3ExPyRTP6Ew', allowPoiIdentity: true },
  'no-norwegian-fjords': { allowPoiIdentity: true },
  'gr-lefkada': { expectedPlaceId: 'ChIJR8EI2hS0XRMRxkD45hmYnpQ' },
  'ch-zurich': { query: 'Zürich, Switzerland', expectedPlaceId: 'ChIJGaK-SZcLkEcRA9wf5_GNbuY' },
  'si-lake-bled': { expectedPlaceId: 'ChIJIeTZuTmRekcRrAcB3TGDzYM' },
  'mt-malta': { query: 'Malta country', expectedPlaceId: 'ChIJxUeGHShFDhMROUK-NmHYgvU' },
  'id-java': { query: 'Java Island, Indonesia', expectedPlaceId: 'ChIJNzIy0n6gei4RYO2r1lkc_oY' },
  'in-parvati-valley': { expectedPlaceId: 'ChIJ2dW19rpGBDkRE3LFCA5XJxk' },
  'in-leh-and-ladakh': { query: 'Ladakh, India', expectedPlaceId: 'ChIJOXF947yG_TgRx4rS2g-ZwsY' },
  'np-everest-region': { query: 'Sagarmatha National Park, Nepal', expectedPlaceId: 'ChIJW_9Y6LlU6DkRvkeHfWBmlKc' },
  'kr-busan': { expectedPlaceId: 'ChIJNc0j6G3raDURpwhxJHTL2DU' },
  'mx-isla-mujeres': { expectedPlaceId: 'ChIJaWJUx1wlTI8Rv72Dh9MpwzE' },
  'cr-manuel-antonio': { query: 'Manuel Antonio National Park Costa Rica', expectedPlaceId: 'ChIJS_Wpm5xxoY8Rhkpczjlh5pU' },
  'pa-panama-city': { query: 'Panama City, Panama', expectedPlaceId: 'ChIJYwPo2_GorI8RDsFC8PFdoqs' },
  'pa-boquete': { query: 'Bajo Boquete, Panama', expectedPlaceId: 'ChIJWYPOC9_spY8RdI653z0wmMA' },
  'pe-lima': { expectedPlaceId: 'ChIJxz7uGfbFBZERSi5FzLlsIBQ' },
  'pe-lake-titicaca-peru': {
    query: 'Lake Titicaca', expectedPlaceId: 'ChIJdXyv9iKbXZER3HHf1CQnaA8', allowCountryless: true,
  },
  'ar-salta-and-jujuy': {
    expectedPlaceId: 'ChIJx9DqOCkNG5QRmHnD9tEbSos',
    additionalPlaceIds: ['ChIJhwBc5_ahBJQReU7OMLKRXoE'],
    center: { lat: -24.3, lng: -65.4 },
    radiusKm: 230,
  },
  'ar-argentine-patagonia': {
    query: 'Argentine Patagonia', expectedPlaceId: 'ChIJswo0Eqyt770RGONnA4g9gPU', allowCountryless: true,
  },
});

function parseArguments(argv) {
  const valueFor = (flag) => {
    const index = argv.indexOf(flag);
    return index >= 0 ? String(argv[index + 1] || '').trim() : '';
  };
  return {
    apply: argv.includes('--apply'),
    enrich: argv.includes('--enrich'),
    projectId: valueFor('--project') || DEFAULT_PROJECT_ID,
    offset: Number(valueFor('--offset') || 0),
    limit: Number(valueFor('--limit') || CANDIDATES.length),
    checkpoint: valueFor('--checkpoint'),
  };
}

function countryCodeFor(place) {
  const component = (place?.addressComponents || []).find((entry) =>
    (entry.types || []).includes('country')
  );
  return String(component?.shortText || '').toUpperCase();
}

function normalizedCoordinates(value) {
  const latitude = value?.lat ?? value?.latitude;
  const longitude = value?.lng ?? value?.longitude;
  if (latitude == null || longitude == null) return null;
  const lat = Number(latitude);
  const lng = Number(longitude);
  return Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lng) && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

function normalizedViewport(value) {
  const southwest = normalizedCoordinates(value?.southwest || value?.low);
  const northeast = normalizedCoordinates(value?.northeast || value?.high);
  return southwest && northeast ? { southwest, northeast } : null;
}

function mergePolicy(candidate) {
  const builtIn = BUILTIN_POLICIES.find((entry) => entry.id === candidate.id);
  return builtIn ? {
    ...candidate,
    aliases: Array.from(new Set([...(candidate.aliases || []), ...(builtIn.aliases || [])])),
    kind: builtIn.kind,
    parentId: builtIn.parentId || null,
    groupingPolicy: builtIn.groupingPolicy,
    ...(builtIn.center ? { center: builtIn.center } : {}),
    ...(builtIn.viewport ? { viewport: builtIn.viewport } : {}),
    ...(builtIn.radiusKm ? { radiusKm: builtIn.radiusKm } : {}),
    geometryPolicy: builtIn.geometryPolicy || {
      autoMatchEligible: true,
      aliasAutoMatchEligible: true,
      source: 'planli_reviewed',
      version: REGISTRY_VERSION,
    },
    ...(builtIn.providerIdentity ? { providerIdentity: builtIn.providerIdentity } : {}),
    ...(builtIn.membership ? { membership: builtIn.membership } : {}),
    matchProfile: buildMatchProfile({
      ...candidate,
      ...builtIn,
      matchProfile: {
        version: REGISTRY_VERSION,
        source: 'planli_reviewed',
        identityReviewed: true,
        areas: builtIn.radiusKm
          ? [{ type: 'circle', center: builtIn.center, radiusKm: builtIn.radiusKm }]
          : [],
      },
    }),
  } : candidate;
}

async function enrichCandidate(candidate, {
  accessTokenProvider,
  projectId = DEFAULT_PROJECT_ID,
  fetchImpl = global.fetch,
}) {
  const override = ENRICHMENT_OVERRIDES[candidate.id] || {};
  if (candidate.geometryPolicy?.source === 'identity_requires_review') {
    return { ...candidate, enrichmentIssue: 'review_required_provider_identity' };
  }
  const response = await fetchWithGoogleMapsOAuth(SEARCH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-FieldMask': SEARCH_FIELDS,
    },
    body: JSON.stringify({
      textQuery: override.query || candidate.providerQuery,
      languageCode: 'en',
      ...(override.includedType ? {
        includedType: override.includedType,
        strictTypeFiltering: true,
      } : {}),
    }),
  }, { fetchImpl, accessTokenProvider, projectId });
  if (!response.ok) throw new Error(`Google search failed (${response.status}) for ${candidate.id}.`);
  const body = await response.json();
  const providerResults = body.places || [];
  const matches = providerResults.filter((place) => countryCodeFor(place) === candidate.countryCode &&
    providerIdentityNameMatches(candidate, place.displayName?.text) &&
    (!candidate.research?.sourceVerified || (normalizedCoordinates(place.location) &&
      distanceKm(candidate.center, normalizedCoordinates(place.location)) <= (candidate.kind === 'city_hub' ? 15 : 50))) &&
    providerIdentityPolicy(candidate.kind, place.types, {
      reviewedOverride: override.allowPoiIdentity === true ||
        REVIEWED_PROVIDER_IDENTITY_IDS.has(candidate.id),
      administrativeNameMatch: providerIdentityNameMatches(candidate, place.displayName?.text),
    }).compatible);
  const selected = override.expectedPlaceId
    ? providerResults.find((place) => place.id === override.expectedPlaceId)
    : matches.length === 1 ? matches[0] : null;
  const selectedCountry = selected ? countryCodeFor(selected) : '';
  const selectedIdentity = selected ? providerIdentityPolicy(candidate.kind, selected.types, {
    reviewedOverride: override.allowPoiIdentity === true ||
      REVIEWED_PROVIDER_IDENTITY_IDS.has(candidate.id),
    administrativeNameMatch: providerIdentityNameMatches(candidate, selected.displayName?.text),
  }) : null;
  const selectedAllowed = selected && selectedIdentity?.compatible && (
    selectedCountry === candidate.countryCode || (override.allowCountryless && !selectedCountry)
  );
  if (!selectedAllowed) {
    return {
      ...candidate,
      enrichmentIssue: matches.length ? 'ambiguous_google_match' : 'missing_google_match',
      enrichmentMatches: providerResults.slice(0, 5).map((place) => ({
        placeId: place.id,
        name: place.displayName?.text || null,
        address: place.formattedAddress || null,
        types: place.types || [],
      })),
    };
  }
  const place = selected;
  const enriched = {
    ...candidate,
    providerRefs: {
      googlePlaceId: place.id,
      ...(override.additionalPlaceIds ? { googlePlaceIds: override.additionalPlaceIds } : {}),
    },
    providerDisplayName: place.displayName?.text || null,
    providerAddress: place.formattedAddress || null,
    center: normalizedCoordinates(override.center || candidate.center || place.location),
    viewport: candidate.viewport || normalizedViewport(place.viewport),
    ...(override.radiusKm || candidate.radiusKm
      ? { radiusKm: Number(override.radiusKm || candidate.radiusKm) }
      : {}),
    geometryPolicy: candidate.geometryPolicy || providerGeometryPolicy(
      candidate.kind,
      candidate.viewport || normalizedViewport(place.viewport),
      {
        center: normalizedCoordinates(override.center || candidate.center || place.location),
        radiusKm: Number(override.radiusKm || candidate.radiusKm) || null,
      }
    ),
    providerIdentity: {
      compatible: true,
      source: selectedIdentity.source,
      reviewedOverride: override.allowPoiIdentity === true ||
        REVIEWED_PROVIDER_IDENTITY_IDS.has(candidate.id),
    },
    googleTypes: place.types || [],
    ...(candidate.research ? { research: { ...candidate.research, providerVerified: true } } : {}),
    registryVersion: REGISTRY_VERSION,
    status: 'active',
  };
  return { ...enriched, matchProfile: buildMatchProfile(enriched) };
}

function auditEntries(entries, { requireProviderIdentity, expectedCount = CANDIDATES.length,
  parentEntries = entries } = {}) {
  const validations = entries.map((entry) => ({
    id: entry.id,
    ...validateRegistryEntry(entry, { requireProviderIdentity }),
  }));
  const ids = entries.map((entry) => entry.id);
  const placeIds = entries.map((entry) => entry.providerRefs?.googlePlaceId).filter(Boolean);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  const duplicatePlaceIds = placeIds.filter((id, index) => placeIds.indexOf(id) !== index);
  const invalid = validations.filter((validation) => !validation.valid);
  const collectionIssues = registryCollectionIssues(parentEntries).filter((issue) =>
    ids.includes(issue.id) && (issue.code !== 'unresolved_overlap' || requireProviderIdentity));
  return {
    valid: entries.length === expectedCount && !invalid.length &&
      !duplicateIds.length && !duplicatePlaceIds.length && !collectionIssues.length,
    count: entries.length,
    regionalCounts: REGIONAL_COUNTS,
    invalid: invalid.map((item) => ({ id: item.id, errors: item.errors })),
    duplicateIds: Array.from(new Set(duplicateIds)),
    duplicateGooglePlaceIds: Array.from(new Set(duplicatePlaceIds)),
    collectionIssues,
  };
}

async function commitRegistry(db, entries, adminImpl) {
  const result = { created: 0, preserved: 0, identityConflicts: [] };
  for (const entry of entries) {
    const outcome = await db.runTransaction(async (transaction) => {
      const ref = db.doc(`${REGISTRY_PATH}/${entry.id}`);
      const existing = await transaction.get(ref);
      // Import is create-only. Administrator decisions, destination paths and
      // stable identities are never overwritten by a rerun or a partial import.
      if (existing.exists) {
        return existing.data().providerRefs?.googlePlaceId === entry.providerRefs.googlePlaceId
          ? 'preserved' : 'conflict';
      }
      const providerIds = [...new Set([entry.providerRefs.googlePlaceId,
        ...(entry.providerRefs.googlePlaceIds || [])].filter(Boolean))];
      for (const providerId of providerIds) {
        const matches = await Promise.all([
          transaction.get(db.collection(REGISTRY_PATH)
            .where('providerRefs.googlePlaceId', '==', providerId).limit(1)),
          transaction.get(db.collection(REGISTRY_PATH)
            .where('providerRefs.googlePlaceIds', 'array-contains', providerId).limit(1)),
        ]);
        if (matches.some((snapshot) => !snapshot.empty)) return 'preserved';
      }
      const { id, providerQuery, researchRegion, enrichmentIssue, enrichmentMatches, ...data } = entry;
      transaction.create(ref, {
        ...data,
        registryVersion: REGISTRY_VERSION,
        updatedAt: adminImpl.firestore.FieldValue.serverTimestamp(),
      });
      return 'created';
    });
    if (outcome === 'conflict') result.identityConflicts.push(entry.id);
    else result[outcome] += 1;
  }
  await db.doc('system/destinationRegistry').set({
    version: REGISTRY_VERSION,
    // A partial import must not replace the total inventory with its batch size.
    lastImport: result,
    updatedAt: adminImpl.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  return result;
}

async function run({
  apply = false,
  enrich = false,
  projectId = DEFAULT_PROJECT_ID,
  adminImpl = admin,
  fetchImpl = global.fetch,
  accessTokenProvider,
  offset = 0,
  limit = CANDIDATES.length,
  checkpoint = '',
} = {}) {
  if (apply && !enrich) throw new Error('--apply requires --enrich; unresolved candidates are never written.');
  if (!/^[a-z0-9-]+$/.test(projectId)) throw new Error('Project ID is invalid.');
  if (projectId !== DEFAULT_PROJECT_ID) throw new Error(`Expected project ${DEFAULT_PROJECT_ID}.`);
  if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 ||
      offset >= CANDIDATES.length || limit > CANDIDATES.length) throw new Error('Invalid batch range.');
  if (apply && !checkpoint) throw new Error('--apply requires an explicit --checkpoint directory.');
  const candidates = CANDIDATES.map(mergePolicy);
  let entries = candidates;
  const localAudit = auditEntries(entries, { requireProviderIdentity: false });
  const result = { mode: apply ? 'apply' : enrich ? 'enriched-dry-run' : 'local-dry-run', localAudit };
  if (!enrich) {
    console.log(JSON.stringify(result, null, 2));
    return result;
  }
  const enriched = [];
  if (checkpoint) fs.mkdirSync(checkpoint, { recursive: true });
  for (const candidate of candidates.slice(offset, offset + limit)) {
    const digest = crypto.createHash('sha256').update(JSON.stringify({ candidate, projectId, version: 4 })).digest('hex');
    const file = checkpoint ? path.join(checkpoint, `${candidate.id}.json`) : null;
    let cached;
    if (file && fs.existsSync(file)) cached = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (cached?.digest === digest && Date.now() - cached.fetchedAt < 24 * 60 * 60 * 1000 && !cached.entry?.enrichmentIssue) {
      enriched.push(cached.entry);
      continue;
    }
    const entry = await enrichCandidate(candidate, { accessTokenProvider, projectId, fetchImpl });
    enriched.push(entry);
    if (file) fs.writeFileSync(file, JSON.stringify({ digest, fetchedAt: Date.now(), entry }));
  }
  entries = enriched;
  const parentEntries = candidates.map((candidate) => entries.find((entry) => entry.id === candidate.id) || candidate);
  result.materializedAudit = auditEntries(entries, { requireProviderIdentity: true,
    expectedCount: Math.min(limit, candidates.length - offset), parentEntries });
  result.enrichmentIssues = entries.filter((entry) => entry.enrichmentIssue).map((entry) => ({
    id: entry.id,
    query: entry.providerQuery,
    issue: entry.enrichmentIssue,
    matches: entry.enrichmentMatches || [],
  }));
  if (!result.materializedAudit.valid) {
    console.log(JSON.stringify(result, null, 2));
    if (apply) throw new Error('Registry validation failed; no writes were made.');
    return result;
  }
  if (apply) {
    initializeAdmin(adminImpl);
    result.import = await commitRegistry(adminImpl.firestore(), entries, adminImpl);
  }
  console.log(JSON.stringify(result, null, 2));
  return result;
}

if (require.main === module) {
  run(parseArguments(process.argv.slice(2))).catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  });
}

module.exports = {
  auditEntries,
  commitRegistry,
  countryCodeFor,
  ENRICHMENT_OVERRIDES,
  enrichCandidate,
  mergePolicy,
  normalizedCoordinates,
  normalizedViewport,
  parseArguments,
  run,
};
