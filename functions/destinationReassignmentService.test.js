const test = require('node:test');
const assert = require('node:assert/strict');

const {
  STAGES,
  impactHash,
  migrateFavoritePage,
  migratedRecommendationCount,
  recommendationPatch,
  reassignmentJobId,
  residualReferenceStage,
  routePatch,
  startDestinationReassignment,
} = require('./destinationReassignmentService');

const source = { countryId: 'NI', cityId: 'rivas' };
const target = { countryId: 'NI', cityId: 'ometepe', countryName: 'ניקרגואה', cityName: 'אומטפה' };

test('preview hash is deterministic and changes with impact', () => {
  assert.deepEqual(STAGES, ['recommendations', 'routes', 'trips', 'favorites', 'finalize', 'complete']);
  const first = impactHash(source, target, { recommendations: 1, routes: 0, trips: 0 });
  assert.equal(first, impactHash(source, target, { recommendations: 1, routes: 0, trips: 0 }));
  assert.notEqual(first, impactHash(source, target, { recommendations: 2, routes: 0, trips: 0 }));
  assert.equal(reassignmentJobId(source, target), reassignmentJobId(source, target));
});

test('final recommendation stats use the frozen preview when worker counters race', () => {
  assert.equal(migratedRecommendationCount({
    preview: { counts: { recommendations: 3 } },
    updatedCounts: { recommendations: 1 },
  }), 3);
  assert.equal(migratedRecommendationCount({ updatedCounts: { recommendations: 2 } }), 2);
});

test('recommendation reassignment rebuilds search destination data', () => {
  const patch = recommendationPatch({
    title: 'Ojo de Agua', description: 'בריכה', categoryId: 'attraction',
    destination: { ...source, countryName: 'ניקרגואה', cityName: 'ריבס' },
  }, target);
  assert.deepEqual(patch.destination, target);
  assert.ok(patch.search.destinationTokens.includes('אומטפה'));
});

test('route reassignment deduplicates target and replaces its key', () => {
  const patch = routePatch({
    title: 'מסלול',
    destinations: [
      { ...source, cityName: 'ריבס' },
      target,
    ],
    destinationKeys: ['NI:*', 'NI:rivas', 'NI:ometepe'],
  }, source, target);
  assert.deepEqual(patch.destinationKeys, ['NI:*', 'NI:ometepe']);
  assert.deepEqual(patch.destinations, [target]);
});

function queryResult(empty) {
  return {
    where() { return this; },
    limit() { return this; },
    async get() { return { empty, docs: empty ? [] : [{}], size: empty ? 0 : 1 }; },
  };
}

test('final reference audit requeues the first collection that still points at the source', async () => {
  const db = {
    collection: (name) => queryResult(name !== 'recommendations'),
    collectionGroup: () => queryResult(true),
  };
  assert.equal(await residualReferenceStage(db, source), 'recommendations');

  const cleanDb = {
    collection: () => queryResult(true),
    collectionGroup: () => queryResult(true),
  };
  assert.equal(await residualReferenceStage(cleanDb, source), null);
});

