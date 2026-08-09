const test = require('node:test');
const assert = require('node:assert/strict');

const { parseSearchQuery } = require('./discoverySearch');
const { cleanDestinations, cleanFilters } = require('./personalizationService');
const {
  MAX_MAP_RESULTS,
  filterMapCandidates,
  getMapRecommendations,
  getViewportGeohashBounds,
  mapRecommendationPreview,
  normalizeViewport,
  viewportCenter,
  viewportContains,
} = require('./mapRecommendationsService');

const telAvivViewport = {
  north: 32.2,
  south: 32,
  west: 34.7,
  east: 34.9,
  zoom: 12,
};

function candidate(id, overrides = {}) {
  return {
    id,
    status: 'active',
    title: `Place ${id}`,
    categoryId: 'food',
    category: 'אוכל',
    budget: 'medium',
    mapLocation: { geohash: 'sv8', lat: 32.08, lng: 34.78 },
    place: { name: 'Cafe', address: 'Tel Aviv', coordinates: { lat: 32.08, lng: 34.78 } },
    destination: { countryId: 'IL', cityId: 'TLV', countryName: 'ישראל', cityName: 'תל אביב' },
    stats: { likeCount: 4 },
    facets: {
      audienceScope: 'all',
      audiences: [], vibes: [], needs: [], environments: [], budgetLevel: 'medium',
    },
    tags: [],
    search: {
      titleTokens: ['place'], taxonomyTokens: ['food'], destinationTokens: ['tel'], descriptionTokens: [],
    },
    media: [{
      thumb: { url: 'https://example.com/thumb.webp', width: 320, height: 320 },
      feed: { url: 'https://example.com/feed.webp', width: 1080, height: 1080 },
      placeholder: { color: '#EEE' },
    }],
    ownerId: 'private-owner',
    description: 'not needed on a map',
    ...overrides,
  };
}

function fakeAdmin(documents) {
  const docs = documents.map((entry) => ({ id: entry.id, data: () => entry }));
  const query = {
    where: () => query,
    orderBy: () => query,
    startAt: () => query,
    endAt: () => query,
    limit: () => query,
    get: async () => ({ docs }),
  };
  return { firestore: () => ({ collection: () => query }) };
}

test('viewport validation, bounds and antimeridian containment are deterministic', () => {
  assert.deepEqual(normalizeViewport(telAvivViewport), telAvivViewport);
  assert.ok(getViewportGeohashBounds(telAvivViewport).length > 0);
  const crossing = { north: 20, south: -20, west: 170, east: -170, zoom: 5 };
  assert.deepEqual(viewportCenter(crossing), [0, 180]);
  assert.equal(viewportContains(crossing, { lat: 0, lng: 179 }), true);
  assert.equal(viewportContains(crossing, { lat: 0, lng: -179 }), true);
  assert.equal(viewportContains(crossing, { lat: 0, lng: 0 }), false);
});

test('candidate filtering deduplicates and applies search, destination and filters', () => {
  const matching = candidate('one');
  const outside = candidate('outside', { mapLocation: { geohash: 'x', lat: 31, lng: 34.78 } });
  const wrongCategory = candidate('culture', { categoryId: 'culture' });
  const items = filterMapCandidates([matching, matching, outside, wrongCategory], {
    viewport: telAvivViewport,
    parsedQuery: parseSearchQuery('place'),
    destinations: cleanDestinations({ destinations: [{ countryId: 'IL', cityId: 'TLV' }] }).destinations,
    filters: cleanFilters({ categoryIds: ['food'] }),
  });
  assert.deepEqual(items.map((item) => item.id), ['one']);
});

test('map preview exposes only compact public fields', () => {
  const preview = mapRecommendationPreview(candidate('one'));
  assert.equal(preview.postId, 'one');
  assert.equal(preview.media.length, 1);
  assert.equal(preview.media[0].thumb.url, 'https://example.com/thumb.webp');
  assert.equal('feed' in preview.media[0], false);
  assert.equal('ownerId' in preview, false);
  assert.equal('description' in preview, false);
  assert.equal('search' in preview, false);
});

test('map discovery refuses global zoom and caps visible previews at 500', async () => {
  const tooWide = await getMapRecommendations({
    admin: fakeAdmin([]),
    data: { viewport: { ...telAvivViewport, zoom: 3 } },
  });
  assert.deepEqual(tooWide, { items: [], count: 0, truncated: false, zoomInRequired: true });

  const documents = Array.from({ length: MAX_MAP_RESULTS + 1 }, (_, index) => candidate(`p-${index}`));
  const capped = await getMapRecommendations({
    admin: fakeAdmin(documents),
    data: { viewport: telAvivViewport },
  });
  assert.equal(capped.items.length, MAX_MAP_RESULTS);
  assert.equal(capped.count, MAX_MAP_RESULTS);
  assert.equal(capped.truncated, true);
  assert.equal(capped.zoomInRequired, true);
  assert.equal(new Set(capped.items.map((item) => item.id)).size, MAX_MAP_RESULTS);
});
