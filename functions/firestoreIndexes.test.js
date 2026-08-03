const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const indexesPath = path.join(__dirname, '..', 'firestore.indexes.json');

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
