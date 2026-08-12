import { buildRouteDetailPresentation } from '../src/features/roadtrip/utils/routeDetailPresentation';

describe('buildRouteDetailPresentation', () => {
  it('uses canonical route fields and confirmed needs without legacy hashtags', () => {
    const result = buildRouteDetailPresentation({
      categoryIds: ['nature'],
      subcategoryIds: ['hiking'],
      difficulty: 'moderate',
      experienceLevel: 'beginner',
      transportModes: ['car'],
      pace: 'balanced',
      facets: {
        audienceScope: 'selected',
        audiences: ['friends'],
        budgetLevel: 'balanced',
        environments: ['outdoor'],
        vibes: ['adventurous'],
        travelerStyles: ['roadtrip'],
        seasons: ['spring'],
        needs: ['wheelchair_accessible'],
        needsScope: 'entire_route',
      },
      tags: { difficulty: 'legacy value must be ignored' },
    });

    expect(result.facts.map((fact) => fact.id)).toEqual([
      'budget', 'audiences', 'difficulty', 'environment',
    ]);
    expect(result.groups.map((group) => group.id)).toEqual([
      'subcategories', 'vibes', 'transport', 'pace', 'seasons', 'travelerStyles', 'experience',
    ]);
    expect(JSON.stringify(result)).not.toContain('#');
    expect(JSON.stringify(result)).not.toContain('legacy value');
    expect(result.needs).toHaveLength(1);
  });

  it('does not present unconfirmed route needs', () => {
    expect(buildRouteDetailPresentation({ facets: { needs: ['wheelchair_accessible'] } }).needs).toEqual([]);
  });
});
