const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const indexesPath = path.join(__dirname, '..', 'firestore.indexes.json');

function fieldSignature(index) {
  return index.fields.map((field) => (
    `${field.fieldPath}:${field.order || field.arrayConfig}`
  )).join('|');
}

test('cities.status has a collection-group ascending index', () => {
  const config = JSON.parse(fs.readFileSync(indexesPath, 'utf8'));
  const override = config.fieldOverrides.find((entry) => (
    entry.collectionGroup === 'cities' && entry.fieldPath === 'status'
  ));

  assert.ok(override, 'Missing field override for cities.status');
  assert.ok(
    override.indexes.some((index) => (
      index.order === 'ASCENDING' && index.queryScope === 'COLLECTION_GROUP'
    )),
    'cities.status must support ascending collection-group queries'
  );
});

test('personalized recommendation candidate queries have global and destination indexes', () => {
  const config = JSON.parse(fs.readFileSync(indexesPath, 'utf8'));
  const recommendationIndexes = config.indexes
    .filter((entry) => entry.collectionGroup === 'recommendations')
    .map(fieldSignature);

  assert.ok(recommendationIndexes.includes(
    'status:ASCENDING|facets.interests:CONTAINS|createdAt:DESCENDING'
  ));
  assert.ok(recommendationIndexes.includes(
    'destination.countryId:ASCENDING|destination.cityId:ASCENDING|status:ASCENDING|stats.likeCount:DESCENDING'
  ));
  assert.ok(recommendationIndexes.includes(
    'destination.countryId:ASCENDING|destination.cityId:ASCENDING|status:ASCENDING|facets.interests:CONTAINS|createdAt:DESCENDING'
  ));
  assert.ok(recommendationIndexes.includes(
    'status:ASCENDING|search.prefixes:CONTAINS'
  ));
  assert.ok(recommendationIndexes.includes(
    'status:ASCENDING|mapLocation.geohash:ASCENDING'
  ));
  assert.ok(recommendationIndexes.includes(
    'destination.countryId:ASCENDING|destination.cityId:ASCENDING|status:ASCENDING|search.prefixes:CONTAINS'
  ));
});

test('route discovery candidate queries have search, facet, quality and destination indexes', () => {
  const config = JSON.parse(fs.readFileSync(indexesPath, 'utf8'));
  const routeIndexes = config.indexes
    .filter((entry) => entry.collectionGroup === 'routes')
    .map(fieldSignature);

  for (const signature of [
    'status:ASCENDING|stats.likeCount:DESCENDING',
    'status:ASCENDING|search.prefixes:CONTAINS',
    'status:ASCENDING|facets.interests:CONTAINS',
    'status:ASCENDING|destinationKeys:CONTAINS|createdAt:DESCENDING',
    'status:ASCENDING|destinationKeys:CONTAINS|stats.likeCount:DESCENDING',
  ]) assert.ok(routeIndexes.includes(signature), `Missing route index: ${signature}`);
});
