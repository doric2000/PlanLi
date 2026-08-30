/* eslint-disable no-console */
const crypto = require('crypto');
const admin = require('firebase-admin');
const { isDeepStrictEqual } = require('node:util');

const { initializeAdmin } = require('./localCredentials');
const {
  BUILTIN_POLICIES,
  REGISTRY_PATH,
  REGISTRY_VERSION,
  buildMatchProfile,
  prepareEntries,
  providerGeometryPolicy,
  providerIdentityNameMatches,
  providerIdentityPolicy,
} = require('../canonicalDestinationRegistry');

const DEFAULT_PROJECT_ID = 'planli-f0b12';
const REVIEWED_PROVIDER_IDENTITY_IDS = new Set([
  'it-amalfi-coast',
  'gr-meteora',
  'is-south-iceland',
  'no-norwegian-fjords',
]);

function parseArguments(argv) {
  const projectIndex = argv.indexOf('--project');
  return {
    projectId: projectIndex >= 0 ? String(argv[projectIndex + 1] || '').trim() : DEFAULT_PROJECT_ID,
    apply: argv.includes('--apply'),
  };
}

function legacyRegistryId(countryCode, countryId, cityId) {
  const digest = crypto.createHash('sha256')
    .update(`${countryId}\n${cityId}`)
    .digest('base64url')
    .slice(0, 16)
    .toLowerCase();
  return `${String(countryCode || countryId).toLowerCase()}-legacy-${digest}`;
}

function legacyPolicy({ countryCode, countryId, cityId, destination }) {
  const destinationType = String(destination?.destinationType || 'city');
  const kind = destinationType === 'island' ? 'island'
    : destinationType === 'region' ? 'tourism_region' : 'city_hub';
  return {
    approved: false,
    provisional: true,
    reviewState: 'pending',
    selectionSource: 'legacy_migration',
    registryId: legacyRegistryId(countryCode, countryId, cityId),
    kind,
    parentId: null,
    groupingPolicy: 'self',
    aliases: [],
    registryVersion: 0,
  };
}

function registryGeometryPatch(id, entry = {}) {
  const reviewed = BUILTIN_POLICIES.find((entry) => entry.id === id);
  const materialized = reviewed ? {
    ...entry,
    ...reviewed,
    aliases: Array.from(new Set([...(entry.aliases || []), ...(reviewed.aliases || [])])),
  } : entry;
  const identity = providerIdentityPolicy(materialized.kind, materialized.googleTypes, {
    reviewedOverride: reviewed != null || materialized.providerIdentity?.reviewedOverride === true ||
      REVIEWED_PROVIDER_IDENTITY_IDS.has(id),
    administrativeNameMatch: providerIdentityNameMatches(materialized),
  });
  const matchProfile = buildMatchProfile({
    ...materialized,
    ...(reviewed ? {
      matchProfile: {
        version: REGISTRY_VERSION,
        source: 'planli_reviewed',
        identityReviewed: true,
        areas: reviewed.radiusKm
          ? [{ type: 'circle', center: reviewed.center, radiusKm: reviewed.radiusKm }]
          : [],
      },
    } : {}),
  });
  return reviewed ? {
    center: reviewed.center,
    ...(reviewed.viewport ? { viewport: reviewed.viewport } : {}),
    ...(reviewed.radiusKm ? { radiusKm: reviewed.radiusKm } : {}),
    geometryPolicy: {
      autoMatchEligible: true,
      aliasAutoMatchEligible: true,
      source: 'planli_reviewed',
      version: REGISTRY_VERSION,
    },
    matchProfile,
    providerIdentity: {
      ...(entry.providerIdentity || {}),
      compatible: true,
      source: identity.source,
      reviewedOverride: true,
      ...(reviewed.providerIdentity?.allowExactProviderMatch === false
        ? { allowExactProviderMatch: false }
        : {}),
    },
    registryVersion: REGISTRY_VERSION,
  } : {
    geometryPolicy: providerGeometryPolicy(entry.kind, entry.viewport, entry),
    matchProfile,
    providerIdentity: {
      ...(entry.providerIdentity || {}),
      compatible: identity.compatible,
      source: identity.source,
      reviewedOverride: entry.providerIdentity?.reviewedOverride === true ||
        REVIEWED_PROVIDER_IDENTITY_IDS.has(id),
    },
    registryVersion: REGISTRY_VERSION,
  };
}

async function commitBatches(db, operations) {
  for (let index = 0; index < operations.length; index += 400) {
    const batch = db.batch();
    operations.slice(index, index + 400).forEach(({ ref, data }) => batch.set(ref, data, { merge: true }));
    await batch.commit();
  }
}

function registryPatchChanged(current = {}, patch = {}) {
  return !isDeepStrictEqual(current.geometryPolicy || null, patch.geometryPolicy || null) ||
    !isDeepStrictEqual(current.matchProfile || null, patch.matchProfile || null) ||
    !isDeepStrictEqual(current.providerIdentity || null, patch.providerIdentity || null) ||
    Number(current.registryVersion || 0) !== REGISTRY_VERSION;
}