test('favorite migration moves the hashed destination favorite and refreshes its preview', async () => {
  const sourcePath = 'countries/NI/destinations/rivas';
  const sourceFavoritePath = 'users/u1/favorites/source-hash';
  const documents = new Map([
    [sourceFavoritePath, {
      ownerId: 'u1', type: 'city', target: { type: 'city', path: sourcePath }, createdAt: 'OLD',
    }],
    ['countries/NI/destinations/ometepe', {
      status: 'active', name: 'אומטפה', countryName: 'ניקרגואה', createdAt: 'CITY_CREATED',
    }],
  ]);
  const ref = (path) => ({ path, id: path.split('/').at(-1) });
  const snapshot = (reference) => ({
    exists: documents.has(reference.path),
    data: () => documents.get(reference.path),
  });
  const favoriteDocument = { ref: ref(sourceFavoritePath), data: () => documents.get(sourceFavoritePath) };
  const db = {
    doc: ref,
    collectionGroup: () => ({
      where() { return this; },
      limit() { return this; },
      async get() { return { empty: false, docs: [favoriteDocument], size: 1 }; },
    }),
    runTransaction: async (callback) => callback({
      get: async (reference) => snapshot(reference),
      set: (reference, data) => documents.set(reference.path, data),
      delete: (reference) => documents.delete(reference.path),
    }),
  };

  const result = await migrateFavoritePage({
    db,
    job: { source, target },
    pageSize: 25,
  });

  assert.equal(result.updated, 1);
  assert.equal(documents.has(sourceFavoritePath), false);
  const migrated = [...documents.entries()].find(([path]) => path.startsWith('users/u1/favorites/'))?.[1];
  assert.equal(migrated.target.path, 'countries/NI/destinations/ometepe');
  assert.equal(migrated.preview.title, 'אומטפה');
});

function inMemoryReassignmentAdmin(seed) {
  const DELETE = Symbol('delete');
  const documents = new Map(Object.entries(seed));
  const makeRef = (path) => ({
    path,
    id: path.split('/').at(-1),
    get: async () => ({ exists: documents.has(path), data: () => documents.get(path) }),
  });
  const applyPatch = (path, patch) => {
    const next = { ...(documents.get(path) || {}) };
    Object.entries(patch).forEach(([key, value]) => {
      if (value === DELETE) delete next[key];
      else next[key] = value;
    });
    documents.set(path, next);
  };
  const emptyQuery = {
    where() { return this; },
    orderBy() { return this; },
    limit() { return this; },
    startAfter() { return this; },
    async get() { return { empty: true, docs: [], size: 0 }; },
  };
  const db = {
    doc: makeRef,
    collection: () => emptyQuery,
    collectionGroup: () => emptyQuery,
    runTransaction: async (callback) => callback({
      get: async (reference) => ({
        exists: documents.has(reference.path),
        data: () => documents.get(reference.path),
      }),
      create: (reference, data) => {
        assert.equal(documents.has(reference.path), false);
        documents.set(reference.path, data);
      },
      update: (reference, patch) => applyPatch(reference.path, patch),
      delete: (reference) => documents.delete(reference.path),
    }),
  };
  return {
    documents,
    firestore: Object.assign(() => db, {
      FieldValue: { serverTimestamp: () => 'TS', delete: () => DELETE },
    }),
  };
}

test('starting reassignment freezes both destinations and duplicate starts do not reset progress', async () => {
  const admin = inMemoryReassignmentAdmin({
    'countries/NI': { status: 'active', name: 'ניקרגואה' },
    'countries/NI/destinations/rivas': { status: 'active', name: 'ריבס' },
    'countries/NI/destinations/ometepe': { status: 'active', name: 'אומטפה' },
  });
  const targetRef = { countryId: target.countryId, cityId: target.cityId };
  const preview = await require('./destinationReassignmentService').previewDestinationReassignment({
    db: admin.firestore(), source, target: targetRef,
  });
  const input = {
    admin, source, target: targetRef, expectedImpactHash: preview.impactHash,
    reason: 'Canonical merge', requestedBy: 'admin-1',
  };

  const first = await startDestinationReassignment(input);
  const sourceData = admin.documents.get('countries/NI/destinations/rivas');
  const targetData = admin.documents.get('countries/NI/destinations/ometepe');
  const job = admin.documents.get(`system/runtime/destinationReassignmentJobs/${first.jobId}`);
  assert.equal(sourceData.reassignment.state, 'reassigning');
  assert.equal(targetData.reassignment.state, 'receiving');
  assert.equal(job.status, 'queued');
  assert.equal(job.generation, 1);

  const second = await startDestinationReassignment(input);
  assert.equal(second.jobId, first.jobId);
  assert.equal(admin.documents.get(`system/runtime/destinationReassignmentJobs/${first.jobId}`).generation, 1);
});
