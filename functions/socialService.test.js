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

test('recommendation favorite previews persist canonical and legacy category fields', () => {
  const preview = buildFavoritePreview({
    target: { type: 'recommendation', id: 'rec-1' },
    data: {
      title: 'Market',
      status: 'active',
      categoryId: 'food',
      category: 'אוכל וקולינריה',
    },
    publicProfile: null,
  });

  assert.equal(preview.categoryId, 'food');
  assert.equal(preview.category, 'אוכל וקולינריה');
});

test('non-recommendation favorite previews do not gain category fields', () => {
  const preview = buildFavoritePreview({
    target: { type: 'city', id: 'city-1', countryId: 'country-1' },
    data: { name: 'City', categoryId: 'food', category: 'אוכל' },
    publicProfile: null,
  });

  assert.equal(Object.hasOwn(preview, 'categoryId'), false);
  assert.equal(Object.hasOwn(preview, 'category'), false);
});
