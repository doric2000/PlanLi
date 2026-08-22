const test = require('node:test');
const assert = require('node:assert/strict');

const {
  RECOMMENDATION_CATALOG,
  RECOMMENDATION_CATEGORIES,
  RECOMMENDATION_SUBCATEGORIES,
  isRecommendationClassificationValid,
  normalizeRecommendationCategory,
  normalizeRecommendationSubcategories,
  searchRecommendationCatalog,
  suggestClassificationFromGoogleTypes,
} = require('./travelTaxonomy');

test('prepared recommendation catalog exports remain read-only and inactive', () => {
  assert.equal(RECOMMENDATION_CATALOG.runtimeEnabled, false);
  assert.equal(Object.isFrozen(RECOMMENDATION_CATALOG), true);
  assert.equal(Object.isFrozen(RECOMMENDATION_CATALOG.categories[0]), true);
  assert.equal(RECOMMENDATION_CATEGORIES.length, 10);
  assert.equal(RECOMMENDATION_SUBCATEGORIES.length, 166);
  assert.equal(RECOMMENDATION_SUBCATEGORIES[0].id, 'restaurant');
  assert.equal(RECOMMENDATION_SUBCATEGORIES.at(-1).id, 'services_other');
});

test('recommendation classification normalizes labels and enforces one category with one to three items', () => {
  assert.equal(normalizeRecommendationCategory('אוכל ושתייה'), 'food');
  assert.deepEqual(
    normalizeRecommendationSubcategories(['מסעדה', 'בית קפה', 'מאפייה', 'מזון מהיר'], 'food'),
    ['restaurant', 'cafe', 'bakery']
  );
  assert.deepEqual(
    normalizeRecommendationSubcategories(['סדנה / שיעור'], 'activities'),
    ['workshop_class']
  );
  assert.deepEqual(
    normalizeRecommendationSubcategories(['סדנה / שיעור'], 'events'),
    ['workshop_event']
  );
  assert.deepEqual(normalizeRecommendationSubcategories(['museum'], 'food'), []);
  assert.deepEqual(normalizeRecommendationSubcategories(['restaurant'], 'bogus'), []);
  assert.deepEqual(normalizeRecommendationSubcategories(['משהו אחר']), []);

  assert.equal(isRecommendationClassificationValid({
    categoryId: 'food', subcategoryIds: ['restaurant'],
  }), true);
  assert.equal(isRecommendationClassificationValid({
    categoryId: 'food', subcategoryIds: [],
  }), false);
  assert.equal(isRecommendationClassificationValid({
    categoryId: 'food', subcategoryIds: ['restaurant', 'cafe', 'bakery', 'fast_food'],
  }), false);
  assert.equal(isRecommendationClassificationValid({
    categoryId: 'food', subcategoryIds: ['restaurant', 'museum'],
  }), false);
  assert.equal(isRecommendationClassificationValid({
    categoryId: 'food', subcategoryIds: ['restaurant', null],
  }), false);
});

test('Other requires a short custom label and ordinary classifications reject one', () => {
  assert.equal(isRecommendationClassificationValid({
    categoryId: 'nature', subcategoryIds: ['nature_other'], customSubcategoryLabel: 'קרחון',
  }), true);
  assert.equal(isRecommendationClassificationValid({
    categoryId: 'nature', subcategoryIds: ['nature_other'], customSubcategoryLabel: 'א',
  }), false);
  assert.equal(isRecommendationClassificationValid({
    categoryId: 'nature', subcategoryIds: ['nature_other'], customSubcategoryLabel: {},
  }), false);
  assert.equal(isRecommendationClassificationValid({
    categoryId: 'nature', subcategoryIds: ['nature_other'], customSubcategoryLabel: 123,
  }), false);
  assert.equal(isRecommendationClassificationValid({
    categoryId: 'nature', subcategoryIds: ['beach'], customSubcategoryLabel: 'חוף פרטי',
  }), false);
});

test('catalog search supports Hebrew and common foreign aliases within category context', () => {
  const firstId = (query, categoryId) => searchRecommendationCatalog(query, { categoryId })[0]?.id;
  assert.equal(firstId('Airbnb', 'stay'), 'vacation_rental');
  assert.equal(firstId('איירבנב', 'stay'), 'vacation_rental');
  assert.equal(firstId('צלילה', 'activities'), 'water_sports');
  assert.equal(firstId('ראפטינג', 'activities'), 'water_sports');
  assert.equal(firstId('קרוז', 'transportation'), 'cruise');
  assert.equal(firstId('פוניקולר', 'transportation'), 'cable_car_funicular');
  assert.deepEqual(searchRecommendationCatalog('Airbnb', { categoryId: 'food' }), []);
  assert.deepEqual(searchRecommendationCatalog('restaurant', { categoryId: 'bogus' }), []);
});

test('Google types only provide confirmable suggestions when an exact place is available', () => {
  assert.deepEqual(suggestClassificationFromGoogleTypes({
    primaryType: 'restaurant', types: ['restaurant', 'bar'],
  }), []);

  const suggestions = suggestClassificationFromGoogleTypes({
    placeId: 'google-place-1', primaryType: 'restaurant', types: ['restaurant', 'bar', 'unknown_type'],
  });
  assert.deepEqual(suggestions, [
    {
      categoryId: 'food', subcategoryIds: ['restaurant'], providerType: 'restaurant',
      isPrimary: true, isSuggestion: true,
    },
    {
      categoryId: 'nightlife', subcategoryIds: ['bar'], providerType: 'bar',
      isPrimary: false, isSuggestion: true,
    },
  ]);
  assert.equal(suggestions.some((item) => item.subcategoryIds.some((id) => id.endsWith('_other'))), false);
});
