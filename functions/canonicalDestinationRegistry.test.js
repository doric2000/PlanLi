const test = require('node:test');
const assert = require('node:assert/strict');

const { CANDIDATES, REGIONAL_COUNTS } = require('./data/canonicalDestinationCandidates');
const {
  BUILTIN_POLICIES,
  buildMatchProfile,
  canonicalDestinationId,
  destinationTypeForKind,
  legacyRegistryId,
  matchCanonicalEntry,
  normalizeEntry,
  providerGeometryPolicy,
  providerIdentityNameMatches,
  providerIdentityPolicy,
  registryCollectionIssues,
  validateRegistryEntry,
} = require('./canonicalDestinationRegistry');

test('legacy registry IDs are deterministic and valid for hashed destination IDs', () => {
  const id = legacyRegistryId('AL', 'AL', 'dst_-oAZiNxHI7tlOOgVATG6');
  assert.equal(id, legacyRegistryId('AL', 'AL', 'dst_-oAZiNxHI7tlOOgVATG6'));
  assert.match(id, /^al-legacy-[a-f0-9]{16}$/);
  const validation = validateRegistryEntry({
    id,
    countryCode: 'AL',
    names: { he: 'שקודרה', en: 'Shkodër' },
    aliases: ['Shkodër'],
    kind: 'city_hub',
    groupingPolicy: 'self',
  }, { requireProviderIdentity: false, requireResearchSources: false });
  assert.deepEqual(validation.errors, []);
});

test('researched catalog stays within the approved size and regional allocation', () => {
  assert.equal(CANDIDATES.length, 252);
  assert.deepEqual(REGIONAL_COUNTS, {
    europe: 102, asia: 80, central_america: 30, south_america: 40,
  });
  assert.equal(new Set(CANDIDATES.map((entry) => entry.id)).size, CANDIDATES.length);
  CANDIDATES.forEach((entry) => {
    const validation = validateRegistryEntry(entry, { requireProviderIdentity: false });
    assert.deepEqual(validation.errors, [], `${entry.id}: ${validation.errors.join(', ')}`);
  });
});

test('materialized entries require provider identity and geometry', () => {
  const candidate = CANDIDATES[0];
  assert.deepEqual(validateRegistryEntry(candidate).errors.sort(), [
    'missing_geometry', 'missing_google_place_id',
  ]);
});

test('known India locality resolves to Munnar by canonical containment', () => {
  const match = matchCanonicalEntry(BUILTIN_POLICIES, {
    countryCode: 'IN',
    providerPlaceId: 'ChIJu0gDvfqaBzsRa-1qeuM3j24',
    aliases: ['Kannan Devan Hills', 'Rajamalai'],
    coordinates: { lat: 10.1430336, lng: 77.0397969 },
  });
  assert.equal(match.entry.id, 'in-munnar');
  assert.equal(match.entry.names.he, 'מונאר');
});

test('India address descriptor aliases can resolve an approved hub', () => {
  const match = matchCanonicalEntry(BUILTIN_POLICIES, {
    countryCode: 'IN', aliases: ['Munnar'], coordinates: { lat: 10.13, lng: 77.04 },
  });
  assert.equal(match.source, 'canonical_alias_and_geometry');
  assert.equal(match.entry.id, 'in-munnar');
});

test('Ojo de Agua resolves to Ometepe and not Rivas', () => {
  const match = matchCanonicalEntry(BUILTIN_POLICIES, {
    countryCode: 'NI', aliases: ['Tilgue'],
    coordinates: { lat: 11.5190588, lng: -85.5669624 },
  });
  assert.equal(match.entry.id, 'ni-ometepe');
  assert.equal(match.entry.names.he, 'אומטפה');
});

test('Vlore city wins inside its urban catchment while the Albanian Riviera remains separate', () => {
  const city = matchCanonicalEntry(BUILTIN_POLICIES, {
    countryCode: 'AL', providerPlaceId: 'ChIJlRjM6PEzRRMRhg4-8ZoJMQ0',
    aliases: ['Vlorë'], coordinates: { lat: 40.4146218, lng: 19.4811959 },
  });
  assert.equal(city.entry.id, 'al-vlore');
  assert.equal(city.entry.names.he, 'ולורה');
  assert.equal(matchCanonicalEntry(BUILTIN_POLICIES, {
    countryCode: 'AL', aliases: ['Vlore'], coordinates: { lat: 40.0724, lng: 19.7638 },
  }), null);
});

