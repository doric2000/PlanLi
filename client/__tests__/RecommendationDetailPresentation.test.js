import {
  ENVIRONMENTS,
  INTERESTS,
  NEEDS,
  SEASONS,
  TRAVELER_STYLES,
  TRAVEL_PARTIES,
  VIBES,
  getBudgetLabel,
} from '../src/constants/travelTaxonomy';
import { getRecommendationDetailSections } from '../src/features/community/utils/recommendationDetailPresentation';

describe('getRecommendationDetailSections', () => {
  it('presents every user-facing recommendation facet with canonical labels', () => {
    const result = getRecommendationDetailSections({
      budget: 'balanced',
      tags: ['food_restaurant'],
      facets: {
        audienceScope: 'selected',
        audiences: [TRAVEL_PARTIES[0].value],
        vibes: [VIBES[0].value],
        environments: [ENVIRONMENTS[0].value],
        needs: [NEEDS[0].value],
        interests: [INTERESTS[0].value],
        travelerStyles: [TRAVELER_STYLES[0].value],
        seasons: [SEASONS[0].value],
      },
    });

    expect(result.facts.map((fact) => fact.id)).toEqual([
      'budget', 'audiences', 'vibes', 'environments',
    ]);
    expect(result.facts[0].label).toBe(getBudgetLabel('balanced'));
    expect(result.needs).toEqual([NEEDS[0].label]);
    expect(result.extras.map((group) => group.id)).toEqual([
      'interests', 'travelerStyles', 'seasons',
    ]);
    expect(result.tags).toHaveLength(1);
  });

  it('shows a universal audience and omits missing sections cleanly', () => {
    const result = getRecommendationDetailSections({
      facets: { audienceScope: 'all', audiences: [] },
    });

    expect(result.facts).toEqual([
      { id: 'audiences', icon: 'groups', label: 'מתאים לכולם' },
    ]);
    expect(result.tags).toEqual([]);
    expect(result.needs).toEqual([]);
    expect(result.extras).toEqual([]);
  });
});
