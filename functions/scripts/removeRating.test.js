const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseArgs,
  scanRatingFields,
  stripRatingKeys,
} = require('./removeRating');

test('rating removal is dry-run unless --apply is explicit', () => {
  assert.deepEqual(parseArgs([]).apply, false);
  assert.equal(parseArgs(['--apply', '--limit', '25']).apply, true);
  assert.equal(parseArgs(['--apply', '--limit', '25']).limit, 25);
});

test('stripRatingKeys removes root, nested, and array rating properties', () => {
  const removed = [];
  const createdAt = new Date('2026-08-05T00:00:00.000Z');
  const cleaned = stripRatingKeys({
    rating: 4.8,
    createdAt,
    preview: { metrics: { rating: 0, travelers: 12 } },
    entries: [{ name: 'one', rating: 3 }, { name: 'two' }],
  }, [], removed);

  assert.deepEqual(cleaned, {
    createdAt,
    preview: { metrics: { travelers: 12 } },
    entries: [{ name: 'one' }, { name: 'two' }],
  });
  assert.deepEqual(removed.map((entry) => entry.path), [
    'rating',
    'preview.metrics.rating',
    'entries[0].rating',
  ]);
});

function snapshot(path, data) {
  const ref = { path };
  return {
    exists: true,
    ref,
    data: () => data,
    updateTime: null,
  };
}

test('scanRatingFields reports dry-run changes without writing', async () => {
  const documents = [
    snapshot('recommendations/one', { rating: 4, title: 'One' }),
    snapshot('recommendations/two', { title: 'Two' }),
    snapshot('users/u1/favorites/f1', {
      preview: { metrics: { rating: 5, travelers: 7 } },
    }),
  ];
  const firestore = {
    runTransaction: async () => assert.fail('dry-run must not write'),
  };

  const summary = await scanRatingFields({ firestore, documents });
  assert.equal(summary.documentsAffected, 2);
  assert.equal(summary.fieldsFound, 2);
  assert.equal(summary.fieldsRemoved, 0);
  assert.deepEqual(summary.byRootCollection, { recommendations: 1, users: 1 });
});

test('apply writes a manifest, removes fields, and is idempotent', async () => {
  const source = snapshot('countries/il/cities/tlv', {
    name: 'Tel Aviv',
    rating: 4.7,
    travelers: 9,
  });
  let currentData = source.data();
  let manifest = null;
  const firestore = {
    projectId: 'test-project',
    runTransaction: async (handler) => handler({
      get: async (ref) => snapshot(ref.path, currentData),
      set: (_ref, value) => { currentData = value; },
    }),
  };

  const applied = await scanRatingFields({
    firestore,
    documents: [source],
    apply: true,
    writeManifest: (value) => {
      manifest = value;
      return 'manifest.json';
    },
  });
  assert.equal(applied.fieldsRemoved, 1);
  assert.equal(applied.manifestPath, 'manifest.json');
  assert.equal(manifest.documents[0].removed[0].value, 4.7);
  assert.deepEqual(currentData, { name: 'Tel Aviv', travelers: 9 });

  const cleanSnapshot = snapshot(source.ref.path, currentData);
  const repeated = await scanRatingFields({
    firestore,
    documents: [cleanSnapshot],
    apply: true,
    writeManifest: () => assert.fail('clean rerun must not create a manifest'),
  });
  assert.equal(repeated.fieldsFound, 0);
  assert.equal(repeated.fieldsRemoved, 0);
});
