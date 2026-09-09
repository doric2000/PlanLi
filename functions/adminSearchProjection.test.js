const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildAdminSearchProjection,
  handleAdminSearchProjectionWrite,
  projectionId,
  removeInactiveRouteStopProjections,
  targetForPath,
} = require('./adminSearchProjection');

function recommendationProjectionAdmin(current) {
  const writes = [];
  const db = {
    doc: (path) => ({ path, id: path.split('/').at(-1) }),
    runTransaction: async (callback) => callback({
      get: async (ref) => {
        assert.equal(ref.path, 'recommendations/rec-1');
        return { exists: current != null, data: () => current };
      },
      set: (ref, data) => writes.push({ path: ref.path, data }),
      delete: (ref) => writes.push({ path: ref.path, deleted: true }),
    }),
  };
  const firestore = () => db;
  firestore.FieldValue = { serverTimestamp: () => 'server-time' };
  return { admin: { firestore }, writes };
}

test('a delayed hold event projects the current published recommendation', async () => {
  const current = { status: 'active', title: 'Published', destination: { countryId: 'LK', cityId: 'park', cityName: 'שמורת אודוואלווה' } };
  const { admin, writes } = recommendationProjectionAdmin(current);
  await handleAdminSearchProjectionWrite({ admin, event: { data: { after: {
    ref: { path: 'recommendations/rec-1' }, exists: true,
    data: () => ({ status: 'moderation_hold', title: 'Old hold' }),
  } } } });
  assert.equal(writes[0].data.status, 'active');
  assert.equal(writes[0].data.destination.cityId, 'park');
});

test('an old recommendation update cannot recreate a deleted projection', async () => {
  const { admin, writes } = recommendationProjectionAdmin(null);
  const result = await handleAdminSearchProjectionWrite({ admin, event: { data: { after: {
    ref: { path: 'recommendations/rec-1' }, exists: true, data: () => ({ status: 'active' }),
  } } } });
  assert.equal(result.status, 'deleted');
  assert.equal(writes[0].deleted, true);
});

test('a delayed deletion does not remove a recreated recommendation projection', async () => {
  const { admin, writes } = recommendationProjectionAdmin({ status: 'active', title: 'Recreated' });
  await handleAdminSearchProjectionWrite({ admin, event: { data: {
    before: { ref: { path: 'recommendations/rec-1' } }, after: { exists: false },
  } } });
  assert.equal(writes[0].data.status, 'active');
  assert.equal(writes[0].deleted, undefined);
});

test('admin search maps every private projection source to its canonical target', () => {
  assert.deepEqual(targetForPath('countries/IL/destinations/haifa'), {
    type: 'destination', id: 'haifa', countryId: 'IL', cityId: 'haifa',
    path: 'countries/IL/destinations/haifa',
  });
  assert.deepEqual(targetForPath('routes/r-1/comments/c-1'), {
    type: 'comment', id: 'c-1', parentType: 'route', parentId: 'r-1',
    path: 'routes/r-1/comments/c-1',
  });
  assert.deepEqual(targetForPath('routes/r-1/revisions/rev-2/days/day-1/stops/stop-3'), {
    type: 'route', id: 'r-1', path: 'routes/r-1', revisionId: 'rev-2',
    subject: { kind: 'attached_place', field: 'place', dayId: 'day-1', stopId: 'stop-3' },
  });
  assert.equal(targetForPath('users/private'), null);
});

test('admin search projection indexes Hebrew and English without private email fields', () => {
  const target = targetForPath('recommendations/rec-1');
  const projection = buildAdminSearchProjection({
    target,
    data: {
      title: 'מסעדה בחיפה', description: 'Local restaurant', ownerId: 'owner-1', status: 'active',
      destination: { countryId: 'IL', cityId: 'haifa', cityName: 'חיפה', countryName: 'ישראל' },
      place: { name: 'שוק תלפיות', address: 'Talpiot market' },
      email: 'must-not-index@example.com',
    },
  });
  assert.ok(projection.search.prefixes.includes('חיפ'));
  assert.ok(projection.search.prefixes.includes('loc'));
  assert.equal(JSON.stringify(projection).includes('must-not-index@example.com'), false);
  assert.equal(projectionId(target.path), projectionId(target.path));
});

test('destination projections omit an absent optional country name', () => {
  const target = targetForPath('countries/IL/destinations/haifa');
  const projection = buildAdminSearchProjection({
    target,
    data: { identity: { names: { he: 'חיפה' } }, status: 'active' },
  });
  assert.deepEqual(projection.destination, {
    countryId: 'IL',
    cityId: 'haifa',
    cityName: 'חיפה',
  });
  assert.equal('countryName' in projection.destination, false);
});

test('route publication cleanup removes projections from inactive revisions', async () => {
  const deleted = [];
  const entries = [
    {
      ref: { path: 'system/moderation/search/stale' },
      data: () => ({
        type: 'route',
        target: { id: 'route-1', revisionId: 'rev-1', subject: { kind: 'attached_place' } },
      }),
    },
    {
      ref: { path: 'system/moderation/search/current' },
      data: () => ({
        type: 'route',
        target: { id: 'route-1', revisionId: 'rev-2', subject: { kind: 'attached_place' } },
      }),
    },
  ];
  const query = {
    where: () => query,
    get: async () => ({ docs: entries }),
  };
  const db = {
    collection: () => query,
    batch: () => ({
      delete: (ref) => deleted.push(ref.path),
      commit: async () => {},
    }),
  };
  const count = await removeInactiveRouteStopProjections({
    admin: { firestore: () => db },
    routeId: 'route-1',
    activeRevisionId: 'rev-2',
  });
  assert.equal(count, 1);
  assert.deepEqual(deleted, ['system/moderation/search/stale']);
});
