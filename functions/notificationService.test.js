const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildNotificationDocument,
  buildNotificationTarget,
  clearNotifications,
  completeOwnerNotificationOutbox,
  deleteNotification,
  fanoutAdminNotification,
  handleOwnerNotificationOutboxWrite,
  LIKE_MILESTONE_STEPS,
  likeMilestoneAtOrBelow,
  likeMilestoneNotificationId,
  markAllNotificationsRead,
  navigationForTarget,
  notificationDeliveryDescriptor,
  prepareGroupedLikeActivity,
  prepareGroupedLikeRemoval,
  prepareLikeMilestoneActivity,
  prepareOwnerNotificationOutbox,
  purgeAdminNotificationsForUser,
  purgeNotificationsForActor,
  setNotificationRead,
  systemNotificationId,
  upsertNotification,
} = require('./notificationService');

function snapshot(ref, value) {
  return {
    ref,
    id: ref.id,
    exists: value !== undefined,
    data: () => value,
  };
}

function valueAtPath(value, path) {
  return path.split('.').reduce((current, key) => current?.[key], value);
}

function fakeAdmin(seed = {}, { maxTransactionWrites = Infinity } = {}) {
  const values = new Map(Object.entries(seed));
  const makeRef = (path) => ({
    path,
    id: path.split('/').pop(),
    set: async (value, options) => write({ path }, value, options?.merge === true),
  });
  const materialize = (previous, input) => Object.fromEntries(Object.entries(input).map(([key, value]) => {
    if (value?.operation === 'increment') return [key, Number(previous?.[key] || 0) + value.amount];
    if (value?.operation === 'serverTimestamp') return [key, 'server-time'];
    return [key, value];
  }));
  const write = (ref, input, merge = false) => {
    const previous = values.get(ref.path) || {};
    const next = materialize(previous, input);
    values.set(ref.path, merge ? { ...previous, ...next } : next);
  };
  const makeQuery = (path, { group = false } = {}) => {
    const filters = [];
    let maximum = Infinity;
    let cursorPath = '';
    const query = {
      where(field, operator, expected) {
        assert.equal(operator, '==');
        filters.push([field, expected]);
        return query;
      },
      orderBy(field) {
        assert.equal(field, '__name__');
        return query;
      },
      startAfter(entry) {
        cursorPath = entry?.ref?.path || entry?.path || '';
        return query;
      },
      limit(value) {
        maximum = value;
        return query;
      },
      async get() {
        const prefix = `${path}/`;
        const documents = [...values.entries()]
          .filter(([entryPath]) => (group
            ? entryPath.split('/').at(-2) === path
            : entryPath.startsWith(prefix)
              && entryPath.slice(prefix.length).split('/').length === 1))
          .filter(([, value]) => filters.every(([field, expected]) => valueAtPath(value, field) === expected))
          .filter(([entryPath]) => !cursorPath || entryPath > cursorPath)
          .sort(([left], [right]) => left.localeCompare(right))
          .slice(0, maximum)
          .map(([entryPath, value]) => snapshot(makeRef(entryPath), value));
        return { docs: documents, size: documents.length, empty: documents.length === 0 };
      },
    };
    return query;
  };
  const db = {
    doc: makeRef,
    collection: (path) => makeQuery(path),
    collectionGroup: (path) => makeQuery(path, { group: true }),
    async runTransaction(handler) {
      let writeCount = 0;
      const countWrite = () => {
        writeCount += 1;
        if (writeCount > maxTransactionWrites) throw new Error('transaction write limit exceeded');
      };
      return handler({
        get: async (ref) => snapshot(ref, values.get(ref.path)),
        set: (ref, value, options) => { countWrite(); write(ref, value, options?.merge === true); },
        update: (ref, value) => { countWrite(); write(ref, value, true); },
        delete: (ref) => { countWrite(); values.delete(ref.path); },
      });
    },
  };
  const firestore = Object.assign(() => db, {
    FieldPath: { documentId: () => '__name__' },
    FieldValue: {
      increment: (amount) => ({ operation: 'increment', amount }),
      serverTimestamp: () => ({ operation: 'serverTimestamp' }),
    },
  });
  return { admin: { firestore }, values };
}

