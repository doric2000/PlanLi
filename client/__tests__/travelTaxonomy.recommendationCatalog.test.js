import {
  PRACTICAL_FACTS,
  RECOMMENDATION_CATALOG,
  RECOMMENDATION_CATEGORIES,
  RECOMMENDATION_SUBCATEGORIES,
  getRecommendationPracticalAllowedTokens,
  getRecommendationPracticalOptions,
  isRecommendationClassificationValid,
  normalizeRecommendationSubcategories,
  searchRecommendationCatalog,
  suggestClassificationFromGoogleTypes,
} from '../src/constants/travelTaxonomy';

describe('recommendation catalog', () => {
  it('is active while exposing the complete recommendation catalog', () => {
    expect(RECOMMENDATION_CATALOG.runtimeEnabled).toBe(true);
    expect(Object.isFrozen(RECOMMENDATION_CATALOG.categories[0])).toBe(true);
    expect(RECOMMENDATION_CATEGORIES).toHaveLength(10);
    expect(RECOMMENDATION_SUBCATEGORIES).toHaveLength(166);
  });

  it('normalizes duplicate labels within their selected category', () => {
    expect(normalizeRecommendationSubcategories(['סדנה / שיעור'], 'activities')).toEqual(['workshop_class']);
    expect(normalizeRecommendationSubcategories(['סדנה / שיעור'], 'events')).toEqual(['workshop_event']);
    expect(normalizeRecommendationSubcategories(['restaurant'], 'bogus')).toEqual([]);
    expect(normalizeRecommendationSubcategories(['משהו אחר'])).toEqual([]);
  });

  it('searches the required Hebrew and common provider aliases', () => {
    const firstId = (query, categoryId) => searchRecommendationCatalog(query, { categoryId })[0]?.id;
    expect(firstId('Airbnb', 'stay')).toBe('vacation_rental');
    expect(firstId('איירבנב', 'stay')).toBe('vacation_rental');
    expect(firstId('צלילה', 'activities')).toBe('water_sports');
    expect(firstId('ראפטינג', 'activities')).toBe('water_sports');
    expect(firstId('קרוז', 'transportation')).toBe('cruise');
    expect(firstId('פוניקולר', 'transportation')).toBe('cable_car_funicular');
    expect(searchRecommendationCatalog('restaurant', { categoryId: 'bogus' })).toEqual([]);
  });

  it('validates Other and does not infer provider types without an exact place', () => {
    expect(isRecommendationClassificationValid({
      categoryId: 'services', subcategoryIds: ['services_other'], customSubcategoryLabel: 'מרכז ויזה',
    })).toBe(true);
    expect(isRecommendationClassificationValid({
      categoryId: 'services', subcategoryIds: ['services_other'], customSubcategoryLabel: '',
    })).toBe(false);
    expect(isRecommendationClassificationValid({
      categoryId: 'services', subcategoryIds: ['services_other'], customSubcategoryLabel: {},
    })).toBe(false);
    expect(suggestClassificationFromGoogleTypes({ primaryType: 'pharmacy' })).toEqual([]);
    expect(suggestClassificationFromGoogleTypes({
      placeId: 'place-1', primaryType: 'pharmacy', types: ['pharmacy'],
    })[0]).toMatchObject({
      categoryId: 'services', subcategoryIds: ['pharmacy'], isSuggestion: true, isPrimary: true,
    });
  });

  it('offers a short contextual practical-information set without mixing unrelated categories', () => {
    expect(PRACTICAL_FACTS).toHaveLength(23);
    expect(getRecommendationPracticalOptions('food', ['restaurant']).suggested.map((item) => item.key)).toEqual([
      'need:kosher',
      'need:vegetarian',
      'need:vegan',
      'need:gluten_free',
    ]);
    expect(getRecommendationPracticalOptions('activities', ['boat_tour']).suggested.map((item) => item.key))
      .toContain('fact:motion_sickness');
    expect(getRecommendationPracticalOptions('services', ['pharmacy']).suggested).toEqual([]);
    expect(getRecommendationPracticalAllowedTokens('food')).toContain('fact:accessible_restroom');
    expect(getRecommendationPracticalAllowedTokens('food')).not.toContain('fact:demanding_walk');
  });
});
