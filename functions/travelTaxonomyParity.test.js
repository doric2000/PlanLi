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
