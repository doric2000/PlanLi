const assert = require('node:assert/strict');
const test = require('node:test');

const {
  collectionShape,
  credentialReferencesForDocument,
  summarizeFindings,
} = require('./auditLiveCredentialReferencesRest');

function fakeGcpKey() {
  return ['AI', 'za', 'A'.repeat(35)].join('');
}

test('reports only collection shape, field and credential kind', () => {
  const document = {
    name: 'projects/planli-f0b12/databases/(default)/documents/countries/IL/cities/private-id',
    fields: {
      imageUrl: { stringValue: `https://maps.googleapis.test/photo?key=${fakeGcpKey()}` },
      nested: { mapValue: { fields: { safe: { stringValue: 'value' } } } },
    },
  };
  const findings = credentialReferencesForDocument(document);
  assert.deepEqual(findings, [{
    collectionShape: 'countries/*/cities', field: 'imageUrl', kind: 'gcp-api-key',
  }]);
  assert.equal(JSON.stringify(findings).includes('private-id'), false);
  assert.equal(JSON.stringify(findings).includes('AIza'), false);
});

test('normalizes nested document ids and groups duplicate findings', () => {
  assert.equal(collectionShape(
    'projects/p/databases/(default)/documents/users/uid/favorites/favorite-id'
  ), 'users/*/favorites');
  assert.deepEqual(summarizeFindings([
    { collectionShape: 'countries/*/cities', field: 'imageUrl', kind: 'gcp-api-key' },
    { collectionShape: 'countries/*/cities', field: 'imageUrl', kind: 'gcp-api-key' },
  ]), [{ collectionShape: 'countries/*/cities', field: 'imageUrl', kind: 'gcp-api-key', count: 2 }]);
});
