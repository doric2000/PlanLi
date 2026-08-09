import {
  ENVIRONMENTS,
  INTERESTS,
  NEEDS,
  SEASONS,
  TRAVELER_STYLES,
  TRAVEL_PARTIES,
  VIBES,
  getBudgetLabel,
  getOptionLabel,
  getTagLabel,
} from '../../../constants/travelTaxonomy';

const uniqueValues = (values) => Array.from(new Set(
  (Array.isArray(values) ? values : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean)
));

const labelsFor = (values, options) => uniqueValues(values)
  .map((value) => getOptionLabel(options, value))
  .filter(Boolean);

export function getRecommendationDetailSections(item = {}) {
  const facets = item.facets || {};
  const facts = [];

  const budget = item.budget ? getBudgetLabel(item.budget) : '';
  if (budget) {
    facts.push({
      id: 'budget',
      icon: 'account-balance-wallet',
      title: 'רמת מחיר',
      value: budget,
    });
  }

  const audiences = labelsFor(facets.audiences, TRAVEL_PARTIES);
  if (facets.audienceScope === 'all') {
    facts.push({
      id: 'audiences',
      icon: 'groups',
      title: 'קהל',
      value: 'מתאים לכולם',
    });
  } else if (audiences.length) {
    facts.push({
      id: 'audiences',
      icon: 'groups',
      title: 'קהל',
      value: audiences.join(' · '),
    });
  }

  const vibes = labelsFor(facets.vibes, VIBES);
  if (vibes.length) {
    facts.push({
      id: 'vibes',
      icon: 'sentiment-satisfied-alt',
      title: 'אווירה',
      value: vibes.join(' · '),
    });
  }

  const environments = labelsFor(facets.environments, ENVIRONMENTS);
  if (environments.length) {
    facts.push({
      id: 'environments',
      icon: 'landscape',
      title: 'סביבה',
      value: environments.join(' · '),
    });
  }

  const extras = [
    { id: 'interests', title: 'תחומי עניין', values: labelsFor(facets.interests, INTERESTS) },
    { id: 'travelerStyles', title: 'סגנון טיול', values: labelsFor(facets.travelerStyles, TRAVELER_STYLES) },
    { id: 'seasons', title: 'עונה מומלצת', values: labelsFor(facets.seasons, SEASONS) },
  ].filter((group) => group.values.length);

  return {
    facts,
    tags: uniqueValues(item.tags).map(getTagLabel).filter(Boolean),
    needs: labelsFor(facets.needs, NEEDS),
    extras,
  };
}
