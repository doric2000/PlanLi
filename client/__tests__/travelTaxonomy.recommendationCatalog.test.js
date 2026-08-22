import {
  RECOMMENDATION_CATALOG,
  RECOMMENDATION_CATEGORIES,
  RECOMMENDATION_SUBCATEGORIES,
  isRecommendationClassificationValid,
  normalizeRecommendationSubcategories,
  searchRecommendationCatalog,
  suggestClassificationFromGoogleTypes,
} from '../src/constants/travelTaxonomy';

describe('prepared recommendation catalog', () => {
  it('stays inactive while exposing the complete prepared catalog', () => {
    expect(RECOMMENDATION_CATALOG.runtimeEnabled).toBe(false);
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
});
