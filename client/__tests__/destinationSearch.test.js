import {
  filterAndSortDestinations,
  mergeDestinations,
  normalizeDestinationText,
} from '../src/utils/destinationSearch';

const cities = [
  { id: 'paris', countryId: 'fr', name: 'פריז', countryName: 'צרפת', stats: { recommendationCount: 8 } },
  { id: 'paros', countryId: 'gr', name: 'פארוס', countryName: 'יוון', stats: { recommendationCount: 3 } },
  { id: 'athens', countryId: 'gr', name: 'אתונה', countryName: 'יוון', description: 'הבירה העתיקה', stats: { recommendationCount: 12 } },
];

describe('destinationSearch', () => {
  it('normalizes whitespace and case', () => {
    expect(normalizeDestinationText('  PARIS ')).toBe('paris');
  });

  it('searches city, country, and description and prefers prefix matches', () => {
    expect(filterAndSortDestinations(cities, { query: 'יוון' }).map((city) => city.id)).toEqual(['athens', 'paros']);
    expect(filterAndSortDestinations(cities, { query: 'עתיקה' }).map((city) => city.id)).toEqual(['athens']);
  });

  it('supports alphabetical and saved-only scopes', () => {
    expect(filterAndSortDestinations(cities, { sortBy: 'name' }).map((city) => city.id)).toEqual(['athens', 'paros', 'paris']);
    expect(filterAndSortDestinations(cities, {
      savedOnly: true,
      favoriteKeys: new Set(['fr:paris']),
    }).map((city) => city.id)).toEqual(['paris']);
  });

  it('merges favorite previews with richer destination records', () => {
    const merged = mergeDestinations(
      [{ id: 'paris', countryId: 'fr', name: 'פריז', stats: { recommendationCount: 8 } }],
      [{ id: 'paris', countryId: 'fr', imageUrl: 'image.webp' }]
    );
    expect(merged).toEqual([{ id: 'paris', countryId: 'fr', name: 'פריז', stats: { recommendationCount: 8 }, imageUrl: 'image.webp' }]);
  });
});
