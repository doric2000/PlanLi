import {
  availableCommunityFilters,
  buildEssentialRows,
  buildQuickFacts,
  buildSourceRows,
  filterCommunityRecommendations,
} from '../src/features/destination/utils/destinationViewModel';

const recommendations = [
  { id: 'food', categoryId: 'food', tags: ['restaurant'] },
  { id: 'bus', categoryId: 'transportation', tags: ['public_transit'] },
  { id: 'sim', categoryId: 'services', tags: ['sim_esim'] },
];

test('community filters are RTL-ready and only appear when content exists', () => {
  expect(availableCommunityFilters(recommendations)).toEqual([
    { id: 'all', label: 'הכול' },
    { id: 'transportation', label: 'תחבורה' },
    { id: 'sim', label: 'SIM וגלישה' },
  ]);
  expect(availableCommunityFilters([recommendations[0]])).toEqual([
    { id: 'all', label: 'הכול' },
  ]);
  expect(filterCommunityRecommendations(recommendations, 'transportation'))
    .toEqual([recommendations[1]]);
  expect(filterCommunityRecommendations(recommendations, 'sim'))
    .toEqual([recommendations[2]]);
});

test('quick facts omit unavailable widgets instead of rendering placeholders', () => {
  const facts = buildQuickFacts({
    weather: { temperatureC: 24, description: 'בהיר', conditionCode: 'clear' },
    closestAirport: null,
    currency: { code: 'EUR', symbol: '€', ilsRate: 0.25 },
  });
  expect(facts.map((fact) => fact.id)).toEqual(['weather', 'currency']);
  expect(facts.map((fact) => fact.value)).not.toContain('לא זמין');
  expect(buildQuickFacts({})).toEqual([]);
});

test('essential facts contain only verified language and calling-code rows', () => {
  expect(buildEssentialRows({
    languages: [{ code: 'el', labelHe: 'יוונית' }],
    callingCodes: ['+30'],
    hotel: 'must be ignored',
    driver: 'must be ignored',
  })).toEqual([
    { id: 'languages', label: 'שפה', value: 'יוונית', icon: 'translate' },
    { id: 'callingCodes', label: 'קידומת חיוג', value: '+30', icon: 'phone-outline' },
  ]);
});

test('source rows remain compact and omit empty source entries', () => {
  expect(buildSourceRows({
    weather: { name: 'OpenWeather', updatedAt: '2026-08-05' },
    country: { name: '' },
  })).toEqual([
    {
      id: 'weather',
      label: 'מזג אוויר',
      value: 'OpenWeather',
      updatedAt: '2026-08-05',
    },
  ]);
});
