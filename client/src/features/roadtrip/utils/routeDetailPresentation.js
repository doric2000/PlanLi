import {
  CATEGORIES,
  ENVIRONMENTS,
  NEEDS,
  PACES,
  ROUTE_DIFFICULTIES,
  ROUTE_EXPERIENCE_LEVELS,
  SEASONS,
  TRANSPORT_MODES,
  TRAVELER_STYLES,
  TRAVEL_PARTIES,
  VIBES,
  getBudgetLabel,
  getOptionLabel,
  getTagLabel,
} from '../../../constants/travelTaxonomy';

const labels = (options, values) => (Array.isArray(values) ? values : [])
  .map((value) => getOptionLabel(options, value))
  .filter(Boolean);

const unique = (values) => Array.from(new Set(values.filter(Boolean)));

export function buildRouteDetailPresentation(route) {
  const facets = route?.facets || {};
  const audienceValues = facets.audienceScope === 'all'
    ? ['מתאים לכולם']
    : labels(TRAVEL_PARTIES, facets.audiences);
  const facts = [
    facets.budgetLevel ? {
      id: 'budget', icon: 'payments', title: 'רמת מחיר', value: getBudgetLabel(facets.budgetLevel),
    } : null,
    audienceValues.length ? {
      id: 'audiences', icon: 'groups', title: 'למי מתאים', value: audienceValues.join(' · '),
    } : null,
    facets.vibes?.length ? {
      id: 'vibes', icon: 'sentiment-satisfied-alt', title: 'אווירה', value: labels(VIBES, facets.vibes).join(' · '),
    } : null,
    facets.environments?.length ? {
      id: 'environment', icon: 'landscape', title: 'סביבה', value: labels(ENVIRONMENTS, facets.environments).join(' · '),
    } : null,
  ].filter((fact) => fact?.value);

  const categoryLabels = (route?.categoryIds || [])
    .map((id) => CATEGORIES.find((option) => option.id === id)?.label)
    .filter(Boolean);
  const tags = unique([
    ...categoryLabels,
    ...(route?.subcategoryIds || []).map(getTagLabel),
  ]);
  const extras = [
    { id: 'difficulty', icon: 'terrain', title: 'רמת קושי', values: route?.difficulty
      ? [getOptionLabel(ROUTE_DIFFICULTIES, route.difficulty)]
      : [] },
    { id: 'experience', icon: 'hiking', title: 'ניסיון נדרש', values: route?.experienceLevel
      ? [getOptionLabel(ROUTE_EXPERIENCE_LEVELS, route.experienceLevel)]
      : [] },
    { id: 'transport', icon: 'directions-car', title: 'התניידות', values: labels(TRANSPORT_MODES, route?.transportModes) },
    { id: 'pace', icon: 'speed', title: 'קצב', values: route?.pace ? [getOptionLabel(PACES, route.pace)] : [] },
    { id: 'seasons', icon: 'wb-sunny', title: 'עונות מתאימות', values: labels(SEASONS, facets.seasons) },
    { id: 'travelerStyles', icon: 'explore', title: 'סגנון טיול', values: labels(TRAVELER_STYLES, facets.travelerStyles) },
  ].filter((group) => group.values.length);

  const needs = facets.needsScope === 'entire_route'
    ? labels(NEEDS, facets.needs)
    : [];

  return { facts, tags, extras, needs };
}
