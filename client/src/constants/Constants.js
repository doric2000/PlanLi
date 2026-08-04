import {
  CATEGORIES,
  POST_BUDGETS,
  TAG_OPTIONS_BY_CATEGORY,
} from './travelTaxonomy';

// Backward-compatible display exports. Taxonomy data itself is generated from
// shared/travelTaxonomy.json and must not be duplicated in this module.
export const PARENT_CATEGORIES = CATEGORIES;
export { TAG_OPTIONS_BY_CATEGORY };
export const TAGS_BY_CATEGORY = Object.fromEntries(
  Object.entries(TAG_OPTIONS_BY_CATEGORY).map(([categoryId, options]) => [
    categoryId,
    options.map((option) => option.label),
  ])
);

export { POST_BUDGETS };
export const PRICE_TAGS = POST_BUDGETS.map((option) => option.postLabel);