function personalNotification(overrides = {}) {
  const target = buildNotificationTarget({
    target: { type: 'recommendation', id: 'rec-1' },
    data: { title: 'מסעדה מומלצת' },
  });
  return buildNotificationDocument({
    channel: 'personal',
    type: 'comment',
    subtype: 'new_comment',
    priority: 'normal',
    target,
    navigation: navigationForTarget(target),
    actorId: 'actor-1',
    actorPreview: { id: 'actor-1', displayName: 'Dana', photoURL: 'https://example.com/a.jpg' },
    actorPreviews: [{ id: 'actor-1', displayName: 'Dana' }],
    commentExcerpt: 'תגובה',
    count: 1,
    createdAt: 'time',
    ...overrides,
  });
}

test('canonical documents bound previews, excerpts, targets, and navigation', () => {
  const target = buildNotificationTarget({
    target: {
      type: 'route',
      id: 'route-1',
      thumbUrls: [
        'https://example.com/1.jpg',
        'javascript:alert(1)',
        'https://example.com/2.jpg',
        'https://example.com/3.jpg',
        'https://example.com/4.jpg',
        'https://example.com/5.jpg',
      ],
    },
    data: { title: 'מסלול בצפון' },
  });
  const document = buildNotificationDocument({
    channel: 'personal',
    type: 'comment',
    subtype: 'new_comment',
    target,
    navigation: navigationForTarget(target),
    actorId: 'actor-1',
    actorPreview: { id: 'actor-1', displayName: ' Dana ', photoURL: 'http://unsafe.test/a.jpg' },
    actorPreviews: Array.from({ length: 6 }, (_, index) => ({ id: `actor-${index + 1}`, displayName: `A${index}` })),
    commentExcerpt: 'א'.repeat(200),
    createdAt: 'time',
  });

  assert.equal(document.schemaVersion, 2);
  assert.equal(document.actorPreview.photoURL, null);
  assert.equal(document.actorPreviews.length, 4);
  assert.equal(document.commentExcerpt.length, 160);
  assert.equal(document.target.thumbUrls.length, 4);
  assert.deepEqual(document.navigation, { action: 'open_route', routeId: 'route-1' });
  assert.equal(JSON.stringify(document).includes('javascript:'), false);
  assert.throws(() => buildNotificationDocument({
    ...document,
    channel: 'personal',
    type: 'moderation',
    subtype: 'report_received',
  }), (error) => error.details?.reason === 'invalid_notification_input');
});

test('reply notifications are accepted as canonical comment activity', () => {
  const notification = personalNotification({ subtype: 'new_reply' });
  assert.equal(notification.type, 'comment');
  assert.equal(notification.subtype, 'new_reply');
});

test('grouped likes retain one generation and stale unlikes cannot change a recreated row', () => {
  const ref = { id: 'like-row', path: 'users/owner/notifications/like-row' };
  const target = buildNotificationTarget({
    target: { type: 'recommendation', id: 'rec-1' },
    data: { title: 'Post' },
  });
  const first = prepareGroupedLikeActivity({
    existingSnapshot: snapshot(ref, undefined),
    actorPreview: { id: 'actor-1', displayName: 'One' },
    target,
    navigation: navigationForTarget(target),
    generation: 'generation-one',
  });
  assert.equal(first.generation, 'generation-one');
  assert.equal(first.notification.count, 1);

  const existing = buildNotificationDocument({
    ...first.notification,
    createdAt: 'time',
  });
  const second = prepareGroupedLikeActivity({
    existingSnapshot: snapshot(ref, existing),
    actorPreview: { id: 'actor-2', displayName: 'Two' },
    target,
    navigation: navigationForTarget(target),
  });
  assert.equal(second.generation, 'generation-one');
  assert.equal(second.notification.count, 2);
  assert.deepEqual(second.notification.actorPreviews.map((item) => item.id), ['actor-2', 'actor-1']);

  assert.deepEqual(prepareGroupedLikeRemoval({
    existingSnapshot: snapshot(ref, { ...existing, generation: 'generation-two' }),
    actorId: 'actor-1',
    generation: 'generation-one',
  }), { action: 'none' });
  assert.equal(prepareGroupedLikeRemoval({
    existingSnapshot: snapshot(ref, existing),
    actorId: 'actor-1',
    generation: 'generation-one',
  }).action, 'delete');
});

