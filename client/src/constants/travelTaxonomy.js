import taxonomy from './travelTaxonomy.generated.json';

const asOption = (item) => ({
  value: item.id,
  label: item.label,
  ...(item.helper ? { helper: item.helper } : {}),
});
const options = (key) => (taxonomy[key] || []).map(asOption);
const ids = (items) => new Set(items.map((item) => item.value));
const lookup = (items) => Object.fromEntries(items.map((item) => [item.value, item]));

export const INTERESTS = options('interests');
export const BUDGETS = options('budgets');
export const POST_BUDGETS = taxonomy.budgets
  .filter((item) => item.postApplicable)
  .map((item) => ({ ...asOption(item), postLabel: item.postLabel || item.label }));
export const TRAVEL_PARTIES = options('travelParties');
export const VIBES = options('vibes');
export const TRAVELER_STYLES = options('travelerStyles');
export const PACES = options('paces');
export const NEEDS = options('needs');
export const SEASONS = options('seasons');
export const ENVIRONMENTS = options('environments');
export const ROUTE_DIFFICULTIES = options('routeDifficulties');
export const ROUTE_EXPERIENCE_LEVELS = options('routeExperienceLevels');
export const TRANSPORT_MODES = options('transportModes');
export const SERVICE_GROUPS = options('serviceGroups');
export const CATEGORIES = taxonomy.categories.map((item) => ({
  id: item.id,
  value: item.id,
  label: item.label,
  icon: item.icon,
  interests: [...(item.interests || [])],
}));
export const TAGS = taxonomy.tags.map((item) => ({
  ...item,
  interests: [...(item.interests || [])],
  vibes: [...(item.vibes || [])],
  travelerStyles: [...(item.travelerStyles || [])],
  seasons: [...(item.seasons || [])],
  environments: [...(item.environments || [])],
}));

export const TAG_OPTIONS_BY_CATEGORY = Object.fromEntries(CATEGORIES.map((category) => [
  category.id,
  TAGS.filter((tag) => tag.categoryId === category.id && tag.selectable !== false),
]));
export const SERVICE_TAG_OPTIONS_BY_GROUP = Object.fromEntries(SERVICE_GROUPS.map((group) => [
  group.value,
  TAGS.filter((tag) => tag.categoryId === 'services' && tag.groupId === group.value),
]));

const interestIds = ids(INTERESTS);
const budgetById = lookup(BUDGETS);
const categoryById = Object.fromEntries(CATEGORIES.map((item) => [item.id, item]));
const categoryIdByLabel = Object.fromEntries(CATEGORIES.map((item) => [item.label, item.id]));
const tagById = Object.fromEntries(TAGS.map((tag) => [tag.id, tag]));
const tagIdByAlias = {
  ...Object.fromEntries(TAGS.map((tag) => [tag.label, tag.id])),
  ...(taxonomy.legacy?.tagAliases || {}),
};

function normalizeFromOptions(value, optionList, aliases = {}) {
  const text = typeof value === 'string' ? value.trim() : '';
  const allowed = new Set(optionList.map((item) => item.value));
  if (allowed.has(text)) return text;
  return allowed.has(aliases[text]) ? aliases[text] : '';
}

export function normalizeBudgetId(value, { allowFlexible = true } = {}) {
  const normalized = budgetById[value]?.value || taxonomy.legacy?.budgetAliases?.[String(value || '').trim()] || '';
  return normalized === 'flexible' && !allowFlexible ? '' : normalized;
}

export function getBudgetLabel(value, { forPost = true } = {}) {
  const option = budgetById[normalizeBudgetId(value)];
  if (!option) return typeof value === 'string' ? value : '';
  const source = taxonomy.budgets.find((item) => item.id === option.value);
  return forPost ? source?.postLabel || option.label : option.label;
}

export function normalizeCategoryId(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  return categoryById[text]
    ? text
    : categoryIdByLabel[text] || taxonomy.legacy?.categoryAliases?.[text] || '';
}

export function getCategoryLabel(value) {
  return categoryById[normalizeCategoryId(value)]?.label || (typeof value === 'string' ? value : '');
}

export function analyzeTagValues(values) {
  const result = {
    tagIds: [], interests: [], vibes: [], travelerStyles: [], needs: [], audiences: [], seasons: [], environments: [],
  };
  let budgetLevel = '';
  let recognized = true;
  for (const raw of Array.isArray(values) ? values : []) {
    const value = typeof raw === 'string' ? raw.trim() : '';
    const tag = tagById[tagById[value] ? value : tagIdByAlias[value]];
    if (tag) {
      result.tagIds.push(tag.id);
      for (const field of ['interests', 'vibes', 'travelerStyles', 'needs', 'audiences', 'seasons', 'environments']) {
        result[field].push(...(tag[field] || []));
      }
      continue;
    }
    const attribute = taxonomy.legacy?.attributeTagAliases?.[value];
    if (attribute) {
      if (attribute.interest) result.interests.push(attribute.interest);
      if (attribute.travelerStyle) result.travelerStyles.push(attribute.travelerStyle);
      if (attribute.season) result.seasons.push(attribute.season);
      if (attribute.environment) result.environments.push(attribute.environment);
      continue;
    }
    if ((taxonomy.legacy?.ignoredTagAliases || []).includes(value)) continue;
    const legacyNeeds = taxonomy.legacy?.tagNeeds?.[value];
    const legacyAudiences = taxonomy.legacy?.tagAudiences?.[value];
    const legacyBudget = taxonomy.legacy?.tagBudgets?.[value];
    if (legacyNeeds) result.needs.push(...legacyNeeds);
    else if (legacyAudiences) result.audiences.push(...legacyAudiences);
    else if (legacyBudget) budgetLevel ||= legacyBudget;
    else recognized = false;
  }
  return {
    recognized,
    ...Object.fromEntries(Object.entries(result).map(([key, entries]) => [key, Array.from(new Set(entries))])),
    budgetLevel,
  };
}

export const normalizeTagIds = (values) => analyzeTagValues(values).tagIds;

export function getTagLabel(value) {
  const id = tagById[value] ? value : tagIdByAlias[value];
  return tagById[id]?.label || (typeof value === 'string' ? value : '');
}

export function suggestedInterestIds(categoryId, tags = []) {
  const categoryInterests = categoryById[normalizeCategoryId(categoryId)]?.interests || [];
  return Array.from(new Set([...categoryInterests, ...analyzeTagValues(tags).interests]))
    .filter((value) => interestIds.has(value))
    .slice(0, 8);
}

export const normalizeRouteDifficultyId = (value) => normalizeFromOptions(
  value, ROUTE_DIFFICULTIES, taxonomy.legacy?.routeDifficultyAliases
);
export const normalizeRouteExperienceId = (value) => normalizeFromOptions(
  value, ROUTE_EXPERIENCE_LEVELS, taxonomy.legacy?.routeExperienceAliases
);
export const normalizeTransportModeId = (value) => normalizeFromOptions(
  value, TRANSPORT_MODES, taxonomy.legacy?.transportModeAliases
);

export function getOptionLabel(optionList, value) {
  return optionList.find((item) => item.value === value)?.label || String(value || '');
}

export const TRAVEL_TAXONOMY_VERSION = taxonomy.version;
export const TRAVEL_TAXONOMY = taxonomy;