test('approved child wins over island parent while Corfu groups Perama to the island', () => {
  const paphos = matchCanonicalEntry(BUILTIN_POLICIES, {
    countryCode: 'CY', aliases: ['Paphos'], coordinates: { lat: 34.7754, lng: 32.4245 },
  });
  assert.equal(paphos.entry.id, 'cy-paphos');
  const corfu = matchCanonicalEntry(BUILTIN_POLICIES, {
    countryCode: 'GR', aliases: ['Perama'], coordinates: { lat: 39.58, lng: 19.91 },
  });
  assert.equal(corfu.entry.id, 'gr-corfu');
});

test('Chiang Mai and Chiang Rai preserve province destinations', () => {
  const mai = matchCanonicalEntry(BUILTIN_POLICIES, {
    countryCode: 'TH', aliases: ['Chiang Mai Province'], coordinates: { lat: 18.7, lng: 98.9 },
  });
  const rai = matchCanonicalEntry(BUILTIN_POLICIES, {
    countryCode: 'TH', aliases: ['Chiang Rai Province'], coordinates: { lat: 20.0, lng: 99.9 },
  });
  assert.equal(mai.entry.kind, 'province');
  assert.equal(rai.entry.kind, 'province');
  assert.notEqual(canonicalDestinationId('TH', mai.entry.id), canonicalDestinationId('TH', rai.entry.id));
});

test('a far province alias cannot override the containing province geometry', () => {
  const match = matchCanonicalEntry(BUILTIN_POLICIES, {
    countryCode: 'TH',
    aliases: ['Chiang Mai Province'],
    coordinates: { lat: 20.05, lng: 98.95 },
  });
  assert.equal(match.entry.id, 'th-chiang-rai');
  assert.equal(match.source, 'canonical_geometry');
});

test('parent grouping resolves an approved child alias to its parent', () => {
  const entries = [
    {
      id: 'zz-island', countryCode: 'ZZ', names: { he: 'אי', en: 'Island' },
      aliases: ['Island'], kind: 'island', groupingPolicy: 'self',
      center: { lat: 1, lng: 1 }, radiusKm: 50, status: 'active',
    },
    {
      id: 'zz-village', countryCode: 'ZZ', names: { he: 'כפר', en: 'Village' },
      aliases: ['Village'], kind: 'city_hub', parentId: 'zz-island', groupingPolicy: 'parent',
      center: { lat: 1, lng: 1 }, radiusKm: 5, status: 'active',
    },
  ];
  const match = matchCanonicalEntry(entries, {
    countryCode: 'ZZ', aliases: ['Village'], coordinates: { lat: 1, lng: 1 },
  });
  assert.equal(match.entry.id, 'zz-island');
});

test('registry collection validation rejects invalid graphs, duplicates and unresolved overlaps', () => {
  const base = {
    countryCode: 'ZZ', names: { he: 'יעד', en: 'Destination' }, aliases: ['Destination'],
    kind: 'city_hub', groupingPolicy: 'self', center: { lat: 1, lng: 1 }, radiusKm: 10,
    providerRefs: { googlePlaceId: 'shared-place' }, googleTypes: ['locality', 'political'], status: 'active',
  };
  const issues = registryCollectionIssues([
    { ...base, id: 'zz-first', parentId: 'zz-first' },
    { ...base, id: 'zz-second', center: { lat: 1.001, lng: 1.001 } },
    { ...base, id: 'zz-third', providerRefs: { googlePlaceId: 'third-place' }, parentId: 'missing' },
  ]);
  const codes = new Set(issues.map((issue) => issue.code));
  assert.ok(codes.has('duplicate_google_place_id'));
  assert.ok(codes.has('self_parent'));
  assert.ok(codes.has('parent_cycle'));
  assert.ok(codes.has('missing_parent'));
  assert.ok(codes.has('unresolved_overlap'));
});