test('like milestones advance at fixed thresholds and every thousand without backfill or repeats', () => {
  const target = buildNotificationTarget({
    target: { type: 'recommendation', id: 'rec-1' },
    data: { title: 'Post' },
  });
  const navigation = navigationForTarget(target);
  assert.deepEqual(LIKE_MILESTONE_STEPS, [50, 100, 200, 500, 1000]);
  assert.equal(likeMilestoneAtOrBelow(49), 0);
  assert.equal(likeMilestoneAtOrBelow(50), 50);
  assert.equal(likeMilestoneAtOrBelow(1999), 1000);
  assert.equal(likeMilestoneAtOrBelow(2000), 2000);

  for (const [currentCount, nextCount, previous, expected] of [
    [49, 50, 0, 50],
    [99, 100, 50, 100],
    [199, 200, 100, 200],
    [499, 500, 200, 500],
    [999, 1000, 500, 1000],
    [1999, 2000, 1000, 2000],
  ]) {
    const activity = prepareLikeMilestoneActivity({
      currentCount,
      nextCount,
      notifiedMilestone: previous,
      target,
      navigation,
    });
    assert.equal(activity.milestone, expected);
    assert.equal(activity.notification.subtype, 'like_milestone');
    assert.equal(activity.notification.count, expected);
    const document = buildNotificationDocument({
      ...activity.notification,
      createdAt: 'time',
    });
    assert.equal(document.milestone, expected);
  }

  assert.equal(prepareLikeMilestoneActivity({
    currentCount: 50,
    nextCount: 51,
    notifiedMilestone: 50,
    target,
    navigation,
  }), null);
  assert.equal(prepareLikeMilestoneActivity({
    currentCount: 49,
    nextCount: 50,
    notifiedMilestone: 50,
    target,
    navigation,
  }), null);
  assert.equal(prepareLikeMilestoneActivity({
    currentCount: 437,
    nextCount: 438,
    notifiedMilestone: undefined,
    target,
    navigation,
  }), null);
  assert.equal(
    likeMilestoneNotificationId('recommendations/rec-1', 50),
    likeMilestoneNotificationId('recommendations/rec-1', 50)
  );
  assert.notEqual(
    likeMilestoneNotificationId('recommendations/rec-1', 50),
    likeMilestoneNotificationId('recommendations/rec-1', 100)
  );
});

test('new activity advances push version while read-only changes do not', async () => {
  const fixture = fakeAdmin({ 'users/owner': {} });
  const notificationId = 'system-row';
  const notification = {
    channel: 'personal',
    type: 'system',
    subtype: 'content_held',
    priority: 'normal',
    count: 1,
    target: buildNotificationTarget({ target: { type: 'trip', id: 'trip-1' }, data: { title: 'Trip' } }),
    navigation: { action: 'open_trip', tripId: 'trip-1' },
  };
  await upsertNotification({ admin: fixture.admin, uid: 'owner', notificationId, notification });
  const path = `users/owner/notifications/${notificationId}`;
  assert.equal(fixture.values.get(path).push.version, 1);
  assert.equal(fixture.values.get(path).createdAt, 'server-time');
  assert.equal(fixture.values.get('users/owner/notificationState/state').schemaVersion, 2);
  assert.equal(fixture.values.get('users/owner/notificationState/state').personalUnread, 1);

  await setNotificationRead({
    admin: fixture.admin,
    auth: { uid: 'owner', token: {} },
    data: { notificationId, read: true },
  });
  assert.equal(fixture.values.get(path).push.version, 1);
  assert.equal(fixture.values.get('users/owner/notificationState/state').personalUnread, 0);

  await upsertNotification({ admin: fixture.admin, uid: 'owner', notificationId, notification });
  assert.equal(fixture.values.get(path).push.version, 2);
  assert.equal(fixture.values.get(path).isRead, false);
  assert.equal(fixture.values.get('users/owner/notificationState/state').personalUnread, 1);
});

