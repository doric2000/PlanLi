const test = require('node:test');
const assert = require('node:assert/strict');

const { listMyPendingContent, pendingItem } = require('./myPendingContentService');

function timestamp(ms) {
  return { toMillis: () => ms };
}

function createAdmin(seed) {
  const collections = Object.fromEntries(Object.entries(seed).map(([name, entries]) => [
    name,
    entries.map(({ id, ...data }) => ({ id, data })),
  ]));
  const snapshot = (collection, record) => ({
    id: record.id,
    exists: true,
    data: () => record.data,
    ref: { path: `${collection}/${record.id}` },
  });
  const collectionRef = (collection) => {
    const filters = [];
    let pageLimit = Infinity;
    let cursorId = null;
    const query = {
      where: (field, operation, expected) => {
        assert.equal(operation, '==');
        filters.push([field, expected]);
        return query;
      },
      orderBy: () => query,
      limit: (value) => { pageLimit = value; return query; },
      startAfter: (cursor) => { cursorId = cursor.id; return query; },
      get: async () => {
        let records = [...(collections[collection] || [])]
          .filter((record) => filters.every(([field, expected]) => record.data[field] === expected))
          .sort((a, b) => b.data.createdAt.toMillis() - a.data.createdAt.toMillis()
            || b.id.localeCompare(a.id));
        if (cursorId) records = records.slice(records.findIndex((record) => record.id === cursorId) + 1);
        return { docs: records.slice(0, pageLimit).map((record) => snapshot(collection, record)) };
      },
    };
    return {
      ...query,
      doc: (id) => ({
        get: async () => {
          const record = (collections[collection] || []).find((entry) => entry.id === id);
          return record ? snapshot(collection, record) : { id, exists: false, data: () => null };
        },
      }),
    };
  };
  return { firestore: () => ({ collection: collectionRef }) };
}

test('pending projection is bounded and strips unsafe thumbnail URLs', () => {
  const item = pendingItem('recommendation', {
    id: 'rec-1',
    data: () => ({
      title: 'כותרת'.repeat(100),
      media: [{ thumb: { url: 'http://private.example/image.jpg' } }],
      createdAt: timestamp(20),
      moderation: { holdReason: 'internal_reason' },
    }),
  });
  assert.equal(item.title.length, 180);
  assert.equal(item.thumbnailUrl, null);
  assert.equal(Object.hasOwn(item, 'moderation'), false);
  assert.equal(item.publicationStatus, 'moderation_hold');
});

test('owner pending content is merged, paginated, and never includes another owner', async () => {
  const admin = createAdmin({
    recommendations: [
      { id: 'rec-new', ownerId: 'owner', status: 'moderation_hold', title: 'חדשה', createdAt: timestamp(300) },
      { id: 'rec-old', ownerId: 'owner', status: 'moderation_hold', title: 'ישנה', createdAt: timestamp(100) },
      { id: 'rec-foreign', ownerId: 'other', status: 'moderation_hold', title: 'פרטי', createdAt: timestamp(400) },
    ],
    routes: [
      { id: 'route-mid', ownerId: 'owner', status: 'moderation_hold', title: 'מסלול', createdAt: timestamp(200) },
      { id: 'route-active', ownerId: 'owner', status: 'active', title: 'ציבורי', createdAt: timestamp(500) },
    ],
    trips: [
      { id: 'trip-new', ownerId: 'owner', status: 'moderation_hold', title: 'טיול', createdAt: timestamp(250) },
    ],
  });
  const first = await listMyPendingContent({ admin, auth: { uid: 'owner' }, data: { limit: 2 } });
  assert.deepEqual(first.items.map((item) => item.id), ['rec-new', 'trip-new']);
  assert.deepEqual(first.nextCursor, { recommendationId: 'rec-new', routeId: null, tripId: 'trip-new' });
  const second = await listMyPendingContent({
    admin, auth: { uid: 'owner' }, data: { limit: 2, cursor: first.nextCursor },
  });
  assert.deepEqual(second.items.map((item) => item.id), ['route-mid', 'rec-old']);
  assert.equal(second.nextCursor, null);
});

test('a cursor cannot reference another owner pending document', async () => {
  const admin = createAdmin({
    recommendations: [
      { id: 'foreign', ownerId: 'other', status: 'moderation_hold', createdAt: timestamp(1) },
    ],
    routes: [],
    trips: [],
  });
  await assert.rejects(
    listMyPendingContent({
      admin, auth: { uid: 'owner' }, data: { cursor: { recommendationId: 'foreign' } },
    }),
    (error) => error?.details?.reason === 'invalid_cursor'
  );
});

test('pending cursors reject path, control, whitespace and unknown-field injection', () => {
  const { cleanCursor } = require('./myPendingContentService');
  for (const cursor of [
    { recommendationId: '../foreign' },
    { routeId: ' route-1' },
    { tripId: 'trip\u0085break' },
    { recommendationId: 'rec-1', prototypeId: 'polluted' },
  ]) {
    assert.throws(() => cleanCursor(cursor), (error) => error?.details?.reason === 'invalid_cursor');
  }
});