test('Lake Carezza resolves to the reviewed Dolomites region', () => {
  const match = matchCanonicalEntry(BUILTIN_POLICIES, {
    countryCode: 'IT', aliases: ['Welschnofen'],
    coordinates: { lat: 46.4092273, lng: 11.5750645 },
  });
  assert.equal(match.entry.id, 'it-dolomites');
  assert.equal(match.entry.names.he, 'הדולומיטים');
});

test('a POI provider identity never auto-matches a city destination', () => {
  const match = matchCanonicalEntry([{
    id: 'zz-provider-city', countryCode: 'ZZ', names: { he: 'עיר', en: 'City' },
    aliases: ['City'], kind: 'city_hub', groupingPolicy: 'self', status: 'active',
    center: { lat: 1, lng: 1 }, radiusKm: 100,
    googleTypes: ['bar', 'point_of_interest', 'establishment'],
  }], {
    countryCode: 'ZZ', aliases: ['Unrelated locality'], coordinates: { lat: 1, lng: 1 },
  });
  assert.equal(match, null);
  assert.equal(providerIdentityPolicy('city_hub', ['bar', 'point_of_interest']).compatible, false);
  assert.equal(providerIdentityPolicy(
    'city_hub', ['administrative_area_level_1', 'political']
  ).compatible, false);
  assert.equal(providerIdentityPolicy(
    'city_hub', ['administrative_area_level_1', 'political'], { administrativeNameMatch: true }
  ).compatible, true);
  assert.equal(providerIdentityPolicy(
    'city_hub', ['administrative_area_level_1', 'political'], { reviewedOverride: true }
  ).compatible, true);
  assert.equal(providerIdentityNameMatches({
    names: { en: 'Kuala Lumpur' }, aliases: ['Kuala Lumpur'],
    providerDisplayName: 'Federal Territory of Kuala Lumpur',
  }), true);
  assert.equal(providerIdentityNameMatches({
    names: { en: 'Pai' }, aliases: ['Pai'], providerDisplayName: 'Pai District',
  }), true);
  assert.equal(providerIdentityNameMatches({
    names: { en: 'Vienna' }, aliases: ['Vienna'], providerDisplayName: 'Austria',
  }), false);
  assert.equal(providerIdentityPolicy('island', ['country', 'political']).compatible, true);
  assert.equal(providerIdentityPolicy('natural_feature', ['natural_feature']).compatible, true);
  assert.equal(providerIdentityPolicy('natural_feature', ['national_park', 'park']).compatible, true);
  assert.equal(providerIdentityPolicy('natural_feature', ['locality', 'political']).compatible, false);
  assert.equal(providerIdentityPolicy('tourism_region', ['country', 'political']).compatible, false);
});

test('canonical kinds map natural features without widening them into regions', () => {
  assert.equal(destinationTypeForKind('city_hub'), 'city');
  assert.equal(destinationTypeForKind('island'), 'island');
  assert.equal(destinationTypeForKind('natural_feature'), 'natural_feature');
  assert.equal(destinationTypeForKind('tourism_region'), 'region');
  assert.equal(destinationTypeForKind('province'), 'region');
  assert.equal(destinationTypeForKind('unknown'), null);
});