test('create-only producers stay idempotent across trigger retries', async () => {
  const fixture = fakeAdmin({ 'users/admin-1': {} });
  const notification = {
    channel: 'admin',
    type: 'moderation',
    subtype: 'destination_review_discovered',
    priority: 'normal',
    count: 1,
    target: buildNotificationTarget({
      target: { type: 'destination', countryId: 'il', cityId: 'haifa' },
    }),
    navigation: {
      action: 'open_destination_review',
      countryId: 'il',
      cityId: 'haifa',
    },
  };
  await upsertNotification({
    admin: fixture.admin,
    uid: 'admin-1',
    notificationId: 'destination-row',
    notification,
    createOnly: true,
  });
  await upsertNotification({
    admin: fixture.admin,
    uid: 'admin-1',
    notificationId: 'destination-row',
    notification,
    createOnly: true,
  });
  assert.equal(
    fixture.values.get('users/admin-1/notifications/destination-row').push.version,
    1
  );
  assert.equal(fixture.values.get('users/admin-1/notificationState/state').adminUnread, 1);
});

test('report producers retry a covered activity without advancing push state', async () => {
  const fixture = fakeAdmin({ 'users/admin-1': {} });
  const notification = {
    channel: 'admin',
    type: 'moderation',
    subtype: 'report_received',
    priority: 'normal',
    count: 1,
    target: buildNotificationTarget({ target: { type: 'profile', id: 'reported-user' } }),
    navigation: { action: 'open_moderation_case', caseId: 'case-1' },
  };
  await upsertNotification({
    admin: fixture.admin,
    uid: 'admin-1',
    notificationId: 'report-row',
    notification,
    skipIfAlreadyCurrent: true,
  });
  await upsertNotification({
    admin: fixture.admin,
    uid: 'admin-1',
    notificationId: 'report-row',
    notification,
    skipIfAlreadyCurrent: true,
  });
  assert.equal(fixture.values.get('users/admin-1/notifications/report-row').push.version, 1);

  await upsertNotification({
    admin: fixture.admin,
    uid: 'admin-1',
    notificationId: 'report-row',
    notification: { ...notification, count: 2 },
    skipIfAlreadyCurrent: true,
  });
  assert.equal(fixture.values.get('users/admin-1/notifications/report-row').push.version, 2);
  assert.equal(fixture.values.get('users/admin-1/notifications/report-row').count, 2);
  assert.equal(fixture.values.get('users/admin-1/notificationState/state').adminUnread, 1);
});

