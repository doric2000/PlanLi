const test = require('node:test');
const assert = require('node:assert/strict');

const {
  cleanHebrewDestinationName,
  destinationNamePatch,
  processDestinationRenameJob,
  recommendationRenamePatch,
  renameJobId,
  routeRenamePatch,
  routeStopUpdates,
  shouldQueueRename,
  tripRenamePatch,
} = require('./destinationRenameService');

test('admin destination names are NFC-normalized and must contain Hebrew', () => {
  assert.equal(cleanHebrewDestinationName('  סאפה  '), 'סאפה');
  assert.throws(() => cleanHebrewDestinationName('Sa Pa'), (error) => (
    error.code === 'invalid-argument' && error.details?.reason === 'invalid_hebrew_name'
  ));
  assert.throws(() => cleanHebrewDestinationName('עיר\u0000'), /invalid/i);
});

test('rename job identity is deterministic for destination and canonical name', () => {
  assert.equal(renameJobId('VN', 'sa-pa', 'סאפה'), renameJobId('VN', 'sa-pa', 'סאפה'));
  assert.notEqual(renameJobId('VN', 'sa-pa', 'סאפה'), renameJobId('VN', 'sa-pa', 'סא פא'));
});

test('a completed job is restarted when an admin returns to an earlier name', () => {
  assert.equal(shouldQueueRename({ status: 'complete' }, 'סא פה', 'סאפה'), true);
  assert.equal(shouldQueueRename({ status: 'complete' }, 'סאפה', 'סאפה'), false);
  assert.equal(shouldQueueRename({ status: 'failed' }, 'סאפה', 'סאפה'), true);
});

test('canonical rename patch records an admin source without changing identity', () => {
  assert.deepEqual(destinationNamePatch('סאפה'), {
    namingPolicyVersion: 2,
    'googleCache.names.he': 'סאפה',
    'googleCache.nameSources.he': 'admin',
  });
});

test('content propagation updates denormalized names and rebuilds search indexes', () => {
  const recommendation = recommendationRenamePatch({
    title: 'מלון', description: 'תיאור', categoryId: 'hotels', tags: [],
    destination: { countryId: 'VN', cityId: 'sa-pa', cityName: 'Sa Pa' },
    place: { name: 'Hotel', address: 'Street' },
  }, 'סאפה');
  assert.equal(recommendation.destination.cityName, 'סאפה');
  assert.ok(recommendation.search.destinationTokens.includes('סאפה'));

  const route = routeRenamePatch({
    title: 'מסלול', description: 'תיאור',
    destinations: [
      { countryId: 'VN', cityId: 'sa-pa', cityName: 'Sa Pa' },
      { countryId: 'XX', cityId: 'sa-pa', cityName: 'Other Sa Pa' },
      { countryId: 'VN', cityId: 'hanoi', cityName: 'האנוי' },
    ],
  }, 'VN', 'sa-pa', 'סאפה');
  assert.equal(route.destinations[0].cityName, 'סאפה');
  assert.equal(route.destinations[1].cityName, 'Other Sa Pa');
  assert.equal(route.destinations[2].cityName, 'האנוי');
  assert.ok(route.search.destinationTokens.includes('סאפה'));

  assert.equal(tripRenamePatch({ destination: { countryId: 'VN', cityId: 'sa-pa' } }, 'סאפה')
    .destination.cityName, 'סאפה');
});

