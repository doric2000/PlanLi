/* eslint-disable no-console */
const admin = require('firebase-admin');

const { initializeAdmin } = require('./localCredentials');
const {
  BUILTIN_POLICIES,
  REGISTRY_PATH,
  REGISTRY_VERSION,
  matchCanonicalEntry,
  normalizeEntry,
  registryCollectionIssues,
} = require('../canonicalDestinationRegistry');

const DEFAULT_PROJECT_ID = 'planli-f0b12';
const KNOWN_SUSPECT_NAMES = new Set([
  'kannan devan hills', 'rivas', 'perama', 'rinas', 'humantay lake', 'nam hoa lu',
]);

function parseArguments(argv) {
  const projectIndex = argv.indexOf('--project');
  return {
    projectId: projectIndex >= 0 ? String(argv[projectIndex + 1] || '').trim() : DEFAULT_PROJECT_ID,
    apply: argv.includes('--apply'),
  };
}

function coordinatesFor(destination) {
  return destination?.googleCache?.coordinates || destination?.identity?.coordinates || destination?.coordinates || null;
}

function namesFor(destination) {
  return Array.from(new Set([
    destination?.googleCache?.names?.he,
    destination?.googleCache?.names?.en,
    destination?.identity?.names?.he,
    destination?.identity?.names?.en,
    ...(destination?.canonicalPolicy?.aliases || []),
  ].filter(Boolean)));
}

function auditDestination({ countryId, cityId, countryCode, destination, registryEntries, contentCoordinates = [] }) {
  const matchInputs = [
    ...contentCoordinates.map((coordinates) => ({ coordinates, providerPlaceId: null })),
    { coordinates: coordinatesFor(destination), providerPlaceId: destination?.providerRefs?.googlePlaceId },
  ];
  const match = matchInputs.map((input) => matchCanonicalEntry(registryEntries, {
    countryCode,
    providerPlaceId: input.providerPlaceId,
    aliases: namesFor(destination),
    coordinates: input.coordinates,
  })).find((candidate) => candidate?.entry || candidate?.ambiguity) || null;
  const englishName = String(destination?.googleCache?.names?.en || destination?.identity?.names?.en || '').toLowerCase();
  const currentRegistryId = destination?.canonicalPolicy?.registryId || null;
  const suggestedRegistryId = match?.entry?.id || null;
  const destinationStatus = String(destination?.status || 'active');
  const mergedInto = destination?.mergedInto || null;
  return {
    countryId,
    cityId,
    nameHe: destination?.googleCache?.names?.he || destination?.identity?.names?.he || null,
    nameEn: destination?.googleCache?.names?.en || destination?.identity?.names?.en || null,
    recommendationCount: Math.max(0, Number(destination?.stats?.recommendationCount || 0)),
    approved: destination?.canonicalPolicy?.approved === true,
    currentRegistryId,
    suggestedRegistryId,
    suggestedNameHe: match?.entry?.names?.he || null,
    destinationStatus,
    mergedInto,
    status: destinationStatus !== 'active'
      ? mergedInto?.countryId && mergedInto?.cityId ? 'merged_source' : 'inactive_review'
      : match?.ambiguity?.length
      ? 'ambiguous'
      : currentRegistryId && currentRegistryId === suggestedRegistryId
        ? 'canonical'
        : suggestedRegistryId ? 'reassignment_candidate' : 'manual_review',
    knownSuspect: KNOWN_SUSPECT_NAMES.has(englishName),
  };
}

