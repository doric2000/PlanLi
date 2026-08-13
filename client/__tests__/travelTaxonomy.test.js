import {
  analyzeTagValues,
  BUDGETS,
  CATEGORIES,
  INTERESTS,
  NEEDS,
  normalizeBudgetId,
  normalizeTagIds,
  POST_BUDGETS,
  suggestedInterestIds,
  TAGS,
  TAG_OPTIONS_BY_CATEGORY,
  TRAVEL_PARTIES,
  VIBES,
} from '../src/constants/travelTaxonomy';

describe('shared travel taxonomy', () => {
  it('uses the same complete facet catalogs for profiles and posts', () => {
    expect(INTERESTS).toHaveLength(25);
    expect(INTERESTS.map((item) => item.value)).toEqual(expect.arrayContaining([
      'stays_accommodation',
      'transportation_mobility',
      'travel_tips_services',
    ]));
    expect(TRAVEL_PARTIES.find((item) => item.value === 'multigenerational_group')?.label)
      .toBe('משפחה מורחבת / טיול בקבוצה');
    expect(VIBES.length).toBeGreaterThan(0);
    expect(NEEDS.map((item) => item.value)).toEqual(expect.arrayContaining([
      'gluten_free', 'halal', 'stroller_accessible',
    ]));
    expect(POST_BUDGETS.map((item) => item.value)).toEqual([
      'free', 'economy', 'balanced', 'comfort', 'premium',
    ]);
    expect(BUDGETS.map((item) => item.value)).toContain('flexible');
    expect(normalizeBudgetId('חינם')).toBe('free');
    expect(normalizeBudgetId('חינמי')).toBe('free');
    expect(normalizeBudgetId('free')).toBe('free');
    expect(normalizeBudgetId('₪')).toBe('economy');
  });

  it('suggests precise interests from post category and stable tag IDs', () => {
    expect(suggestedInterestIds('stay', ['hotel'])).toEqual(['stays_accommodation']);
    expect(suggestedInterestIds('transportation', ['car_rental']))
      .toEqual(['transportation_mobility']);
    expect(normalizeTagIds(['נקודות תצפית'])).toEqual(['viewpoint']);
    expect(TAG_OPTIONS_BY_CATEGORY.services.map((item) => item.id)).toContain('local_tips');
  });

  it('does not turn generic accessibility or Chabad into practical guarantees', () => {
    const analysis = analyzeTagValues(['נגישות', 'חב״ד']);
    expect(analysis.needs).toEqual([]);
    expect(analysis.tagIds).toEqual([]);
  });

  it('marks every selectable descriptive tag as mapped or display-only', () => {
    for (const tag of TAGS.filter((item) => item.selectable !== false)) {
      const mapped = ['interests', 'audiences', 'vibes', 'travelerStyles', 'needs', 'seasons', 'environments']
        .some((field) => Array.isArray(tag[field]) && tag[field].length > 0);
      expect(mapped || tag.displayOnly === true).toBe(true);
    }
    expect(CATEGORIES).toHaveLength(8);
  });
});
