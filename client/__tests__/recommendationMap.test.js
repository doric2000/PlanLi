import {
  CATEGORY_COLORS,
  getRecommendationMapVisual,
  normalizeRecommendationMapItems,
} from '../src/features/community/utils/recommendationMap';

describe('recommendation map model', () => {
  const expected = {
    food: ['restaurant', '#E85D3F'],
    nature: ['landscape', '#2E8B57'],
    culture: ['account-balance', '#7C3AED'],
    activities: ['local-activity', '#2563EB'],
    shopping: ['shopping-bag', '#DB2777'],
    stay: ['bed', '#4F46E5'],
    transportation: ['directions-bus', '#0891B2'],
    services: ['handyman', '#475569'],
  };

  it.each(Object.entries(expected))('maps %s to its icon and color', (categoryId, [icon, color]) => {
    expect(getRecommendationMapVisual(categoryId)).toMatchObject({
      categoryId,
      icon,
      color,
    });
    expect(CATEGORY_COLORS[categoryId]).toBe(color);
  });

  it('normalizes legacy labels and safely falls back for unknown categories', () => {
    expect(getRecommendationMapVisual('', 'אוכל ושתייה')).toMatchObject({
      categoryId: 'food',
      icon: 'restaurant',
    });
    expect(getRecommendationMapVisual('unknown', 'קטגוריה חדשה')).toEqual({
      categoryId: '',
      label: 'קטגוריה חדשה',
      icon: 'place',
      color: '#1E3A5F',
    });
  });

  it('keeps complete recommendation objects and rejects missing or invalid locations', () => {
    const valid = {
      id: 'rec-1',
      title: 'מסעדה מקומית',
      categoryId: 'food',
      place: { coordinates: { lat: '32.1', lng: 34.8 } },
    };
    const items = normalizeRecommendationMapItems([
      valid,
      { id: 'missing-place' },
      { id: 'invalid', place: { coordinates: { lat: 'north', lng: 34 } } },
      { place: { coordinates: { lat: 32, lng: 34 } } },
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: 'rec-1',
      coordinates: { lat: 32.1, lng: 34.8 },
      recommendation: valid,
    });
  });
});