async function run({ projectId = DEFAULT_PROJECT_ID, apply = false, adminImpl = admin } = {}) {
  if (apply) throw new Error('This audit is read-only. Use the admin impact preview and reassignment workflow to write.');
  if (projectId !== DEFAULT_PROJECT_ID) throw new Error(`Expected project ${DEFAULT_PROJECT_ID}.`);
  initializeAdmin(adminImpl);
  const db = adminImpl.firestore();
  const [destinations, registry, countries, recommendations] = await Promise.all([
    db.collectionGroup('destinations').get(),
    db.collection(REGISTRY_PATH).get(),
    db.collection('countries').get(),
    db.collection('recommendations').get(),
  ]);
  const countryCodes = new Map(countries.docs.map((document) => [
    document.id, String(document.data()?.code || document.id).toUpperCase(),
  ]));
  const registryById = new Map(registry.docs.map((document) => [
    document.id,
    normalizeEntry({ id: document.id, ...document.data() }),
  ]));
  BUILTIN_POLICIES.forEach((reviewed) => {
    const current = registryById.get(reviewed.id) || {};
    registryById.set(reviewed.id, normalizeEntry({
      ...current,
      ...reviewed,
      aliases: Array.from(new Set([...(current.aliases || []), ...(reviewed.aliases || [])])),
      providerIdentity: {
        ...(current.providerIdentity || {}),
        ...(reviewed.providerIdentity || {}),
        reviewedOverride: true,
      },
      matchProfile: {
        version: REGISTRY_VERSION,
        source: 'planli_reviewed',
        identityReviewed: true,
        areas: reviewed.radiusKm
          ? [{ type: 'circle', center: reviewed.center, radiusKm: reviewed.radiusKm }]
          : [],
        aliasMaxDistanceKm: reviewed.radiusKm || 35,
      },
    }));
  });
  const registryEntries = Array.from(registryById.values());
  const registryIssues = registryCollectionIssues(registryEntries);
  const contentCoordinates = new Map();
  recommendations.docs.forEach((document) => {
    const data = document.data() || {};
    const key = `${data.destination?.countryId}:${data.destination?.cityId}`;
    const coordinates = data.place?.coordinates || data.mapLocation || null;
    if (!coordinates || !data.destination?.countryId || !data.destination?.cityId) return;
    contentCoordinates.set(key, [...(contentCoordinates.get(key) || []), coordinates]);
  });
  const items = destinations.docs.map((document) => {
    const segments = document.ref.path.split('/');
    const countryId = segments[1];
    return auditDestination({
      countryId,
      cityId: document.id,
      countryCode: countryCodes.get(countryId) || countryId,
      destination: document.data() || {},
      registryEntries,
      contentCoordinates: contentCoordinates.get(`${countryId}:${document.id}`) || [],
    });
  });
  const result = {
    mode: 'dry-run',
    registry: {
      count: registryEntries.length,
      trustedMatchProfiles: registryEntries.filter((entry) => entry.matchProfile?.trust === 'trusted').length,
      blockedMatchProfiles: registryEntries.filter((entry) => entry.matchProfile?.trust !== 'trusted').length,
      blockedMatchProfileEntries: registryEntries.filter((entry) => entry.matchProfile?.trust !== 'trusted')
        .map((entry) => entry.id),
      incompatibleProviderIdentities: registryEntries.filter((entry) =>
        entry.matchProfile?.identitySource === 'incompatible_provider_identity'
      ).map((entry) => entry.id),
      quarantinedProviderIdentities: registryEntries.filter((entry) =>
        entry.providerIdentity?.allowExactProviderMatch === false
      ).map((entry) => entry.id),
      issues: registryIssues,
    },
    destinationCount: items.length,
    activeDestinationCount: items.filter((item) => item.destinationStatus === 'active').length,
    counts: Object.fromEntries(['canonical', 'reassignment_candidate', 'manual_review', 'ambiguous', 'merged_source', 'inactive_review']
      .map((status) => [status, items.filter((item) => item.status === status).length])),
    items: items.sort((left, right) => Number(right.knownSuspect) - Number(left.knownSuspect) ||
      right.recommendationCount - left.recommendationCount || left.cityId.localeCompare(right.cityId)),
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

if (require.main === module) {
  run(parseArguments(process.argv.slice(2))).catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  });
}

module.exports = { auditDestination, parseArguments, run };