test('owner deletion outbox survives completion retries and delivers each version once', async () => {
  const fixture = fakeAdmin({ 'users/owner-1': { status: 'active' } });
  const target = buildNotificationTarget({
    target: { type: 'recommendation', id: 'rec-1' },
    data: { title: 'Deleted recommendation' },
  });
  const pending = await prepareOwnerNotificationOutbox({
    admin: fixture.admin,
    uid: 'owner-1',
    subtype: 'content_deleted',
    target,
  });
  assert.deepEqual(pending, {
    outboxId: pending.outboxId,
    version: 1,
    state: 'pending',
    reused: false,
  });
  const outboxPath = `system/moderation/ownerNotifications/${pending.outboxId}`;
  const pendingValue = fixture.values.get(outboxPath);
  assert.equal(JSON.stringify(pendingValue).includes('reason'), false);
  assert.equal(JSON.stringify(pendingValue).includes('reporter'), false);

  const completed = await completeOwnerNotificationOutbox({
    admin: fixture.admin,
    subtype: 'content_deleted',
    targetPath: target.path,
    version: pending.version,
  });
  assert.equal(completed.changed, true);
  const readyValue = fixture.values.get(outboxPath);
  const event = {
    params: { outboxId: pending.outboxId },
    data: {
      before: { exists: true, data: () => pendingValue },
      after: { exists: true, data: () => readyValue },
    },
  };
  assert.deepEqual(await handleOwnerNotificationOutboxWrite({
    admin: fixture.admin,
    event,
  }), { status: 'delivered', version: 1 });
  const inboxPath = `users/owner-1/notifications/${systemNotificationId(
    'content_deleted',
    target.path
  )}`;
  assert.equal(fixture.values.get(inboxPath).push.version, 1);
  assert.equal(fixture.values.get('users/owner-1/notificationState/state').personalUnread, 1);

  assert.deepEqual(await handleOwnerNotificationOutboxWrite({
    admin: fixture.admin,
    event,
  }), { status: 'already_current', version: 1 });
  assert.equal(fixture.values.get(inboxPath).push.version, 1);
  assert.deepEqual(await completeOwnerNotificationOutbox({
    admin: fixture.admin,
    subtype: 'content_deleted',
    targetPath: target.path,
  }), {
    outboxId: pending.outboxId,
    version: 1,
    state: 'ready',
    changed: false,
  });

  const next = await prepareOwnerNotificationOutbox({
    admin: fixture.admin,
    uid: 'owner-1',
    subtype: 'content_deleted',
    target,
  });
  assert.equal(next.version, 2);
});

test('owner deletion outbox is not prepared after its parent user is gone', async () => {
  const fixture = fakeAdmin();
  const target = buildNotificationTarget({
    target: { type: 'recommendation', id: 'rec-1' },
    data: { title: 'Deleted recommendation' },
  });

  assert.equal(await prepareOwnerNotificationOutbox({
    admin: fixture.admin,
    uid: 'deleted-owner',
    subtype: 'content_deleted',
    target,
  }), null);
  assert.equal(
    [...fixture.values.keys()].some((path) => (
      path.startsWith('system/moderation/ownerNotifications/')
    )),
    false
  );
});

test('admin fanout paginates the complete active registry', async () => {
  const seed = Object.fromEntries(Array.from({ length: 52 }, (_, index) => [
    `system/moderation/admins/admin-${String(index).padStart(2, '0')}`,
    { active: true },
  ]));
  seed['system/moderation/admins/inactive'] = { active: false };
  for (let index = 0; index < 52; index += 1) {
    seed[`users/admin-${String(index).padStart(2, '0')}`] = {};
  }
  const fixture = fakeAdmin(seed);
  const target = buildNotificationTarget({
    target: { type: 'profile', id: 'reported-user' },
    data: { displayName: 'Reported user' },
  });
  const deliveries = await fanoutAdminNotification({
    admin: fixture.admin,
    notificationId: 'moderation-row',
    activityVersion: 7,
    notification: {
      channel: 'admin',
      type: 'moderation',
      subtype: 'report_received',
      priority: 'normal',
      count: 1,
      target,
      navigation: { action: 'open_moderation_case', caseId: 'case-1' },
    },
  });
  assert.equal(deliveries.length, 52);
  assert.equal(
    [...fixture.values.keys()].filter((path) => path.endsWith('/notifications/moderation-row')).length,
    52
  );
  assert.equal(fixture.values.has('users/inactive/notifications/moderation-row'), false);
  assert.equal(fixture.values.get('users/admin-00/notifications/moderation-row').push.version, 7);
  assert.equal((await fanoutAdminNotification({
    admin: fixture.admin,
    notificationId: 'moderation-row',
    activityVersion: 7,
    notification: {
      channel: 'admin',
      type: 'moderation',
      subtype: 'report_received',
      priority: 'normal',
      count: 1,
      target,
      navigation: { action: 'open_moderation_case', caseId: 'case-1' },
    },
  })).length, 0);
});

