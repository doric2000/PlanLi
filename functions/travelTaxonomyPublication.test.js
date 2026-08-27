const test = require('node:test');
const assert = require('node:assert/strict');

const {
  POST_BUDGET_IDS,
  RECOMMENDATION_CATEGORIES,
  RECOMMENDATION_SUBCATEGORIES,
  ROUTE_DIFFICULTY_IDS,
  ROUTE_EXPERIENCE_IDS,
  SEASON_IDS,
  TRANSPORT_MODE_IDS,
  PACE_IDS,
  isRecommendationClassificationValid,
} = require('./travelTaxonomy');

test('every recommendation catalog choice has one valid publication classification', () => {
  assert.equal(RECOMMENDATION_CATEGORIES.length, 10);
  assert.equal(RECOMMENDATION_SUBCATEGORIES.length, 166);
  assert.equal(RECOMMENDATION_SUBCATEGORIES.filter((entry) => entry.isOther).length, 10);
  for (const subcategory of RECOMMENDATION_SUBCATEGORIES) {
    assert.equal(isRecommendationClassificationValid({
      categoryId: subcategory.categoryId,
      subcategoryIds: [subcategory.id],
      customSubcategoryLabel: subcategory.isOther ? 'אפשרות מותאמת' : '',
    }), true, `${subcategory.id} must be publishable in ${subcategory.categoryId}`);
    const differentCategory = RECOMMENDATION_CATEGORIES.find((entry) => entry.id !== subcategory.categoryId);
    assert.equal(isRecommendationClassificationValid({
      categoryId: differentCategory.id,
      subcategoryIds: [subcategory.id],
      customSubcategoryLabel: subcategory.isOther ? 'אפשרות מותאמת' : '',
    }), false, `${subcategory.id} must not cross category boundaries`);
  }
});

test('all public recommendation and route option sets are unique and non-empty', () => {
  const sets = {
    budgets: POST_BUDGET_IDS,
    seasons: SEASON_IDS,
    difficulties: ROUTE_DIFFICULTY_IDS,
    experience: ROUTE_EXPERIENCE_IDS,
    transport: TRANSPORT_MODE_IDS,
    pace: PACE_IDS,
  };
  assert.deepEqual(POST_BUDGET_IDS, ['free', 'economy', 'balanced', 'comfort', 'premium']);
  for (const [name, values] of Object.entries(sets)) {
    assert.ok(values.length > 0, `${name} cannot be empty`);
    assert.equal(new Set(values).size, values.length, `${name} cannot contain duplicate IDs`);
  }
});
