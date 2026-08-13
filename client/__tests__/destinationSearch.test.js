import {
  compactDestinationText,
  destinationSearchForms,
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
    expect(compactDestinationText('  St.  John’s ')).toBe('stjohns');
    expect(destinationSearchForms("St. John's")).toEqual(expect.arrayContaining(['stjohns', 'johns']));
  });

  it.each([
    ['St. John’s', 'st johns'],
    ["St. John's", 'ST JOHNS'],
    ['St. John’s', 'stjohns'],
    ['Winston-Salem', 'winston salem'],
    ['Winston-Salem', 'salem'],
    ['São Paulo', 'sao paulo'],
  ])('matches formatting variants for %s with %s', (name, query) => {
    const destination = { id: 'match', countryId: 'ca', names: { en: name } };
    expect(filterAndSortDestinations([destination], { query })).toEqual([destination]);
  });

  it('matches Hebrew and English aliases while leaving misspellings unmatched', () => {
    const jerusalem = {
      id: 'jerusalem',
      countryId: 'il',
      identity: { names: { he: 'יְרוּשָׁלַיִם', en: 'Jerusalem' } },
    };
    expect(filterAndSortDestinations([jerusalem], { query: 'ירושלימ' })).toEqual([jerusalem]);
    expect(filterAndSortDestinations([jerusalem], { query: '  JERUSALEM  ' })).toEqual([jerusalem]);
    expect(filterAndSortDestinations([
      { id: 'paris', countryId: 'fr', names: { en: 'Paris' } },
    ], { query: 'Pariis' })).toEqual([]);
  });

  it('ranks exact normalized matches before prefixes and contained terms', () => {
    const ranked = [
      { id: 'contains', countryId: 'us', names: { en: 'New Johns Harbor' }, stats: { recommendationCount: 100 } },
      { id: 'prefix', countryId: 'ca', names: { en: 'St. John’s Bay' }, stats: { recommendationCount: 50 } },
      { id: 'exact', countryId: 'ca', names: { en: 'St. John’s' }, stats: { recommendationCount: 1 } },
    ];
    expect(filterAndSortDestinations(ranked, { query: 'st johns' }).map((city) => city.id))
      .toEqual(['exact', 'prefix']);
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
