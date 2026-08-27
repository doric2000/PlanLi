const test = require('node:test');
const assert = require('node:assert/strict');

const { CANDIDATES, REGIONAL_COUNTS } = require('./data/canonicalDestinationCandidates');
const {
  BUILTIN_POLICIES,
  canonicalDestinationId,
  matchCanonicalEntry,
  providerGeometryPolicy,
  registryCollectionIssues,
  validateRegistryEntry,
} = require('./canonicalDestinationRegistry');

test('researched catalog stays within the approved size and regional allocation', () => {
  assert.equal(CANDIDATES.length, 251);
  assert.deepEqual(REGIONAL_COUNTS, {
    europe: 101, asia: 80, central_america: 30, south_america: 40,
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

test('a unique approved province alias wins before approximate fallback geometry', () => {
  const match = matchCanonicalEntry(BUILTIN_POLICIES, {
    countryCode: 'TH',
    aliases: ['Chiang Mai Province'],
    coordinates: { lat: 20.05, lng: 98.95 },
  });
  assert.equal(match.entry.id, 'th-chiang-mai');
  assert.equal(match.source, 'canonical_alias');
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
    providerRefs: { googlePlaceId: 'shared-place' }, status: 'active',
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

test('unreviewed provider geometry never auto-matches a point', () => {
  const match = matchCanonicalEntry([{
    id: 'zz-provider-region', countryCode: 'ZZ', names: { he: 'אזור', en: 'Region' },
    aliases: ['Region'], kind: 'tourism_region', groupingPolicy: 'self', status: 'active',
    center: { lat: 1, lng: 1 }, radiusKm: 100,
    geometryPolicy: { autoMatchEligible: false, source: 'google_unreviewed', version: 2 },
  }], {
    countryCode: 'ZZ', aliases: ['Unrelated locality'], coordinates: { lat: 1, lng: 1 },
  });
  assert.equal(match, null);
});

test('provider viewports are eligible only when their scale fits the destination kind', () => {
  const cityViewport = {
    southwest: { lat: 31.7, lng: 34.7 },
    northeast: { lat: 32.3, lng: 35.1 },
  };
  const tinyRegionViewport = {
    southwest: { lat: 46.539, lng: 11.839 },
    northeast: { lat: 46.541, lng: 11.841 },
  };
  assert.equal(providerGeometryPolicy('city_hub', cityViewport).autoMatchEligible, true);
  assert.equal(providerGeometryPolicy('tourism_region', tinyRegionViewport).autoMatchEligible, false);
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
