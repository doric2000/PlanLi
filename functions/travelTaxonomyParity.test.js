const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('client and Functions generated taxonomies match the canonical source', () => {
  const read = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const root = path.resolve(__dirname, '..');
  const canonical = read(path.join(root, 'shared', 'travelTaxonomy.json'));
  const functionsCopy = read(path.join(__dirname, 'travelTaxonomy.generated.json'));
  const clientCopy = read(path.join(root, 'client', 'src', 'constants', 'travelTaxonomy.generated.json'));
  assert.deepEqual(functionsCopy, canonical);
  assert.deepEqual(clientCopy, canonical);
});

test('every selectable tag maps to at least one facet or is explicitly display-only', () => {
  const taxonomy = require('./travelTaxonomy.generated.json');
  for (const tag of taxonomy.tags.filter((item) => item.selectable !== false)) {
    const mapped = ['interests', 'audiences', 'vibes', 'travelerStyles', 'needs', 'seasons', 'environments']
      .some((field) => Array.isArray(tag[field]) && tag[field].length > 0);
    assert.ok(mapped || tag.displayOnly === true, `${tag.id} is neither mapped nor displayOnly`);
  }
});

test('taxonomy IDs and cross-references are unique and valid', () => {
  const taxonomy = require('./travelTaxonomy.generated.json');
  const specifications = [
    ['interests', taxonomy.interests],
    ['budgets', taxonomy.budgets],
    ['travelParties', taxonomy.travelParties],
    ['vibes', taxonomy.vibes],
    ['travelerStyles', taxonomy.travelerStyles],
    ['paces', taxonomy.paces],
    ['needs', taxonomy.needs],
    ['seasons', taxonomy.seasons],
    ['environments', taxonomy.environments],
    ['routeDifficulties', taxonomy.routeDifficulties],
    ['routeExperienceLevels', taxonomy.routeExperienceLevels],
    ['transportModes', taxonomy.transportModes],
    ['categories', taxonomy.categories],
    ['tags', taxonomy.tags],
  ];
  for (const [name, items] of specifications) {
    assert.equal(new Set(items.map((item) => item.id)).size, items.length, `${name} IDs must be unique`);
  }
  const allowed = {
    interests: new Set(taxonomy.interests.map((item) => item.id)),
    audiences: new Set(taxonomy.travelParties.map((item) => item.id)),
    vibes: new Set(taxonomy.vibes.map((item) => item.id)),
    needs: new Set(taxonomy.needs.map((item) => item.id)),
    travelerStyles: new Set(taxonomy.travelerStyles.map((item) => item.id)),
    seasons: new Set(taxonomy.seasons.map((item) => item.id)),
    environments: new Set(taxonomy.environments.map((item) => item.id)),
  };
  const categoryIds = new Set(taxonomy.categories.map((item) => item.id));
  for (const tag of taxonomy.tags) {
    assert.ok(categoryIds.has(tag.categoryId), `${tag.id} has an invalid categoryId`);
    for (const categoryId of tag.categoryIds || []) {
      assert.ok(categoryIds.has(categoryId), `${tag.id} has an invalid categoryIds entry`);
    }
    for (const [field, values] of Object.entries(allowed)) {
      for (const value of tag[field] || []) {
        assert.ok(values.has(value), `${tag.id}.${field} contains ${value}`);
      }
    }
  }
  for (const style of taxonomy.travelerStyles) {
    for (const interestId of style.relatedInterests || []) {
      assert.ok(allowed.interests.has(interestId), `${style.id}.relatedInterests contains ${interestId}`);
    }
  }
  const mappedInterests = new Set([
    ...taxonomy.categories.flatMap((item) => item.interests || []),
    ...taxonomy.tags.flatMap((item) => item.interests || []),
    ...taxonomy.travelerStyles.flatMap((item) => item.relatedInterests || []),
  ]);
  for (const interest of taxonomy.interests) {
    assert.ok(mappedInterests.has(interest.id), `${interest.id} is not mapped from any content category or subcategory`);
  }
});

test('recommendation attribute rules reference only canonical subcategories and needs', () => {
	const taxonomy = require('./travelTaxonomy.generated.json');
	assert.equal(taxonomy.version, 5);
	const tagIds = new Set(taxonomy.tags.map((tag) => tag.id));
	const needIds = new Set(taxonomy.needs.map((need) => need.id));
	const rules = taxonomy.contentAttributeRules?.recommendations;
	assert.ok(rules);
	for (const tagId of [...rules.vibeTagIds, ...rules.environmentTagIds]) {
		assert.ok(tagIds.has(tagId), `attribute rules contain unknown tag ${tagId}`);
	}
	for (const [needId, supportedTags] of Object.entries(rules.needTagIds || {})) {
		assert.ok(needIds.has(needId), `attribute rules contain unknown need ${needId}`);
		for (const tagId of supportedTags) {
			assert.ok(tagIds.has(tagId), `${needId} references unknown tag ${tagId}`);
		}
	}
});