test('natural feature matching bounds provider geometry and requires explicit exact matching when blocked', () => {
  const entry = {
    id: 'pe-humantay-lake',
    countryCode: 'PE',
    names: { he: 'אגם הומאנטאי', en: 'Humantay Lake' },
    aliases: ['Humantay Lake'],
    kind: 'natural_feature',
    groupingPolicy: 'self',
    status: 'active',
    providerRefs: { googlePlaceId: 'humantay-place' },
    googleTypes: ['natural_feature'],
    center: { lat: -13.4139, lng: -72.0832 },
    viewport: {
      southwest: { lat: -18, lng: -77 },
      northeast: { lat: -8, lng: -67 },
    },
  };
  const bounded = buildMatchProfile(entry);
  assert.equal(bounded.areas.some((area) => area.type === 'viewport'), false);
  assert.equal(bounded.areas.find((area) => area.type === 'circle').radiusKm, 15);

  const blocked = normalizeEntry({
    ...entry,
    viewport: {
      southwest: { lat: -13.43, lng: -72.1 },
      northeast: { lat: -13.4, lng: -72.06 },
    },
    geometryPolicy: {
      autoMatchEligible: false,
      aliasAutoMatchEligible: true,
      source: 'admin_approved_aliases',
      version: 3,
    },
  });
  assert.equal(blocked.matchProfile.trust, 'blocked');
  const request = {
    countryCode: 'PE', providerPlaceId: 'humantay-place',
    aliases: ['Humantay Lake'], coordinates: entry.center,
  };
  assert.equal(matchCanonicalEntry([blocked], request), null);
  assert.equal(matchCanonicalEntry([blocked], {
    ...request,
    allowBlockedExactKinds: ['natural_feature'],
    exactOnlyKinds: ['natural_feature'],
  }).entry.id, entry.id);
  assert.equal(matchCanonicalEntry([blocked], {
    ...request,
    providerPlaceId: 'another-place',
    allowBlockedExactKinds: ['natural_feature'],
    exactOnlyKinds: ['natural_feature'],
  }), null);
  assert.equal(matchCanonicalEntry([blocked], {
    ...request,
    excludedKinds: ['natural_feature'],
    allowBlockedExactKinds: ['natural_feature'],
  }), null);
});

test('missing provider types are untrusted unless the identity is explicitly reviewed', () => {
  const entry = {
    id: 'zz-provider-city',
    countryCode: 'ZZ',
    names: { he: 'עיר', en: 'City' },
    aliases: ['City'],
    kind: 'city_hub',
    groupingPolicy: 'self',
    status: 'active',
    center: { lat: 1, lng: 1 },
    radiusKm: 20,
    providerRefs: { googlePlaceId: 'place-without-types' },
    approval: { approvedByAdmin: true },
  };

  assert.deepEqual(providerIdentityPolicy('city_hub', []), {
    compatible: false,
    source: 'provider_types_missing',
  });
  assert.equal(matchCanonicalEntry([entry], {
    countryCode: 'ZZ',
    providerPlaceId: 'place-without-types',
    aliases: ['City'],
    coordinates: { lat: 1, lng: 1 },
  }), null);
  assert.ok(validateRegistryEntry(entry).errors.includes('missing_google_place_types'));
  assert.equal(providerIdentityPolicy('city_hub', [], { reviewedOverride: true }).compatible, true);
});

test('an admin-approved exact-only registry entry still matches its exact Place ID', () => {
  const entry = {
    id: 'fr-paris',
    countryCode: 'FR',
    names: { he: 'פריז', en: 'Paris' },
    aliases: ['פריז', 'Paris'],
    kind: 'city_hub',
    groupingPolicy: 'self',
    status: 'active',
    center: { lat: 48.8566, lng: 2.3522 },
    radiusKm: 20,
    providerRefs: { googlePlaceId: 'paris-place' },
    googleTypes: ['locality', 'political'],
    geometryPolicy: {
      autoMatchEligible: false,
      aliasAutoMatchEligible: false,
      source: 'admin_exact_only',
      version: 3,
    },
    approval: { approvedByAdmin: true, approvedBy: 'admin-uid' },
  };

  const exact = matchCanonicalEntry([entry], {
    countryCode: 'FR', providerPlaceId: 'paris-place',
  });
  assert.equal(exact?.entry?.id, 'fr-paris');
  assert.equal(exact?.source, 'canonical_google_place_id');
  assert.equal(matchCanonicalEntry([entry], {
    countryCode: 'FR', aliases: ['Paris'], coordinates: entry.center,
  }), null);
});

