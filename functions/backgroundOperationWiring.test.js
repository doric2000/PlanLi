const test = require('node:test');
const assert = require('node:assert/strict');
const functions = require('./index');
const indexes = require('../firestore.indexes.json');
const { MEDIA_EMAIL } = require('./scripts/configureFunctionServiceAccounts');

test('background retry uses the Auth-capable media identity and workers bind provider secrets', () => {
  assert.equal(functions.retryBackgroundOperation.__endpoint.serviceAccountEmail, MEDIA_EMAIL);
  for (const name of ['onBackgroundOperationWritten', 'maintainBackgroundOperationsScheduled']) {
    const endpoint = functions[name].__endpoint;
    assert.equal(endpoint.serviceAccountEmail, MEDIA_EMAIL);
    assert.deepEqual(endpoint.secretEnvironmentVariables.map(({ key }) => key).sort(),
      ['PUBLIC_RATE_LIMIT_KEY', 'REST_COUNTRIES_KEY']);
  }
});

test('prepared media references and recursive operation retention have their query indexes', () => {
  for (const collectionGroup of ['stops', 'items']) {
    const field = indexes.fieldOverrides.find((entry) => entry.collectionGroup === collectionGroup
      && entry.fieldPath === 'mediaCleanupKeys');
    assert(field?.indexes.some((index) => index.arrayConfig === 'CONTAINS' && index.queryScope === 'COLLECTION_GROUP'));
  }
  const cleanup = indexes.fieldOverrides.find((entry) => entry.collectionGroup === 'jobs' && entry.fieldPath === 'cleanupAfter');
  assert.notEqual(cleanup.ttl, true);
  assert(cleanup.indexes.some((index) => index.order === 'ASCENDING' && index.queryScope === 'COLLECTION'));
  assert.equal(indexes.fieldOverrides.find((entry) => entry.collectionGroup === 'jobs' && entry.fieldPath === 'expireAt').ttl, true);
});
