const test = require('node:test');
const assert = require('node:assert/strict');

const {
  VERIFIED_IL_LOCALITY_POLICY_ID,
  VERIFIED_PROVIDER_DESTINATION_POLICY_ID,
  buildVerifiedProviderDestinationApproval,
  buildVerifiedIlLocalityApproval,
  canUpgradeVerifiedProviderRegistryEntry,
  canUpgradeVerifiedProviderDestination,
  canUpgradeVerifiedIlLocality,
  destinationUsesVerifiedProviderDestinationPolicy,
  destinationUsesVerifiedIlLocalityPolicy,
  verifiedProviderRegistryEntryMatches,
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

test('verified provider destinations are approved in every country and supported destination kind', () => {
  const fixtures = [
    locality({ countryCode: 'AL', names: { he: 'טירנה', en: 'Tirana' } }),
    locality({
      id: 'pe-humantay', countryCode: 'PE', names: { he: 'אגם הומאנטאי', en: 'Humantay Lake' },
      kind: 'natural_feature', googleTypes: ['natural_feature'],
    }),
    locality({
      id: 'gr-corfu', countryCode: 'GR', names: { he: 'קורפו', en: 'Corfu' },
      kind: 'island', googleTypes: ['island', 'natural_feature'],
    }),
    locality({
      id: 'th-chiang-mai', countryCode: 'TH', names: { he: 'צ׳יאנג מאי', en: 'Chiang Mai' },
      kind: 'province', googleTypes: ['administrative_area_level_1', 'political'],
    }),
    locality({
      id: 'ie-wild-atlantic-way', countryCode: 'IE',
      names: { he: 'דרך האטלנטית הפראית', en: 'Wild Atlantic Way' },
      kind: 'tourism_region', googleTypes: ['colloquial_area', 'political'],
    }),
  ];

  fixtures.forEach((entry) => {
    const approval = buildVerifiedProviderDestinationApproval({
      entry,
      countryId: entry.countryCode,
      destinationPath: `countries/${entry.countryCode}/destinations/${entry.id}`,
      approvalRevision: 1,
      registryVersion: 3,
    });
    assert.ok(approval, `${entry.kind} should be eligible`);
    assert.equal(approval.registryEntry.approval.policyId, VERIFIED_PROVIDER_DESTINATION_POLICY_ID);
    assert.equal(approval.canonicalPolicy.registryAttestation.countryCode, entry.countryCode);
    assert.equal(approval.canonicalPolicy.kind, entry.kind);
    assert.equal(validateRegistryEntry(approval.registryEntry).valid, true);
  });
});

test('invalid provisional IDs are replaced with a country-scoped verified registry ID', () => {
  const approval = buildVerifiedProviderDestinationApproval({
    entry: locality({
      id: 'al-provisional-invalid_id',
      countryCode: 'AL',
      names: { he: 'טירנה', en: 'Tirana' },
    }),
    countryId: 'AL',
    destinationPath: 'countries/AL/destinations/tirana',
  });
  assert.match(approval.registryEntry.id, /^al-verified-[0-9a-f]{20}$/u);
  assert.equal(approval.canonicalPolicy.provisionalRegistryId, 'al-provisional-invalid_id');
});

test('provider policy keeps ambiguous, mismatched, or incomplete identities out of auto-approval', () => {
  const input = (entry) => buildVerifiedProviderDestinationApproval({
    entry,
    countryId: entry.countryCode || 'AL',
    destinationPath: 'countries/AL/destinations/candidate',
  });
  assert.equal(input(locality({ countryCode: 'AL', providerRefs: {} })), null);
  assert.equal(input(locality({
    countryCode: 'AL', kind: 'natural_feature', googleTypes: ['locality'],
  })), null);
  assert.equal(input(locality({ countryCode: 'AL', groupingPolicy: 'parent', parentId: 'al-parent' })), null);
  assert.equal(input(locality({ countryCode: 'AL', names: { he: 'Tirana', en: 'Tirana' } })), null);
});

test('foreign provisional destinations upgrade only through exact country, registry, and Place identity', () => {
  const approval = buildVerifiedProviderDestinationApproval({
    entry: locality({ countryCode: 'AL', names: { he: 'טירנה', en: 'Tirana' } }),
    countryId: 'AL',
    destinationPath: 'countries/AL/destinations/tirana',
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

  assert.equal(canUpgradeVerifiedProviderDestination(current, resolved, 'AL'), true);
  assert.equal(canUpgradeVerifiedProviderDestination(current, resolved, 'IL'), false);
  assert.equal(destinationUsesVerifiedProviderDestinationPolicy(resolved), true);
  assert.equal(verifiedProviderRegistryEntryMatches(
    approval.registryEntry,
    approval.registryEntry
  ), true);
});

test('legacy seeded destinations and registry entries upgrade only with the exact provider identity', () => {
  const entry = locality({
    id: 'lk-ella',
    countryCode: 'LK',
    names: { he: 'אלה', en: 'Ella' },
    providerRefs: { googlePlaceId: 'ella-place' },
  });
  const approval = buildVerifiedProviderDestinationApproval({
    entry,
    countryId: 'LK',
    destinationPath: 'countries/LK/destinations/ella',
    approvalRevision: 1,
    registryVersion: 3,
  });
  const currentDestination = {
    status: 'active',
    providerRefs: { googlePlaceId: 'ella-place' },
    canonicalPolicy: {
      approved: true,
      registryId: 'lk-ella',
      kind: 'city_hub',
      groupingPolicy: 'self',
      registryVersion: 3,
    },
  };
  const resolvedDestination = {
    status: 'active',
    providerRefs: { googlePlaceId: 'ella-place' },
    canonicalPolicy: approval.canonicalPolicy,
  };
  const currentRegistry = {
    ...entry,
    status: 'active',
  };

  assert.equal(canUpgradeVerifiedProviderDestination(
    currentDestination, resolvedDestination, 'LK'
  ), true);
  assert.equal(canUpgradeVerifiedProviderRegistryEntry(
    currentRegistry, approval.registryEntry
  ), true);
  assert.equal(canUpgradeVerifiedProviderRegistryEntry({
    ...currentRegistry,
    providerRefs: { googlePlaceId: 'another-place' },
  }, approval.registryEntry), false);
  assert.equal(canUpgradeVerifiedProviderRegistryEntry({
    ...currentRegistry,
    approval: { approvedByAdmin: true },
  }, approval.registryEntry), false);
});