async function run({ projectId = DEFAULT_PROJECT_ID, apply = false, adminImpl = admin } = {}) {
  if (projectId !== DEFAULT_PROJECT_ID) throw new Error(`Expected project ${DEFAULT_PROJECT_ID}.`);
  initializeAdmin(adminImpl);
  const db = adminImpl.firestore();
  const [registryMetadataSnapshot, registrySnapshot, destinationSnapshot, countrySnapshot] = await Promise.all([
    db.doc('system/destinationRegistry').get(),
    db.collection(REGISTRY_PATH).get(),
    db.collectionGroup('destinations').get(),
    db.collection('countries').get(),
  ]);
  const countryCodes = new Map(countrySnapshot.docs.map((document) => [
    document.id, String(document.data()?.code || document.id).toUpperCase(),
  ]));
  const operations = [];
  const compiledProfiles = new Map(prepareEntries(registrySnapshot.docs.map((document) => {
    const current = document.data() || {};
    const patch = registryGeometryPatch(document.id, current);
    return { id: document.id, ...current, ...patch };
  })).map((entry) => [entry.id, entry.matchProfile]));
  const registryItems = registrySnapshot.docs.map((document) => {
    const current = document.data() || {};
    const patch = {
      ...registryGeometryPatch(document.id, current),
      matchProfile: compiledProfiles.get(document.id),
    };
    const changed = registryPatchChanged(current, patch);
    if (changed) operations.push({ ref: document.ref, data: {
      ...patch,
      updatedAt: adminImpl.firestore.FieldValue.serverTimestamp(),
    } });
    return {
      id: document.id,
      changed,
      trusted: patch.matchProfile.trust === 'trusted',
      identityCompatible: patch.providerIdentity.compatible,
      kind: current.kind || null,
      googleTypes: current.googleTypes || [],
      providerDisplayName: current.providerDisplayName || null,
      exactProviderMatchAllowed: patch.providerIdentity.allowExactProviderMatch !== false,
      beforeAutomatic: current.geometryPolicy?.autoMatchEligible === true,
      beforeManualOrPro: current.geometryPolicy?.autoMatchEligible === false,
    };
  });
  const legacyItems = destinationSnapshot.docs.map((document) => {
    const segments = document.ref.path.split('/');
    const countryId = segments[1];
    const destination = document.data() || {};
    const eligible = destination.status === 'active' && !destination.canonicalPolicy;
    if (eligible) operations.push({ ref: document.ref, data: {
      canonicalPolicy: legacyPolicy({
        countryCode: countryCodes.get(countryId), countryId, cityId: document.id, destination,
      }),
      updatedAt: adminImpl.firestore.FieldValue.serverTimestamp(),
    } });
    return { countryId, cityId: document.id, eligible };
  });
  const registryMetadata = registryMetadataSnapshot.data() || {};
  const registryMetadataChanged = Number(registryMetadata.version || 0) !== REGISTRY_VERSION ||
    Number(registryMetadata.entryCount || 0) !== registryItems.length;
  if (registryMetadataChanged) operations.push({
    ref: registryMetadataSnapshot.ref || db.doc('system/destinationRegistry'),
    data: {
      version: REGISTRY_VERSION,
      entryCount: registryItems.length,
      updatedAt: adminImpl.firestore.FieldValue.serverTimestamp(),
    },
  });
  if (apply && operations.length) await commitBatches(db, operations);
  const result = {
    mode: apply ? 'apply' : 'dry-run',
    registryCount: registryItems.length,
    registryPatches: registryItems.filter((item) => item.changed).length,
    registryMetadataPatch: registryMetadataChanged ? 1 : 0,
    automaticGeometry: registryItems.filter((item) => item.trusted).length,
    manualOrProGeometry: registryItems.filter((item) => !item.trusted).length,
    incompatibleProviderIdentities: registryItems.filter((item) => !item.identityCompatible).length,
    quarantinedProviderIdentities: registryItems.filter((item) => !item.exactProviderMatchAllowed).length,
    blockedMatchProfileEntries: registryItems.filter((item) => !item.trusted)
      .map((item) => item.id),
    incompatibleProviderIdentityEntries: registryItems.filter((item) => !item.identityCompatible)
      .map((item) => ({
        id: item.id,
        kind: item.kind,
        providerDisplayName: item.providerDisplayName,
        googleTypes: item.googleTypes,
      })),
    quarantinedProviderIdentityEntries: registryItems.filter((item) => !item.exactProviderMatchAllowed)
      .map((item) => item.id),
    legacyDestinationPatches: legacyItems.filter((item) => item.eligible).length,
    totalWrites: operations.length,
    before: {
      automaticGeometry: registryItems.filter((item) => item.beforeAutomatic).length,
      manualOrProGeometry: registryItems.filter((item) => item.beforeManualOrPro).length,
      unclassifiedGeometry: registryItems.filter((item) =>
        !item.beforeAutomatic && !item.beforeManualOrPro
      ).length,
      activeLegacyWithoutPolicy: legacyItems.filter((item) => item.eligible).length,
    },
    after: {
      automaticGeometry: registryItems.filter((item) => item.trusted).length,
      manualOrProGeometry: registryItems.filter((item) => !item.trusted).length,
      unclassifiedGeometry: 0,
      incompatibleProviderIdentities: registryItems.filter((item) => !item.identityCompatible).length,
      activeLegacyWithoutPolicy: 0,
    },
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

module.exports = {
  legacyPolicy,
  legacyRegistryId,
  parseArguments,
  registryGeometryPatch,
  registryPatchChanged,
  run,
};
