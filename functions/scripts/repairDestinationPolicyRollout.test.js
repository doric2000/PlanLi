const test = require('node:test');
const assert = require('node:assert/strict');

const {
  assertApplyAllowed,
  buildRolloutPlan,
  manifestFingerprint,
  parseOptions,
  reassignmentRef,
} = require('./repairDestinationPolicyRollout');
const { matchCanonicalEntry } = require('../canonicalDestinationRegistry');

function snapshot(path, data, version = 1) {
  return {
    id: path.split('/').at(-1),
    exists: data != null,
    ref: { path },
    data: () => data,
    updateTime: { toMillis: () => version },
  };
}

function locality(countryId, placeId, names, coordinates) {
  return {
    countryId,
    status: 'active',
    destinationType: 'city',
    providerRefs: { googlePlaceId: placeId },
    googleCache: {
      placeId,
      countryCode: countryId,
      names,
      nameSources: { he: 'google', en: 'google' },
      coordinates,
      types: ['locality', 'political'],
      expiresAt: new Date('2030-01-01T00:00:00Z'),
    },
    canonicalPolicy: {
      approved: false,
      provisional: true,
      registryId: `${countryId.toLowerCase()}-provisional-${placeId.toLowerCase()}`,
      kind: 'city_hub',
      groupingPolicy: 'self',
    },
    stats: { recommendationCount: 0 },
  };
}

