const test = require('node:test');
const assert = require('node:assert/strict');

const { buildFavoritePreview } = require('./socialService');

test('favorite previews never persist rating metrics', () => {
  const preview = buildFavoritePreview({
    target: { type: 'city', id: 'city-1', countryId: 'country-1' },
    data: {
      name: 'City',
      rating: 4.8,
      travelers: 12,
      dayCount: 3,
      distanceKm: 42,
    },
    publicProfile: null,
  });

  assert.deepEqual(preview.metrics, {
    days: 3,
    distanceKm: 42,
    travelers: 12,
  });
  assert.equal(Object.hasOwn(preview.metrics, 'rating'), false);
});
