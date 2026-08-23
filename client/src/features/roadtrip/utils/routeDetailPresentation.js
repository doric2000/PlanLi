import {
  CATEGORIES,
  NEEDS,
  PACES,
  ROUTE_DIFFICULTIES,
  ROUTE_EXPERIENCE_LEVELS,
  SEASONS,
  TRANSPORT_MODES,
  TRAVELER_STYLES,
  TRAVEL_PARTIES,
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
  const budgetLabel = getBudgetLabel(facets.budgetLevel || route?.attributes?.budgetLevel || '');
  const facts = [
    budgetLabel ? {
      id: 'budget', icon: 'payments', title: 'מחיר', value: budgetLabel,
    } : null,
    route?.priceNote ? {
      id: 'priceNote', icon: 'receipt-long', title: 'הערת מחיר', value: route.priceNote,
    } : null,
    route?.transportModes?.length ? {
      id: 'transport', icon: 'directions-car', title: 'התניידות', value: labels(TRANSPORT_MODES, route.transportModes).join(' · '),
    } : null,
    route?.pace ? {
      id: 'pace', icon: 'speed', title: 'קצב', value: getOptionLabel(PACES, route.pace),
    } : null,
    audienceValues.length ? {
      id: 'audiences', icon: 'groups', title: 'למי מתאים', value: audienceValues.join(' · '),
    } : null,
    facets.seasons?.length ? {
      id: 'seasons', icon: 'wb-sunny', title: 'עונות מתאימות', value: labels(SEASONS, facets.seasons).join(' · '),
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
    { id: 'travelerStyles', icon: 'explore', title: 'סגנון טיול', values: labels(TRAVELER_STYLES, facets.travelerStyles) },
  ].filter((group) => group.values.length);

  const needs = facets.needsScope === 'entire_route'
    ? labels(NEEDS, facets.needs)
    : [];

  return { facts, tags, extras, needs };
}