test('provider viewports remain eligible at small scales except exact-only natural features', () => {
  const cityViewport = {
    southwest: { lat: 31.7, lng: 34.7 },
    northeast: { lat: 32.3, lng: 35.1 },
  };
  const tinyRegionViewport = {
    southwest: { lat: 46.539, lng: 11.839 },
    northeast: { lat: 46.541, lng: 11.841 },
  };
  assert.equal(providerGeometryPolicy('city_hub', cityViewport).autoMatchEligible, true);
  assert.equal(providerGeometryPolicy('natural_feature', tinyRegionViewport).autoMatchEligible, false);
  assert.equal(providerGeometryPolicy('tourism_region', tinyRegionViewport).autoMatchEligible, true);
});

test('an explicit geometry block is honored regardless of its historic policy version', () => {
  const profile = buildMatchProfile({
    id: 'zz-blocked-city',
    countryCode: 'ZZ',
    names: { he: 'עיר', en: 'City' },
    kind: 'city_hub',
    groupingPolicy: 'self',
    googleTypes: ['locality'],
    providerRefs: { googlePlaceId: 'blocked-city' },
    center: { lat: 1, lng: 1 },
    radiusKm: 20,
    geometryPolicy: { version: 2, autoMatchEligible: false },
  });
  assert.equal(profile.trust, 'blocked');
});

test('a provider alias cannot assign a place outside its sane viewport', () => {
  const match = matchCanonicalEntry([{
    id: 'vn-da-nang', countryCode: 'VN', names: { he: 'דה נאנג', en: 'Da Nang' },
    aliases: ['Da Nang'], kind: 'city_hub', groupingPolicy: 'self', status: 'active',
    viewport: {
      southwest: { lat: 15.9, lng: 108.0 },
      northeast: { lat: 16.2, lng: 108.35 },
    },
  }], {
    countryCode: 'VN', aliases: ['Da Nang'], coordinates: { lat: 15.89, lng: 108.36 },
  });
  assert.equal(match, null);
});

test('Hampi venues resolve to the tourism region while a distant namesake does not', () => {
  for (const coordinates of [
    { lat: 15.335133, lng: 76.458653 },
    { lat: 15.338045, lng: 76.458463 },
    { lat: 15.337016, lng: 76.458036 },
  ]) {
    const match = matchCanonicalEntry(BUILTIN_POLICIES, {
      countryCode: 'IN', aliases: ['Hampi'], coordinates,
    });
    assert.equal(match.entry.id, 'in-hampi');
  }
  assert.equal(matchCanonicalEntry(BUILTIN_POLICIES, {
    countryCode: 'IN', aliases: ['Hampi'], coordinates: { lat: 13.344878, lng: 74.79117 },
  }), null);
});

test('quarantined provider identities cannot assign their destination by Place ID', () => {
  const reviewed = {
    ...BUILTIN_POLICIES.find((entry) => entry.id === 'at-vienna'),
    providerRefs: { googlePlaceId: 'rathausplatz-event-venue' },
    googleTypes: ['event_venue', 'point_of_interest', 'establishment'],
  };
  assert.equal(matchCanonicalEntry([reviewed], {
    countryCode: 'AT', providerPlaceId: 'rathausplatz-event-venue',
    coordinates: { lat: 47.5, lng: 15.5 }, aliases: ['Rathausplatz'],
  }), null);
  const match = matchCanonicalEntry([reviewed], {
    countryCode: 'AT', providerPlaceId: 'actual-vienna-locality',
    coordinates: { lat: 48.2082, lng: 16.3738 }, aliases: ['Vienna'],
  });
  assert.equal(match.entry.id, 'at-vienna');
  assert.equal(match.source, 'canonical_alias_and_geometry');
});

test('equally strong overlapping destination profiles require an explicit choice', () => {
  const base = {
    countryCode: 'ZZ', names: { he: 'יעד', en: 'Destination' },
    kind: 'city_hub', groupingPolicy: 'self', status: 'active',
    center: { lat: 1, lng: 1 }, radiusKm: 20,
  };
  const match = matchCanonicalEntry([
    { ...base, id: 'zz-first', aliases: ['First'] },
    { ...base, id: 'zz-second', aliases: ['Second'] },
  ], { countryCode: 'ZZ', coordinates: { lat: 1, lng: 1 } });
  assert.deepEqual(match.ambiguity.map((entry) => entry.id), ['zz-first', 'zz-second']);
});
