import {
  firstInvalidSection,
  sectionErrorCount,
  validateRecommendationForm,
  validateRouteForm,
} from '../src/utils/guidedFormValidation';

describe('guided form validation', () => {
  it('maps recommendation errors to the first relevant section', () => {
    const errors = validateRecommendationForm({
      title: '',
      description: '',
      selectedCountry: null,
      selectedCity: null,
      category: '',
      selectedTags: [],
      budget: '',
      audienceScope: 'selected',
      audiences: [],
      recommendationVibes: [],
      recommendationEnvironment: '',
      recommendationNeeds: [],
      attributeRequirements: { vibes: true, environment: true },
    });

    expect(firstInvalidSection(errors, ['place', 'story', 'category', 'fit'])).toBe('place');
    expect(sectionErrorCount(errors, 'place')).toBe(2);
    expect(errors.fields.location).toBeTruthy();
  });

  it('requires a subcategory for every selected route category', () => {
    const errors = validateRouteForm({
      title: 'מסלול',
      days: '2',
      distance: '14',
      desc: 'תיאור',
      validStops: [{ id: 'stop-1' }],
      categoryIds: ['nature', 'food'],
      subcategoryIds: ['hiking'],
      tagOptionsByCategory: {
        nature: [{ id: 'hiking' }],
        food: [{ id: 'restaurant' }],
      },
      audienceScope: 'all',
      audiences: [],
      budgetLevel: 'comfort',
      difficulty: 'easy',
      transportModes: ['car'],
      pace: 'balanced',
      seasons: ['spring'],
      environment: 'outdoor',
      needs: [],
    });

    expect(errors.fields.subcategoryIds).toBeTruthy();
    expect(sectionErrorCount(errors, 'category')).toBe(1);
  });

  it('accepts a complete route form', () => {
    const errors = validateRouteForm({
      title: 'מסלול',
      days: '1',
      distance: '5',
      desc: 'תיאור קצר',
      validStops: [{ id: 'stop-1' }],
      categoryIds: ['nature'],
      subcategoryIds: ['hiking'],
      tagOptionsByCategory: { nature: [{ id: 'hiking' }] },
      audienceScope: 'all',
      audiences: [],
      budgetLevel: 'economy',
      difficulty: 'easy',
      transportModes: ['walk'],
      pace: 'relaxed',
      seasons: ['spring'],
      environment: 'outdoor',
      needs: [],
      needsCoverageConfirmed: false,
    });

    expect(errors).toEqual({ fields: {}, sections: {} });
  });
});