test('single-item mutations infer channel and require active registry for admin rows', async () => {
  const adminRow = personalNotification({
    channel: 'admin',
    type: 'moderation',
    subtype: 'report_received',
    navigation: { action: 'open_moderation_case', caseId: 'case-1' },
  });
  const fixture = fakeAdmin({
    'users/admin-1/notifications/admin-row': adminRow,
    'users/admin-1/notificationState/state': { adminUnread: 1, personalUnread: 0 },
  });
  await assert.rejects(setNotificationRead({
    admin: fixture.admin,
    auth: { uid: 'admin-1', token: {} },
    data: { notificationId: 'admin-row', read: true },
  }), (error) => error.details?.reason === 'admin_required');

  fixture.values.set('system/moderation/admins/admin-1', { active: true });
  const result = await setNotificationRead({
    admin: fixture.admin,
    auth: {
      uid: 'admin-1',
      token: {
        admin: true,
        auth_time: Math.floor(Date.now() / 1000),
        firebase: { sign_in_second_factor: 'totp' },
      },
    },
    data: { notificationId: 'admin-row', read: true },
  });
  assert.equal(result.changed, true);
  assert.equal(fixture.values.get('users/admin-1/notificationState/state').adminUnread, 0);
});

test('bulk personal mutations never affect admin notifications', async () => {
  const fixture = fakeAdmin({
    'users/admin-1/notifications/personal-1': personalNotification(),
    'users/admin-1/notifications/personal-2': personalNotification({ actorId: 'actor-2' }),
    'users/admin-1/notifications/admin-1': personalNotification({
      channel: 'admin',
      type: 'moderation',
      subtype: 'report_received',
      navigation: { action: 'open_moderation_case', caseId: 'case-1' },
    }),
    'users/admin-1/notificationState/state': { personalUnread: 2, adminUnread: 1 },
    'system/moderation/admins/admin-1': { active: true },
  });
  const auth = {
    uid: 'admin-1',
    token: {
      admin: true,
      auth_time: Math.floor(Date.now() / 1000),
      firebase: { sign_in_second_factor: 'totp' },
    },
  };
  assert.deepEqual(await markAllNotificationsRead({
    admin: fixture.admin,
    auth,
    data: { channel: 'personal' },
  }), { channel: 'personal', updated: 2 });
  assert.equal(fixture.values.get('users/admin-1/notificationState/state').personalUnread, 0);
  assert.equal(fixture.values.get('users/admin-1/notificationState/state').adminUnread, 1);
  assert.equal(fixture.values.get('users/admin-1/notifications/admin-1').isRead, false);

  assert.deepEqual(await clearNotifications({ admin: fixture.admin, auth, data: {} }), {
    channel: 'personal', deleted: 2,
  });
  assert.equal(fixture.values.has('users/admin-1/notifications/admin-1'), true);
  assert.deepEqual(await clearNotifications({
    admin: fixture.admin,
    auth,
    data: { channel: 'admin' },
  }), { channel: 'admin', deleted: 1 });
  assert.equal(fixture.values.get('users/admin-1/notificationState/state').adminUnread, 0);
});

test('clearing 250 notifications stays below the Firestore transaction write limit', async () => {
  const seed = {
    'users/owner/notificationState/state': { personalUnread: 250, adminUnread: 0 },
  };
  for (let index = 0; index < 250; index += 1) {
    seed[`users/owner/notifications/row-${String(index).padStart(3, '0')}`] = personalNotification({
      actorId: `actor-${index}`,
      push: { version: 1 },
    });
  }
  const fixture = fakeAdmin(seed, { maxTransactionWrites: 500 });

  assert.deepEqual(await clearNotifications({
    admin: fixture.admin,
    auth: { uid: 'owner', token: {} },
    data: { channel: 'personal' },
  }), { channel: 'personal', deleted: 250 });
  assert.equal(fixture.values.get('users/owner/notificationState/state').personalUnread, 0);
});

