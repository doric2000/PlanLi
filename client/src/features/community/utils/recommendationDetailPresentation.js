import {
  ENVIRONMENTS,
  INTERESTS,
  NEEDS,
  SEASONS,
  TRAVELER_STYLES,
  TRAVEL_PARTIES,
  VIBES,
  RECOMMENDATION_SUBCATEGORIES,
  getBudgetLabel,
  getOptionLabel,
  getTagLabel,
} from '../../../constants/travelTaxonomy';

const recommendationSubcategoryById = Object.fromEntries(
  RECOMMENDATION_SUBCATEGORIES.map((item) => [item.id, item])
);

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
  const details = item.details || {};
  const facts = [];

  const budget = item.budget ? getBudgetLabel(item.budget) : 'מחיר לא צוין';
  facts.push({
    id: 'budget',
    icon: 'account-balance-wallet',
    title: 'רמת מחיר',
    value: budget,
  });

  [
    { id: 'eventSchedule', icon: 'event', title: 'מועד', value: details.eventSchedule },
    { id: 'priceNote', icon: 'payments', title: 'מחיר', value: details.priceNote },
    { id: 'contactName', icon: 'person-outline', title: 'איש קשר', value: details.contactName },
    { id: 'phone', icon: 'phone', title: 'טלפון', value: details.phone },
    { id: 'externalUrl', icon: 'link', title: 'קישור', value: details.externalUrl },
    { id: 'accessibilityNote', icon: 'accessible', title: 'נגישות', value: details.accessibilityNote },
  ].forEach((fact) => {
    if (typeof fact.value === 'string' && fact.value.trim()) facts.push(fact);
  });

  const audiences = labelsFor(facets.audiences, TRAVEL_PARTIES);
  if (!item.recommendationCatalogVersion && facets.audienceScope === 'all') {
    facts.push({
      id: 'audiences',
      icon: 'groups',
      title: 'קהל',
      value: 'מתאים לכולם',
    });
  } else if (!item.recommendationCatalogVersion && audiences.length) {
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

  const catalogTags = uniqueValues(item.subcategoryIds).map((subcategoryId) => {
    const subcategory = recommendationSubcategoryById[subcategoryId];
    if (!subcategory) return '';
    return subcategory.isOther && item.customSubcategoryLabel
      ? item.customSubcategoryLabel
      : subcategory.label;
  }).filter(Boolean);

  return {
    facts,
    tags: catalogTags.length ? catalogTags : uniqueValues(item.tags).map(getTagLabel).filter(Boolean),
    needs: labelsFor(facets.needs, NEEDS),
    extras,
  };
}
