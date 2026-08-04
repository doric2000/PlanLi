import taxonomy from './travelTaxonomy.generated.json';

const asOption = (item) => ({ value: item.id, label: item.label, ...(item.helper ? { helper: item.helper } : {}) });

export const INTERESTS = taxonomy.interests.map(asOption);
export const BUDGETS = taxonomy.budgets.map(asOption);
export const POST_BUDGETS = taxonomy.budgets
  .filter((item) => item.postApplicable)
  .map((item) => ({ ...asOption(item), postLabel: item.postLabel || item.label }));
export const TRAVEL_PARTIES = taxonomy.travelParties.map(asOption);
export const VIBES = taxonomy.vibes.map(asOption);
export const NEEDS = taxonomy.needs.map(asOption);
export const CATEGORIES = taxonomy.categories.map((item) => ({
  id: item.id,
  label: item.label,
  icon: item.icon,
  interests: [...(item.interests || [])],
}));
export const TAGS = taxonomy.tags.map((item) => ({
  ...item,
  interests: [...(item.interests || [])],
  vibes: [...(item.vibes || [])],
}));

export const TAG_OPTIONS_BY_CATEGORY = Object.fromEntries(CATEGORIES.map((category) => [
  category.id,
  TAGS.filter((tag) => (
    tag.categoryId === category.id || tag.categoryIds?.includes(category.id)
  ) && tag.selectable !== false),
]));

const interestIds = new Set(INTERESTS.map((item) => item.value));
const tagById = Object.fromEntries(TAGS.map((tag) => [tag.id, tag]));
const tagIdByAlias = {
  ...Object.fromEntries(TAGS.map((tag) => [tag.label, tag.id])),
  ...(taxonomy.legacy?.tagAliases || {}),
};
const budgetById = Object.fromEntries(taxonomy.budgets.map((item) => [item.id, item]));
const categoryById = Object.fromEntries(CATEGORIES.map((item) => [item.id, item]));
const categoryIdByLabel = Object.fromEntries(CATEGORIES.map((item) => [item.label, item.id]));

export function normalizeBudgetId(value, { allowFlexible = true } = {}) {
  const text = typeof value === 'string' ? value.trim() : '';
  const normalized = budgetById[text] ? text : taxonomy.legacy?.budgetAliases?.[text] || '';
  return normalized === 'flexible' && !allowFlexible ? '' : normalized;
}

export function getBudgetLabel(value, { forPost = true } = {}) {
  const id = normalizeBudgetId(value);
  const option = budgetById[id];
  if (!option) return typeof value === 'string' ? value : '';
  return forPost ? option.postLabel || option.label : option.label;
}

export function normalizeCategoryId(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  return categoryById[text] ? text : categoryIdByLabel[text] || '';
}

export function getCategoryLabel(value) {
  const id = normalizeCategoryId(value);
  return categoryById[id]?.label || (typeof value === 'string' ? value : '');
}

export function analyzeTagValues(values) {
  const tagIds = [];
  const interests = [];
  const vibes = [];
  const needs = [];
  const audiences = [];
  let budgetLevel = '';
  let recognized = true;

  for (const raw of Array.isArray(values) ? values : []) {
    const value = typeof raw === 'string' ? raw.trim() : '';
    const tagId = tagById[value] ? value : tagIdByAlias[value];
    const tag = tagById[tagId];
    if (tag) {
      tagIds.push(tag.id);
      interests.push(...tag.interests);
      vibes.push(...tag.vibes);
      continue;
    }
    const legacyNeeds = taxonomy.legacy?.tagNeeds?.[value];
    const legacyAudiences = taxonomy.legacy?.tagAudiences?.[value];
    const legacyBudget = taxonomy.legacy?.tagBudgets?.[value];
    if (legacyNeeds) needs.push(...legacyNeeds);
    else if (legacyAudiences) audiences.push(...legacyAudiences);
    else if (legacyBudget) budgetLevel ||= legacyBudget;
    else recognized = false;
  }

  return {
    recognized,
    tagIds: Array.from(new Set(tagIds)),
    interests: Array.from(new Set(interests)),
    vibes: Array.from(new Set(vibes)),
    needs: Array.from(new Set(needs)),
    audiences: Array.from(new Set(audiences)),
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
  const tagInterests = analyzeTagValues(tags).interests;
  return Array.from(new Set([...categoryInterests, ...tagInterests]))
    .filter((value) => interestIds.has(value))
    .slice(0, 5);
}

export const TRAVEL_TAXONOMY_VERSION = taxonomy.version;
export const TRAVEL_TAXONOMY = taxonomy;