test('prepared recommendation catalog is complete, ordered, and inactive', () => {
  const taxonomy = require('./travelTaxonomy.generated.json');
  const catalog = taxonomy.recommendationCatalog;
  assert.equal(taxonomy.version, 5);
  assert.equal(catalog.schemaVersion, 1);
  assert.equal(catalog.runtimeEnabled, false);
  assert.equal(catalog.categories.length, 10);
  assert.equal(catalog.subcategories.length, 166);
  assert.equal(catalog.interests.length, 8);

  const categoryIds = new Set(catalog.categories.map((item) => item.id));
  const subcategoryIds = new Set(catalog.subcategories.map((item) => item.id));
  const interestIds = new Set(catalog.interests.map((item) => item.id));
  const serviceGroupIds = new Set(catalog.serviceGroups.map((item) => item.id));
  assert.equal(categoryIds.size, catalog.categories.length);
  assert.equal(subcategoryIds.size, catalog.subcategories.length);
  assert.equal(interestIds.size, catalog.interests.length);

  for (const category of catalog.categories) {
    assert.equal(category.popularSubcategoryIds.length, 6, `${category.id} must expose six popular items`);
    assert.equal(new Set(category.popularSubcategoryIds).size, 6, `${category.id} popular items must be unique`);
    for (const id of category.popularSubcategoryIds) {
      const item = catalog.subcategories.find((subcategory) => subcategory.id === id);
      assert.equal(item?.categoryId, category.id, `${category.id} contains invalid popular item ${id}`);
      assert.notEqual(item?.isOther, true, `${category.id} cannot expose Other as popular`);
    }
    const otherItems = catalog.subcategories.filter((item) => item.categoryId === category.id && item.isOther);
    assert.equal(otherItems.length, 1, `${category.id} must contain exactly one Other item`);
    assert.equal(otherItems[0].requiresCustomLabel, true);
    assert.equal(otherItems[0].requiresModeration, true);
  }

  for (const item of catalog.subcategories) {
    assert.ok(categoryIds.has(item.categoryId), `${item.id} has invalid categoryId`);
    assert.ok(Number.isInteger(item.order) && item.order > 0, `${item.id} has invalid order`);
    assert.ok(Array.isArray(item.searchAliases), `${item.id} is missing searchAliases`);
    assert.ok(Array.isArray(item.interestIds), `${item.id} is missing interestIds`);
    assert.equal(Object.hasOwn(item, 'vibes'), false, `${item.id} must not map vibes`);
    assert.equal(Object.hasOwn(item, 'environments'), false, `${item.id} must not map environments`);
    for (const interestId of item.interestIds) {
      assert.ok(interestIds.has(interestId), `${item.id} references invalid interest ${interestId}`);
    }
    if (item.categoryId === 'services') {
      assert.ok(serviceGroupIds.has(item.groupId), `${item.id} has invalid service group`);
    } else {
      assert.equal(item.groupId, undefined, `${item.id} unexpectedly has a service group`);
    }
  }
});

test('prepared catalog provider and legacy mappings target valid items', () => {
  const taxonomy = require('./travelTaxonomy.generated.json');
  const catalog = taxonomy.recommendationCatalog;
  const categoryIds = new Set(catalog.categories.map((item) => item.id));
  const subcategoryById = Object.fromEntries(catalog.subcategories.map((item) => [item.id, item]));

  for (const [providerType, candidates] of Object.entries(catalog.googlePlaceTypeMappings)) {
    assert.ok(candidates.length > 0, `${providerType} has no candidates`);
    for (const candidate of candidates) {
      assert.ok(categoryIds.has(candidate.categoryId), `${providerType} has invalid category`);
      assert.ok(candidate.subcategoryIds.length > 0, `${providerType} has no subcategories`);
      for (const id of candidate.subcategoryIds) {
        assert.equal(subcategoryById[id]?.categoryId, candidate.categoryId, `${providerType} targets invalid ${id}`);
        assert.notEqual(subcategoryById[id]?.isOther, true, `${providerType} must not suggest Other`);
      }
    }
  }

  assert.deepEqual(
    Object.keys(catalog.legacyTagMappings).sort(),
    taxonomy.tags.map((item) => item.id).sort(),
    'every active tag must have exactly one transition policy'
  );
  for (const [legacyId, mapping] of Object.entries(catalog.legacyTagMappings)) {
    assert.ok(['direct', 'review', 'attribute'].includes(mapping.strategy), `${legacyId} has invalid strategy`);
    for (const id of [...(mapping.subcategoryIds || []), ...(mapping.candidateSubcategoryIds || [])]) {
      assert.ok(subcategoryById[id], `${legacyId} targets unknown ${id}`);
    }
    if (mapping.strategy === 'review') assert.ok(mapping.candidateSubcategoryIds?.length > 1);
    if (mapping.strategy === 'attribute') assert.ok(mapping.targetFacet && mapping.requiresReview === true);
  }
});

test('active taxonomy contract remains unchanged while the new catalog is prepared', () => {
  const taxonomy = require('./travelTaxonomy.generated.json');
  assert.equal(taxonomy.version, 5);
  assert.deepEqual(
    taxonomy.categories.map((item) => item.id),
    ['food', 'nature', 'culture', 'activities', 'shopping', 'stay', 'transportation', 'services']
  );
  assert.equal(taxonomy.tags.length, 68);
  assert.equal(taxonomy.interests.length, 25);
});