test('production rollout manifest includes global provider approvals, Rotem reassignment, holds, and status repair', () => {
  const kfar = snapshot(
    'countries/IL/destinations/kfar-tavor',
    locality('IL', 'kfar-tavor-place', { he: 'כפר תבור', en: 'Kfar Tavor' }, { lat: 32.686, lng: 35.421 }),
    10
  );
  const rotem = snapshot(
    'countries/PS/destinations/rotem-ps',
    locality('PS', 'rotem-place', { he: 'רותם', en: 'Rotem' }, { lat: 32.3375655, lng: 35.5180307 }),
    11
  );
  const nazca = snapshot('countries/PE/destinations/nazca', {
    ...locality('PE', 'nazca-place', { he: 'נסקה', en: 'Nazca' }, { lat: -14.739, lng: -75.13 }),
    canonicalPolicy: {
      approved: true,
      registryId: 'pe-nazca',
      kind: 'city_hub',
      groupingPolicy: 'self',
      registryVersion: 3,
      approvalRevision: 1,
      registryAttestation: {
        approved: true, registryId: 'pe-nazca', registryVersion: 3,
        approvalRevision: 1, countryId: 'PE',
      },
    },
  }, 12);
  const invalidApproved = snapshot('countries/FR/destinations/invalid-approved', {
    ...locality('FR', 'invalid-approved-place',
      { he: 'יעד לא מאומת', en: 'Invalid Approved Destination' },
      { lat: 48.8566, lng: 2.3522 }),
    canonicalPolicy: {
      approved: true,
      registryId: 'fr-invalid-approved',
      kind: 'city_hub',
      groupingPolicy: 'self',
      registryVersion: 3,
      approvalRevision: 1,
    },
  }, 13);
  const nazcaReviewPath = 'system/moderation/destinationReviews/nazca-review';
  const invalidApprovedRegistryPath =
    'system/destinationRegistry/entries/fr-invalid-approved';
  const invalidApprovedRegistry = snapshot(invalidApprovedRegistryPath, {
    id: 'fr-invalid-approved',
    countryCode: 'FR',
    names: { he: 'יעד לא מאומת', en: 'Invalid Approved Destination' },
    aliases: ['יעד לא מאומת', 'Invalid Approved Destination'],
    kind: 'city_hub',
    groupingPolicy: 'self',
    center: { lat: 48.8566, lng: 2.3522 },
    radiusKm: 20,
    providerRefs: { googlePlaceId: 'invalid-approved-place' },
    googleTypes: ['locality', 'political'],
    registryVersion: 3,
    status: 'active',
    geometryPolicy: {
      autoMatchEligible: false,
      aliasAutoMatchEligible: false,
      source: 'admin_exact_only',
      version: 3,
    },
    approval: {
      approvedByAdmin: true,
      approvedBy: 'admin-uid',
      approvedAt: new Date('2026-08-31T10:00:00Z'),
    },
  }, 21);
  const state = {
    countries: [
      { id: 'IL', data: { code: 'IL', status: 'active' } },
      { id: 'PS', data: { code: 'PS', status: 'active' } },
      { id: 'PE', data: { code: 'PE', status: 'active' } },
      { id: 'FR', data: { code: 'FR', status: 'active' } },
    ],
    destinations: [kfar, rotem, nazca, invalidApproved],
    reviews: new Map([[nazcaReviewPath, snapshot(nazcaReviewPath, { status: 'open' }, 20)]]),
    jobs: new Map(),
    registries: new Map([[invalidApprovedRegistryPath, invalidApprovedRegistry]]),
    claims: new Map(),
    content: [
      snapshot('recommendations/nazca-rec', {
        status: 'moderation_hold',
        destination: { countryId: 'PE', cityId: 'nazca' },
        moderation: {
          holdReason: 'destination_policy_review',
          systemGate: 'destination_pending_approval',
          destination: { countryId: 'PE', cityId: 'nazca' },
        },
      }, 30),
      snapshot('recommendations/rotem-rec', {
        status: 'moderation_hold',
        destination: { countryId: 'PS', cityId: 'rotem-ps' },
        moderation: {
          holdReason: 'destination_pending_approval',
          systemGate: 'destination_pending_approval',
          destination: { countryId: 'PS', cityId: 'rotem-ps' },
        },
      }, 31),
      snapshot('recommendations/invalid-approved-rec', {
        status: 'moderation_hold',
        destination: { countryId: 'FR', cityId: 'invalid-approved' },
        moderation: {
          holdReason: 'destination_pending_approval',
          systemGate: 'destination_pending_approval',
          destination: { countryId: 'FR', cityId: 'invalid-approved' },
        },
      }, 32),
    ],
  };

  const { manifest, provisionalPlans } = buildRolloutPlan(state);
  assert.equal(manifest.blockers.length, 0);
  assert.equal(manifest.provisionalUpgrades.length, 3);
  assert.equal(manifest.provisionalUpgrades.filter((entry) => entry.crossCountry).length, 1);
  assert.deepEqual(manifest.holds.map((entry) => entry.path), [
    'recommendations/invalid-approved-rec',
    'recommendations/nazca-rec',
    'recommendations/rotem-rec',
  ]);
  assert.ok(manifest.reviewRepairs.some((entry) =>
    entry.destinationPath === 'countries/FR/destinations/invalid-approved' &&
    ['approved', 'approved_with_warnings'].includes(entry.desiredStatus)
  ));
  assert.ok(manifest.reviewRepairs.some((entry) =>
    entry.destinationPath === 'countries/PE/destinations/nazca' &&
    ['approved', 'approved_with_warnings'].includes(entry.desiredStatus)
  ));
  const repairedAdminPlan = provisionalPlans.find((entry) =>
    entry.source.path === 'countries/FR/destinations/invalid-approved'
  );
  assert.equal(repairedAdminPlan.registryData.approval.approvedByAdmin, true);
  assert.equal(repairedAdminPlan.targetData.canonicalPolicy.registryAttestation.approvalMode, 'admin');
  assert.equal(matchCanonicalEntry([repairedAdminPlan.registryData], {
    countryCode: 'FR', providerPlaceId: 'invalid-approved-place',
  })?.entry?.id, 'fr-invalid-approved');
  assert.match(manifestFingerprint(manifest), /^[0-9a-f]{64}$/u);
});

test('rollout apply requires the exact live fingerprint, project, and active-admin identity input', () => {
  const options = parseOptions(['--reason', 'policy repair']);
  assert.equal(options.apply, false);
  const manifest = { blockers: [], provisionalUpgrades: [], holds: [], reviewRepairs: [] };
  const fingerprint = manifestFingerprint(manifest);
  assert.doesNotThrow(() => assertApplyAllowed({
    ...options,
    apply: true,
    confirmProject: 'planli-f0b12',
    fingerprint,
    requestedBy: 'admin-uid',
  }, manifest, fingerprint));
  assert.throws(() => assertApplyAllowed({
    ...options,
    apply: true,
    confirmProject: 'planli-f0b12',
    fingerprint: '0'.repeat(64),
    requestedBy: 'admin-uid',
  }, manifest, fingerprint), /fingerprint/u);
});

test('rollout reassignment preview uses the same normalized identity as the worker', () => {
  assert.deepEqual(reassignmentRef({
    countryId: ' PS ',
    cityId: 'rotem-ps',
    path: 'countries/PS/destinations/rotem-ps',
  }), {
    countryId: 'PS',
    cityId: 'rotem-ps',
  });
});
