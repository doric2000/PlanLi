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

test('destinations.status has a collection-group ascending index', () => {
  const config = JSON.parse(fs.readFileSync(indexesPath, 'utf8'));
  const override = config.fieldOverrides.find((entry) => (
    entry.collectionGroup === 'destinations' && entry.fieldPath === 'status'
  ));

  assert.ok(override, 'Missing field override for destinations.status');
  assert.ok(
    override.indexes.some((index) => (
      index.order === 'ASCENDING' && index.queryScope === 'COLLECTION_GROUP'
    )),
    'destinations.status must support ascending collection-group queries'
  );
});

test('destination image jobs have a state index', () => {
  const config = JSON.parse(fs.readFileSync(indexesPath, 'utf8'));
  const override = config.fieldOverrides.find((entry) => (
    entry.collectionGroup === 'destinationJobs' && entry.fieldPath === 'imageSync.state'
  ));
  assert.ok(override?.indexes.some((index) => (
    index.order === 'ASCENDING' && index.queryScope === 'COLLECTION'
  )));
});

test('destination catalog indexes match every popular search query and stable ID tie-breaker', () => {
  const config = JSON.parse(fs.readFileSync(indexesPath, 'utf8'));
  const catalogIndexes = config.indexes
    .filter((entry) => entry.collectionGroup === 'destinationCatalog')
    .map(fieldSignature);

  for (const signature of [
    'status:ASCENDING|recommendationCount:DESCENDING|__name__:ASCENDING',
    'status:ASCENDING|search.prefixes:CONTAINS|recommendationCount:DESCENDING|__name__:ASCENDING',
    'countryId:ASCENDING|status:ASCENDING|recommendationCount:DESCENDING|__name__:ASCENDING',
    'countryId:ASCENDING|status:ASCENDING|search.prefixes:CONTAINS|recommendationCount:DESCENDING|__name__:ASCENDING',
    'countryId:ASCENDING|status:ASCENDING|destinationClass:ASCENDING',
  ]) assert.ok(catalogIndexes.includes(signature), `Missing destination catalog index: ${signature}`);
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

test('moderation queues and reporter cleanup have their required indexes', () => {
  const config = JSON.parse(fs.readFileSync(indexesPath, 'utf8'));
  const caseIndexes = config.indexes
    .filter((entry) => entry.collectionGroup === 'cases')
    .map(fieldSignature);
  assert.ok(caseIndexes.includes('status:ASCENDING|updatedAt:DESCENDING'));
  assert.ok(caseIndexes.includes('priority:ASCENDING|status:ASCENDING'));
  const reporterOverride = config.fieldOverrides.find((entry) => (
    entry.collectionGroup === 'reports' && entry.fieldPath === 'reporterId'
  ));
  assert.ok(reporterOverride?.indexes.some((index) => (
    index.order === 'ASCENDING' && index.queryScope === 'COLLECTION_GROUP'
  )));
  const destinationReviewIndexes = config.indexes
    .filter((entry) => entry.collectionGroup === 'destinationReviews')
    .map(fieldSignature);
  assert.ok(destinationReviewIndexes.includes('status:ASCENDING|updatedAt:DESCENDING'));
  const candidateExpiry = config.fieldOverrides.find((entry) => (
    entry.collectionGroup === 'imageCandidates' && entry.fieldPath === 'expireAt'
  ));
  assert.ok(candidateExpiry?.indexes.some((index) => (
    index.order === 'ASCENDING' && index.queryScope === 'COLLECTION_GROUP'
  )));
});
