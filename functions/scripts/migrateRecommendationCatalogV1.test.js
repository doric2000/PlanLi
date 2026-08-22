const test = require('node:test');
const assert = require('node:assert/strict');

const {
  locationModeFor,
  migrateRecommendationCatalog,
  migrationEntry,
  parseArgs,
} = require('./migrateRecommendationCatalogV1');

function snapshot(path, data) {
  return { exists: true, ref: { path }, data: () => data, updateTime: null };
}

function applyPatch(data, patch) {
  const next = structuredClone(data);
  for (const [key, value] of Object.entries(patch)) {
    if (value?.constructor?.name === 'DeleteTransform') delete next[key];
    else next[key] = value;
  }
  return next;
}

const baseRecommendation = {
  status: 'active',
  title: 'תצפית יפה',
  description: 'מקום שכדאי להכיר',
  category: 'טבע ומים',
  categoryId: 'nature',
  tags: ['freshwater', 'viewpoint'],
  budget: 'free',
  taxonomyVersion: 5,
  destination: { countryId: 'DE', cityId: 'dst-1', countryName: 'גרמניה', cityName: 'בסטאי' },
  place: { placeId: 'exact-1', name: 'Bastei', coordinates: { lat: 50, lng: 14 } },
  mapLocation: { lat: 50, lng: 14, geohash: 'u33' },
  facets: {
    interests: ['nature_scenery'], audienceScope: 'selected', audiences: ['couple'],
    vibes: ['lively'], travelerStyles: [], needs: [], needsScope: '', budgetLevel: 'free',
    seasons: [], environments: ['outdoor'],
  },
};

test('migration is dry-run by default and production apply needs an explicit mode', () => {
  assert.equal(parseArgs([]).apply, false);
  assert.equal(parseArgs(['--apply', '--confirm-project', 'planli-f0b12']).apply, true);
  assert.equal(parseArgs(['--apply', '--confirm-project', 'planli-f0b12']).confirmProject, 'planli-f0b12');
  assert.equal(parseArgs(['--apply', '--confirm-project=planli-f0b12']).confirmProject, 'planli-f0b12');
  assert.throws(() => parseArgs(['--apply', '--rollback', 'checkpoint.json']), /either/);
});

test('direct legacy tags become a concise catalog classification without preserving authored atmosphere', () => {
  const entry = migrationEntry(snapshot('recommendations/r1', baseRecommendation));
  assert.equal(entry.kind, 'candidate');
  assert.equal(entry.patch.recommendationCatalogVersion, 1);
  assert.equal(entry.patch.category, 'טבע ונופים');
  assert.deepEqual(entry.patch.subcategoryIds, ['freshwater', 'viewpoint']);
  assert.deepEqual(entry.patch.catalogInterestIds, ['nature_scenery']);
  assert.equal(entry.patch.locationMode, 'exact');
  assert.equal(entry.patch.facets.audienceScope, 'all');
  assert.deepEqual(entry.patch.facets.audiences, []);
  assert.ok(!entry.patch.facets.vibes.includes('lively'));
  assert.deepEqual(entry.patch.details, {});
  assert.ok(entry.patch.search.taxonomyTokens.length > 0);
});

test('a broad provider locality becomes a general destination and loses the misleading map point', () => {
  const broad = {
    ...baseRecommendation,
    category: 'לינה', categoryId: 'stay', tags: ['hotel'], budget: 'economy',
    place: {
      placeId: 'city-1', name: 'Sa Pa', types: ['locality', 'political'],
      coordinates: { lat: 22.34, lng: 103.85 },
    },
  };
  assert.equal(locationModeFor(broad), 'destination');
  const entry = migrationEntry(snapshot('recommendations/r2', broad));
  assert.equal(entry.patch.locationMode, 'destination');
  assert.deepEqual(entry.deleteFields, ['place', 'mapLocation']);
  assert.ok(!entry.patch.search.destinationTokens.includes('sa'));
});

test('ambiguous legacy tags block the entire apply instead of receiving a silent mapping', async () => {
  const ambiguous = snapshot('recommendations/r3', {
    ...baseRecommendation, categoryId: 'food', category: 'אוכל ושתייה', tags: ['bakery_desserts'],
  });
  const dryRun = await migrateRecommendationCatalog({ firestore: {}, documents: [ambiguous] });
  assert.equal(dryRun.candidates, 0);
  assert.deepEqual(dryRun.blocked[0].tagIds, ['bakery_desserts']);
  await assert.rejects(
    migrateRecommendationCatalog({ firestore: {}, documents: [ambiguous], apply: true }),
    /blocked by 1/
  );
});

test('apply uses a checkpoint, preserves recency and is idempotent', async () => {
  let data = { ...baseRecommendation, updatedAt: 'unchanged', stats: { likeCount: 3 } };
  const ref = { path: 'recommendations/r4' };
  const firestore = {
    projectId: 'planli-f0b12',
    runTransaction: async (handler) => handler({
      get: async () => snapshot(ref.path, data),
      update: (_ref, patch) => { data = applyPatch(data, patch); },
    }),
  };
  let manifest;
  const first = await migrateRecommendationCatalog({
    firestore,
    documents: [snapshot(ref.path, data)],
    apply: true,
    manifestWriter: (_stateDir, value) => { manifest = value; return 'checkpoint.json'; },
  });
  assert.equal(first.applied, 1);
  assert.equal(data.recommendationCatalogVersion, 1);
  assert.equal(data.updatedAt, 'unchanged');
  assert.deepEqual(data.stats, { likeCount: 3 });
  assert.equal(manifest.documents[0].before.recommendationCatalogVersion.present, false);

  const second = await migrateRecommendationCatalog({
    firestore,
    documents: [snapshot(ref.path, data)],
    apply: true,
    manifestWriter: () => assert.fail('idempotent rerun must not write a checkpoint'),
  });
  assert.equal(second.candidates, 0);
});