test('recommendation propagation checkpoints once and remains retry-safe', async () => {
  const documents = new Map([
    ['system/runtime/destinationRenameJobs/job-1', {
      countryId: 'VN', cityId: 'sa-pa', nameHe: 'סאפה', status: 'queued',
      stage: 'recommendations', generation: 1, cursor: null,
      updatedCounts: { recommendations: 0, routesAndStops: 0, trips: 0 },
    }],
    ['countries/VN/destinations/sa-pa', {
      googleCache: { names: { he: 'סאפה' }, nameSources: { he: 'admin' } },
    }],
    ['recommendations/rec-1', {
      title: 'מלון', description: 'תיאור', status: 'active', categoryId: 'hotels',
      destination: { countryId: 'VN', cityId: 'sa-pa', cityName: 'Sa Pa' },
    }],
  ]);
  const snapshot = (ref) => ({
    id: ref.path.split('/').at(-1),
    exists: documents.has(ref.path),
    data: () => documents.get(ref.path),
    ref,
  });
  const ref = (path) => ({
    path,
    get: async () => snapshot(ref(path)),
    update: async (patch) => documents.set(path, { ...documents.get(path), ...patch }),
  });
  const query = {
    where: () => query,
    orderBy: () => query,
    limit: () => query,
    startAfter: () => query,
    get: async () => ({
      size: 1,
      docs: [snapshot(ref('recommendations/rec-1'))],
    }),
  };
  const db = {
    doc: ref,
    collection: (path) => {
      assert.equal(path, 'recommendations');
      return query;
    },
    batch: () => {
      const writes = [];
      return {
        update: (target, patch) => writes.push([target.path, patch]),
        commit: async () => writes.forEach(([path, patch]) => documents.set(path, {
          ...documents.get(path), ...patch,
        })),
      };
    },
    runTransaction: async (callback) => callback({
      get: async (target) => snapshot(target),
      update: (target, patch) => {
        const current = { ...documents.get(target.path) };
        Object.entries(patch).forEach(([field, value]) => {
          if (field.startsWith('updatedCounts.')) {
            const key = field.split('.')[1];
            current.updatedCounts = { ...current.updatedCounts, [key]: value };
          } else current[field] = value;
        });
        documents.set(target.path, current);
      },
    }),
  };
  const firestore = () => db;
  firestore.FieldValue = { serverTimestamp: () => 'NOW' };

  const result = await processDestinationRenameJob({
    admin: { firestore }, jobId: 'job-1', pageSize: 2,
  });

  assert.equal(result.status, 'queued');
  assert.equal(result.stage, 'routes');
  assert.equal(documents.get('recommendations/rec-1').destination.cityName, 'סאפה');
  assert.equal(documents.get('system/runtime/destinationRenameJobs/job-1').updatedCounts.recommendations, 1);
  assert.equal(documents.get('system/runtime/destinationRenameJobs/job-1').stage, 'routes');
});

test('route propagation targets only active and prepared revision stops for the city', async () => {
  const matching = {
    ref: { path: 'routes/r1/revisions/active/days/d1/stops/s1' },
    data: () => ({ destination: { countryId: 'VN', cityId: 'sa-pa', cityName: 'Sa Pa' } }),
  };
  const other = {
    ref: { path: 'routes/r1/revisions/active/days/d1/stops/s2' },
    data: () => ({ destination: { countryId: 'VN', cityId: 'hanoi', cityName: 'האנוי' } }),
  };
  const sameCityIdOtherCountry = {
    ref: { path: 'routes/r1/revisions/active/days/d1/stops/s3' },
    data: () => ({ destination: { countryId: 'XX', cityId: 'sa-pa', cityName: 'Other Sa Pa' } }),
  };
  const routeDocument = {
    ref: {
      collection: (name) => {
        assert.equal(name, 'revisions');
        return {
          where: () => ({
            get: async () => ({ docs: [{
              ref: {
                collection: (daysName) => {
                  assert.equal(daysName, 'days');
                  return { get: async () => ({ docs: [{
                    ref: { collection: () => ({ get: async () => ({
                      docs: [matching, other, sameCityIdOtherCountry],
                    }) }) },
                  }] }) };
                },
              },
            }] }),
          }),
        };
      },
    },
  };

  const updates = await routeStopUpdates(routeDocument, 'VN', 'sa-pa', 'סאפה');
  assert.equal(updates.length, 1);
  assert.equal(updates[0].ref.path, matching.ref.path);
  assert.equal(updates[0].patch.destination.cityName, 'סאפה');
});
