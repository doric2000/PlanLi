const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  buildFieldPatch,
  buildManifestEntry,
  canonicalizeRecommendation,
  getCityCountDeltas,
  matchesExpectedUpdateTime,
  parseArgs,
  validateLocation,
  validateManifestEntry,
  validateVolatileFacts,
} = require('./curateRecommendations');

function recommendation(overrides = {}) {
  return {
    title: ' מקום טוב ',
    description: ' תיאור שימושי ',
    categoryId: 'food',
    category: 'אוכל ובילויים',
    tags: ['restaurant'],
    budget: 'balanced',
	facets: {
	  interests: ['food'], audienceScope: 'all', audiences: [], vibes: ['relaxed'], travelerStyles: [],
	  needs: [], needsScope: '', budgetLevel: 'balanced', seasons: [], environments: ['indoor'],
	},
    status: 'active',
    destination: { countryId: 'country', cityId: 'city' },
    ...overrides,
  };
}

function snapshot(data = recommendation()) {
  return {
    id: 'r1',
    ref: { path: 'recommendations/r1' },
    data: () => data,
    updateTime: { toDate: () => new Date('2026-08-04T08:00:00.000Z') },
  };
}

test('curation is dry-run by default and apply requires explicit flags', () => {
  const defaults = parseArgs([]);
  assert.equal(defaults.apply, false);
  assert.equal(defaults.resume, false);
  assert.equal(defaults.rollback, null);

  const explicit = parseArgs([
    '--apply', '--resume', '--manifest', './manifest.json', '--state-dir', './state', '--limit', '12',
  ]);
  assert.equal(explicit.apply, true);
  assert.equal(explicit.resume, true);
  assert.equal(explicit.manifest, './manifest.json');
  assert.equal(explicit.stateDir, path.resolve('./state'));
  assert.equal(explicit.limit, 12);
});

test('canonicalization trims copy and rebuilds taxonomy facets', () => {
  const after = canonicalizeRecommendation(recommendation(), {
    id: 'r1',
	patch: { tags: ['restaurant'], facets: {
		interests: ['food'], audienceScope: 'selected', audiences: ['couple'], vibes: ['relaxed'],
		needs: [], environments: ['indoor'],
	} },
    confidence: 'high',
    reason: 'review',
    sources: [],
    location: {},
    volatileFacts: [],
    removeFields: [],
    deactivation: {},
  });
  assert.equal(after.title, 'מקום טוב');
  assert.equal(after.description, 'תיאור שימושי');
  assert.deepEqual(after.tags, ['restaurant']);
  assert.ok(after.facets.interests.includes('food'));
  assert.ok(after.facets.audiences.includes('couple'));
});

test('manifest preserves the Firestore updateTime precondition and audit metadata', () => {
  const result = buildManifestEntry(snapshot(), {
    id: 'r1',
    patch: { description: 'תיאור ברור ומעודכן' },
    confidence: 'high',
    reason: 'Editorial clarity.',
    sources: [],
    location: { precision: 'city' },
  });
  assert.equal(result.entry.expectedUpdateTime, '2026-08-04T08:00:00.000Z');
  assert.equal(result.entry.reason, 'Editorial clarity.');
	assert.deepEqual(result.entry.changes, ['title', 'description', 'category', 'taxonomyVersion', 'search']);
  assert.deepEqual(result.errors, []);
});

test('precondition comparison rejects a document changed after dry-run', () => {
  assert.equal(matchesExpectedUpdateTime(snapshot(), '2026-08-04T08:00:00.000Z'), true);
  assert.equal(matchesExpectedUpdateTime(snapshot(), '2026-08-04T08:00:01.000Z'), false);
});

test('exact places require a verified Place ID, coordinates, date, and source', () => {
  const exact = recommendation({
    place: { placeId: 'place-1', coordinates: { lat: 32.1, lng: 34.8 } },
  });
  assert.deepEqual(validateLocation(exact, {
    precision: 'exact',
    verifiedPlaceId: 'place-1',
    verifiedAt: '2026-08-04T08:00:00.000Z',
    sourceUrl: 'https://maps.google.com/',
  }), []);
  assert.ok(validateLocation(exact, { precision: 'city' }).includes('city-level-has-exact-place'));
  assert.ok(validateLocation(exact, {
    precision: 'exact', verifiedPlaceId: 'different', verifiedAt: 'bad', sourceUrl: 'http://x.test',
  }).length >= 3);
});

test('prices and hours require a dated official source', () => {
  assert.deepEqual(validateVolatileFacts(['hours'], [{
    type: 'official', url: 'https://example.com/hours', checkedAt: '2026-08-04',
  }]), []);
  assert.deepEqual(validateVolatileFacts(['price'], [{
    type: 'other', url: 'https://example.com/', checkedAt: '2026-08-04',
  }]), ['volatile-fact-without-official-source']);
});

test('practical needs derived from an existing canonical tag do not require a second source', () => {
  const entry = buildManifestEntry(snapshot(recommendation({
    tags: ['restaurant', 'כשר'],
	 facets: {
		interests: ['food'], audienceScope: 'all', audiences: [], vibes: ['relaxed'], needs: [],
		budgetLevel: 'balanced', environments: ['indoor'],
	 },
  })), {
    id: 'r1',
    patch: {},
    confidence: 'high',
    reason: 'Canonical tag-derived facets.',
    location: { precision: 'city' },
  }).entry;
  assert.equal(validateManifestEntry(entry).includes('new-practical-needs-without-official-source'), false);
});

test('deactivation and destination changes produce balanced city counter deltas', () => {
  assert.deepEqual(
    Array.from(getCityCountDeltas(recommendation(), recommendation({ status: 'inactive' })).entries()),
    [['countries/country/cities/city', -1]]
  );
  assert.deepEqual(Array.from(getCityCountDeltas(
    recommendation(),
    recommendation({ destination: { countryId: 'country', cityId: 'other-city' } })
  ).entries()), [
    ['countries/country/cities/city', -1],
    ['countries/country/cities/other-city', 1],
  ]);
});

test('inactive entries require an explicit placeholder confirmation', () => {
  const result = buildManifestEntry(snapshot(), {
    id: 'r1',
    patch: { status: 'inactive' },
    confidence: 'high',
    reason: 'Placeholder.',
    location: { precision: 'city' },
  });
  assert.ok(validateManifestEntry(result.entry).includes('inactive-without-placeholder-confirmation'));
  result.entry.deactivation = { placeholder: true };
  assert.equal(validateManifestEntry(result.entry).includes('inactive-without-placeholder-confirmation'), false);
});

test('rollback patch restores removed and changed tracked fields', () => {
  const deleted = Symbol('delete');
  const fieldValue = { delete: () => deleted };
  const patch = buildFieldPatch(
    { title: 'before', place: { placeId: 'p1' } },
    { title: 'after' },
    fieldValue
  );
  assert.equal(patch.title, 'after');
  assert.equal(patch.place, deleted);
});
