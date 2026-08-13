const test = require('node:test');
const assert = require('node:assert/strict');

const {
  migrateBudgetTaxonomy,
  parseArgs,
} = require('./migrateBudgetTaxonomyV5');

function snapshot(path, data) {
  return { exists: true, ref: { path }, data: () => data, updateTime: null };
}

function applyPatch(data, patch) {
  const next = structuredClone(data);
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'facets.budgetLevel') {
      next.facets = { ...(next.facets || {}), budgetLevel: value };
    } else next[key] = value;
  }
  return next;
}

test('budget taxonomy migration is dry-run by default and rollback is explicit', () => {
  assert.deepEqual(parseArgs([]).apply, false);
  assert.equal(parseArgs(['--apply']).apply, true);
  assert.match(parseArgs(['--rollback', 'checkpoint.json']).rollback, /checkpoint\.json$/);
  assert.throws(() => parseArgs(['--apply', '--rollback', 'checkpoint.json']), /either/);
});

test('dry-run reports the three confirmed legacy classifications without writing', async () => {
  const documents = [
    snapshot('recommendations/rec_61tU4Xxoyq9t8VRYlzGO', {
      status: 'active', taxonomyVersion: 4, budget: 'economy', facets: { budgetLevel: 'economy' },
    }),
    snapshot('recommendations/u47NkbLeexff2Qzd9XRD', {
      status: 'active', taxonomyVersion: 4, budget: 'economy', facets: { budgetLevel: 'economy' },
    }),
    snapshot('routes/ALhlBaDf39KdZ8uwZyBE', {
      status: 'active', taxonomyVersion: 4, facets: { budgetLevel: 'economy' },
    }),
  ];
  const summary = await migrateBudgetTaxonomy({
    firestore: { runTransaction: async () => assert.fail('dry-run must not write') },
    documents,
  });
  assert.equal(summary.documentsAffected, 3);
  assert.deepEqual(summary.budgetChanges.map(({ path, to }) => ({ path, to })), [
    { path: 'recommendations/rec_61tU4Xxoyq9t8VRYlzGO', to: 'economy' },
    { path: 'recommendations/u47NkbLeexff2Qzd9XRD', to: 'free' },
    { path: 'routes/ALhlBaDf39KdZ8uwZyBE', to: 'free' },
  ]);
});

test('migration refuses an unclassified legacy economy document', async () => {
  await assert.rejects(
    migrateBudgetTaxonomy({
      firestore: {},
      documents: [snapshot('recommendations/unclassified', {
        status: 'active', taxonomyVersion: 4, budget: 'economy', facets: { budgetLevel: 'economy' },
      })],
    }),
    /Unclassified legacy economy content/
  );
});

test('apply upgrades versions, keeps recommendation budget fields consistent, and is idempotent', async () => {
  let data = {
    status: 'active', taxonomyVersion: 4, budget: 'economy',
    facets: { budgetLevel: 'economy' }, updatedAt: 'unchanged', stats: { likeCount: 7 },
  };
  const ref = { path: 'recommendations/u47NkbLeexff2Qzd9XRD' };
  const firestore = {
    projectId: 'test-project',
    runTransaction: async (handler) => handler({
      get: async () => snapshot(ref.path, data),
      update: (_ref, patch) => { data = applyPatch(data, patch); },
    }),
  };
  let manifest;
  const first = await migrateBudgetTaxonomy({
    firestore,
    documents: [snapshot(ref.path, data)],
    apply: true,
    writeManifest: (value) => { manifest = value; return 'checkpoint.json'; },
  });
  assert.equal(first.applied, 1);
  assert.equal(data.taxonomyVersion, 5);
  assert.equal(data.budget, 'free');
  assert.equal(data.facets.budgetLevel, 'free');
  assert.equal(data.updatedAt, 'unchanged');
  assert.deepEqual(data.stats, { likeCount: 7 });
  assert.equal(manifest.documents[0].before.budget, 'economy');

  const second = await migrateBudgetTaxonomy({
    firestore,
    documents: [snapshot(ref.path, data)],
    apply: true,
    writeManifest: () => assert.fail('idempotent rerun must not write a checkpoint'),
  });
  assert.equal(second.documentsAffected, 0);
});
