const test = require('node:test');
const assert = require('node:assert/strict');

const {
  VERIFIED_IL_LOCALITY_POLICY_ID,
  buildVerifiedIlLocalityApproval,
  canUpgradeVerifiedIlLocality,
  destinationUsesVerifiedIlLocalityPolicy,
  verifiedIlRegistryEntryMatches,
} = require('./destinationApprovalPolicy');
const { matchCanonicalEntry, validateRegistryEntry } = require('./canonicalDestinationRegistry');

function locality(overrides = {}) {
  return {
    id: 'il-provisional-kfar-tavor',
    countryCode: 'IL',
    names: { he: 'כפר תבור', en: 'Kfar Tavor' },
    aliases: ['כפר תבור', 'Kfar Tavor'],
    kind: 'city_hub',
    groupingPolicy: 'self',
    center: { lat: 32.686, lng: 35.421 },
    radiusKm: 12,
    providerRefs: { googlePlaceId: 'kfar-tavor-place' },
    googleTypes: ['locality', 'political'],
    ...overrides,
  };
}

test('verified Israeli localities receive a non-admin exact-only registry attestation', () => {
  const approval = buildVerifiedIlLocalityApproval({
    entry: locality(),
    countryId: 'ישראל',
    destinationPath: 'countries/ישראל/destinations/kfar-tavor',
    approvalRevision: 2,
    registryVersion: 3,
    now: new Date('2026-09-01T10:00:00Z'),
  });

  assert.ok(approval);
  assert.equal(approval.registryEntry.approval.approvedByAdmin, false);
  assert.equal(approval.registryEntry.approval.policyId, VERIFIED_IL_LOCALITY_POLICY_ID);
  assert.equal(approval.registryEntry.geometryPolicy.autoMatchEligible, false);
  assert.equal(approval.canonicalPolicy.registryAttestation.approvalMode, 'policy');
  assert.equal(destinationUsesVerifiedIlLocalityPolicy({
    canonicalPolicy: approval.canonicalPolicy,
  }), true);
  assert.equal(validateRegistryEntry(approval.registryEntry).valid, true);
});

test('natural, foreign, ambiguous, or incomplete places are not auto-approved', () => {
  assert.equal(buildVerifiedIlLocalityApproval({
    entry: locality({ kind: 'natural_feature', googleTypes: ['natural_feature'] }),
    countryId: 'IL', destinationPath: 'countries/IL/destinations/nature',
  }), null);
  assert.equal(buildVerifiedIlLocalityApproval({
    entry: locality({ countryCode: 'JO' }),
    countryId: 'JO', destinationPath: 'countries/JO/destinations/city',
  }), null);
  assert.equal(buildVerifiedIlLocalityApproval({
    entry: locality({ providerRefs: {} }),
    countryId: 'IL', destinationPath: 'countries/IL/destinations/city',
  }), null);
  assert.equal(buildVerifiedIlLocalityApproval({
    entry: locality({ names: { he: 'Kfar Tavor', en: 'Kfar Tavor' } }),
    countryId: 'IL', destinationPath: 'countries/IL/destinations/city',
  }), null);
});

test('an in-place upgrade requires the exact provisional registry and Place ID', () => {
  const approval = buildVerifiedIlLocalityApproval({
    entry: locality(),
    countryId: 'IL',
    destinationPath: 'countries/IL/destinations/kfar-tavor',
    approvalRevision: 1,
    registryVersion: 3,
  });
  const resolved = {
    status: 'active',
    providerRefs: { googlePlaceId: 'kfar-tavor-place' },
    canonicalPolicy: approval.canonicalPolicy,
  };
  const current = {
    status: 'active',
    providerRefs: { googlePlaceId: 'kfar-tavor-place' },
    canonicalPolicy: {
      approved: false,
      provisional: true,
      registryId: 'il-provisional-kfar-tavor',
    },
  };

  assert.equal(canUpgradeVerifiedIlLocality(current, resolved, 'IL'), true);
  assert.equal(canUpgradeVerifiedIlLocality({
    ...current,
    providerRefs: { googlePlaceId: 'another-place' },
  }, resolved, 'IL'), false);
  assert.equal(verifiedIlRegistryEntryMatches(
    approval.registryEntry,
    approval.registryEntry
  ), true);
});

test('policy-approved localities match only their exact Place ID, never alias or geometry', () => {
  const approval = buildVerifiedIlLocalityApproval({
    entry: locality(),
    countryId: 'IL',
    destinationPath: 'countries/IL/destinations/kfar-tavor',
    approvalRevision: 1,
    registryVersion: 3,
  });
  const exact = matchCanonicalEntry([approval.registryEntry], {
    countryCode: 'IL',
    providerPlaceId: 'kfar-tavor-place',
    aliases: [],
    coordinates: { lat: 32.686, lng: 35.421 },
  });
  assert.equal(exact?.entry?.id, approval.registryEntry.id);
  assert.equal(exact?.source, 'canonical_google_place_id');
  assert.equal(matchCanonicalEntry([approval.registryEntry], {
    countryCode: 'IL',
    aliases: ['Kfar Tavor'],
    coordinates: { lat: 32.686, lng: 35.421 },
  }), null);
});