test('actor privacy sweep removes residual legacy rows without stalling on likes', async () => {
  const fixture = fakeAdmin({
    'users/owner/notifications/legacy-like': { schemaVersion: 1, type: 'like', actorId: 'actor-1' },
    'users/owner/notifications/legacy-comment': { schemaVersion: 1, type: 'comment', actorId: 'actor-1' },
  });

  assert.equal(await purgeNotificationsForActor({
    admin: fixture.admin,
    actorId: 'actor-1',
  }), 2);
  assert.equal(fixture.values.has('users/owner/notifications/legacy-like'), false);
  assert.equal(fixture.values.has('users/owner/notifications/legacy-comment'), false);
});

test('admin demotion purges only admin rows and rebuilds admin unread to zero', async () => {
  const unreadAdmin = personalNotification({
    channel: 'admin',
    type: 'moderation',
    subtype: 'report_received',
    navigation: { action: 'open_moderation_case', caseId: 'case-1' },
  });
  const fixture = fakeAdmin({
    'users/admin-1': { status: 'active' },
    'users/admin-1/notifications/admin-unread': unreadAdmin,
    'users/admin-1/notifications/admin-read': { ...unreadAdmin, isRead: true },
    'users/admin-1/notifications/personal-row': personalNotification(),
    'users/admin-1/notificationState/state': { personalUnread: 1, adminUnread: 99 },
  });
  assert.equal(await purgeAdminNotificationsForUser({
    admin: fixture.admin,
    uid: 'admin-1',
  }), 2);
  assert.equal(fixture.values.has('users/admin-1/notifications/admin-unread'), false);
  assert.equal(fixture.values.has('users/admin-1/notifications/admin-read'), false);
  assert.equal(fixture.values.has('users/admin-1/notifications/personal-row'), true);
  assert.deepEqual(fixture.values.get('users/admin-1/notificationState/state'), {
    personalUnread: 1,
    adminUnread: 0,
    schemaVersion: 2,
    updatedAt: 'server-time',
  });
});

test('admin demotion does not recreate notification state after the user is gone', async () => {
  const fixture = fakeAdmin();
  assert.equal(await purgeAdminNotificationsForUser({
    admin: fixture.admin,
    uid: 'deleted-user',
  }), 0);
  assert.equal(fixture.values.has('users/deleted-user/notificationState/state'), false);
});

test('deleting an unread row updates its channel counter and delivery descriptors ignore reads', async () => {
  const row = personalNotification();
  const fixture = fakeAdmin({
    'users/owner/notifications/comment-row': row,
    'users/owner/notificationState/state': { personalUnread: 1, adminUnread: 0 },
  });
  assert.deepEqual(await deleteNotification({
    admin: fixture.admin,
    auth: { uid: 'owner', token: {} },
    data: { notificationId: 'comment-row' },
  }), { notificationId: 'comment-row', channel: 'personal', deleted: true });
  assert.equal(fixture.values.get('users/owner/notificationState/state').personalUnread, 0);

  assert.equal(notificationDeliveryDescriptor({
    userId: 'owner',
    notificationId: 'row',
    before: row,
    after: { ...row, isRead: true },
  }), null);
  assert.equal(notificationDeliveryDescriptor({
    userId: 'owner',
    notificationId: 'row',
    before: row,
    after: { ...row, push: { version: 2 } },
  }).version, 2);
});

test('deleting a row dismisses only its current activity generation', async () => {
  const row = { ...personalNotification(), push: { version: 1 } };
  const fixture = fakeAdmin({
    'users/owner': {},
    'users/owner/notifications/comment-row': row,
    'users/owner/notificationState/state': { personalUnread: 1, adminUnread: 0 },
  });
  await deleteNotification({
    admin: fixture.admin,
    auth: { uid: 'owner', token: {} },
    data: { notificationId: 'comment-row' },
  });
  await upsertNotification({
    admin: fixture.admin,
    uid: 'owner',
    notificationId: 'comment-row',
    notification: row,
    activityVersion: 1,
  });
  assert.equal(fixture.values.has('users/owner/notifications/comment-row'), false);
  await upsertNotification({
    admin: fixture.admin,
    uid: 'owner',
    notificationId: 'comment-row',
    notification: row,
    activityVersion: 2,
  });
  assert.equal(fixture.values.get('users/owner/notifications/comment-row').push.version, 2);
});
