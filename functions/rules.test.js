const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} = require('@firebase/rules-unit-testing');
const {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  where,
} = require('firebase/firestore');
const { deleteObject, getBytes, listAll, ref, uploadBytes } = require('firebase/storage');

const hasEmulators = Boolean(
  process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_STORAGE_EMULATOR_HOST
);
const rootDir = path.join(__dirname, '..');
let env;

const verifiedClaims = {
  email: 'user@example.com',
  email_verified: true,
  firebase: { sign_in_provider: 'password' },
};
const unverifiedClaims = {
  email: 'user@example.com',
  email_verified: false,
  firebase: { sign_in_provider: 'password' },
};
const ACTIVE_ASSET_ID = '123e4567-e89b-42d3-a456-426614174000';
const UNREGISTERED_ASSET_ID = '123e4567-e89b-42d3-a456-426614174001';

test.before(async () => {
  if (!hasEmulators) return;
  env = await initializeTestEnvironment({
    projectId: 'planli-rules-test',
    firestore: { rules: fs.readFileSync(path.join(rootDir, 'firestore.rules'), 'utf8') },
    storage: { rules: fs.readFileSync(path.join(rootDir, 'storage.rules'), 'utf8') },
  });
});

test.after(async () => env?.cleanup());

test.beforeEach(async () => {
  if (!env) return;
  await env.clearFirestore();
  await env.clearStorage();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'users', 'owner'), {
      uid: 'owner',
      email: 'owner@example.com',
      displayName: 'Private owner',
      onboarding: { profileDetailsVersion: 1, profileDetailsCompletedAt: new Date() },
      legal: {
        termsVersion: '2026-08-15-community-safety',
        privacyVersion: '2026-08-18-beta-observability',
        acceptedAt: new Date(),
      },
      smartProfile: { setupRequired: false, completedAt: new Date() },
      moderation: { status: 'active' },
    });
    await setDoc(doc(db, 'users', 'incomplete'), {
      uid: 'incomplete',
      email: 'incomplete@example.com',
      displayName: 'Incomplete user',
      smartProfile: { setupRequired: true },
    });
    await setDoc(doc(db, 'users', 'noya-skipped'), {
      uid: 'noya-skipped',
      email: 'noya-skipped@example.com',
      displayName: 'Noa skipped',
      onboarding: { profileDetailsVersion: 1, profileDetailsCompletedAt: new Date() },
      legal: {
        termsVersion: '2026-08-15-community-safety',
        privacyVersion: '2026-08-18-beta-observability',
        acceptedAt: new Date(),
      },
      moderation: { status: 'active' },
    });
    await setDoc(doc(db, 'publicProfiles', 'owner'), {
      displayName: 'Public owner', status: 'active',
    });
    await setDoc(doc(db, 'system', 'media', 'assets', ACTIVE_ASSET_ID), {
      status: 'active', ownerUid: 'owner',
    });
    await setDoc(doc(db, 'system', 'moderation', 'admins', 'active-admin'), { active: true });
    await setDoc(doc(db, 'system', 'moderation', 'admins', 'inactive-admin'), { active: false });
    await setDoc(doc(db, 'countries', 'cty_il'), {
      name: 'Israel', code: 'IL', status: 'active',
    });
    await setDoc(doc(db, 'countries', 'cty_il', 'destinations', 'city_tlv'), {
      schemaVersion: 3,
      countryId: 'cty_il',
      status: 'active',
      canonicalPolicy: {
        approved: true, registryId: 'il-tel-aviv', kind: 'city_hub',
        groupingPolicy: 'self', registryVersion: 3, approvalRevision: 1,
        registryAttestation: {
          approved: true, registryId: 'il-tel-aviv', registryVersion: 3,
          approvalRevision: 1, countryId: 'cty_il',
        },
      },
      googleCache: { names: { he: 'Tel Aviv', en: 'Tel Aviv' }, expiresAt: new Date('2020-01-01') },
    });
    await setDoc(doc(db, 'recommendations', 'rec-active'), {
      ownerId: 'owner', title: 'Active', status: 'active',
      publicationGate: { destinationApprovalVerified: true },
    });
    await setDoc(doc(db, 'recommendations', 'rec-deleting'), {
      ownerId: 'owner', title: 'Deleting', status: 'deleting',
    });
    await setDoc(doc(db, 'routes', 'route-active'), {
      ownerId: 'owner', title: 'Route', status: 'active', activeRevisionId: 'revision-active',
      publicationGate: { destinationApprovalVerified: true },
    });
    await setDoc(doc(db, 'routes', 'route-active', 'days', 'day-1'), {
      position: 0, title: 'Day 1',
    });
    await setDoc(doc(db, 'routes', 'route-active', 'days', 'day-1', 'stops', 'stop-1'), {
      position: 0, title: 'Stop 1',
    });
    await setDoc(doc(db, 'routes', 'route-active', 'revisions', 'revision-active'), {
      state: 'active', position: 0,
    });
    await setDoc(doc(db, 'routes', 'route-active', 'revisions', 'revision-active', 'days', 'day-1'), {
      position: 0, title: 'Revision day',
    });
    await setDoc(doc(
      db,
      'routes', 'route-active', 'revisions', 'revision-active', 'days', 'day-1', 'stops', 'stop-1'
    ), {
      position: 0, title: 'Revision stop',
    });
    await setDoc(doc(db, 'routes', 'route-active', 'revisions', 'revision-old'), {
      state: 'superseded', position: 0,
    });
    await setDoc(doc(db, 'routes', 'route-active', 'revisions', 'revision-old', 'days', 'day-1'), {
      position: 0, title: 'Old day',
    });
    await setDoc(doc(db, 'users', 'owner', 'favorites', 'favorite-hash'), {
      ownerId: 'owner', type: 'recommendation', target: { id: 'rec-active' },
    });
    await setDoc(doc(db, 'users', 'owner', 'notifications', 'notification-1'), {
      schemaVersion: 2,
      channel: 'personal',
      actorId: 'other',
      type: 'like',
      subtype: 'grouped_like',
      priority: 'normal',
      isRead: false,
      createdAt: new Date(),
    });
    await setDoc(doc(db, 'users', 'owner', 'notifications', 'notification-admin'), {
      schemaVersion: 2,
      channel: 'admin',
      type: 'moderation',
      subtype: 'report',
      priority: 'urgent',
      isRead: false,
      createdAt: new Date(),
    });
    await setDoc(doc(db, 'users', 'active-admin', 'notifications', 'notification-admin'), {
      schemaVersion: 2,
      channel: 'admin',
      type: 'moderation',
      subtype: 'report',
      priority: 'urgent',
      isRead: false,
      createdAt: new Date(),
    });
    await setDoc(doc(db, 'users', 'inactive-admin', 'notifications', 'notification-admin'), {
      schemaVersion: 2,
      channel: 'admin',
      type: 'moderation',
      subtype: 'report',
      priority: 'urgent',
      isRead: false,
      createdAt: new Date(),
    });
    await setDoc(doc(db, 'users', 'owner', 'notificationState', 'state'), {
      schemaVersion: 2,
      personalUnread: 1,
      adminUnread: 1,
      pushPreferences: { pushEnabled: false },
    });
    await setDoc(doc(db, 'notificationDevices', 'token-hash'), {
      uid: 'owner',
      token: 'ExponentPushToken[private]',
      platform: 'ios',
    });
    await setDoc(doc(db, 'users', 'owner', 'blockedUsers', 'other'), {
      blockedUid: 'other', createdAt: new Date(),
    });
    await setDoc(doc(db, 'system', 'accountDeletion', 'jobs', 'private'), { status: 'running' });
    await setDoc(doc(db, 'recommendations', 'rec-active', 'comments', 'comment-1'), {
      authorId: 'owner', text: 'Hello', status: 'active',
      threadType: 'root', threadRootId: 'comment-1', replyToCommentId: null,
      replyCount: 1, createdAt: new Date('2026-01-01T00:00:00Z'),
    });
    await setDoc(doc(db, 'recommendations', 'rec-active', 'comments', 'reply-1'), {
      authorId: 'other', text: 'Reply', status: 'active',
      threadType: 'reply', threadRootId: 'comment-1', replyToCommentId: 'comment-1',
      replyCount: 0, createdAt: new Date('2026-01-01T00:01:00Z'),
    });
    await setDoc(doc(db, 'recommendations', 'rec-active', 'comments', 'held-root'), {
      authorId: 'owner', text: 'Held root', status: 'moderation_hold',
      threadType: 'root', threadRootId: 'held-root', replyToCommentId: null,
      replyCount: 1, createdAt: new Date('2026-01-01T00:02:00Z'),
    });
    await setDoc(doc(db, 'recommendations', 'rec-active', 'comments', 'orphan-reply'), {
      authorId: 'other', text: 'Orphaned reply', status: 'active',
      threadType: 'reply', threadRootId: 'held-root', replyToCommentId: 'held-root',
      replyCount: 0, createdAt: new Date('2026-01-01T00:03:00Z'),
    });
    await setDoc(doc(db, 'recommendations', 'rec-deleting', 'comments', 'comment-1'), {
      ownerId: 'owner', text: 'Hidden', status: 'active',
    });
    await setDoc(doc(db, 'recommendations', 'rec-active', 'likes', 'owner'), {
      userId: 'owner',
    });
    await setDoc(doc(db, 'recommendations', 'rec-deleting', 'likes', 'owner'), {
      userId: 'owner',
    });

    const storage = context.storage();
    await uploadBytes(ref(storage, `media/owner/${ACTIVE_ASSET_ID}/large.webp`), new Uint8Array([1, 2, 3]), {
      contentType: 'image/webp',
    });
  });
});

test('public active documents are readable while private and deleting documents are hidden', {
  skip: !hasEmulators,
}, async () => {
  const db = env.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(doc(db, 'recommendations', 'rec-active')));
  await assertFails(getDoc(doc(db, 'recommendations', 'rec-deleting')));
  await assertSucceeds(getDoc(doc(db, 'countries', 'cty_il', 'destinations', 'city_tlv')));
  await assertSucceeds(getDoc(doc(db, 'publicProfiles', 'owner')));
  await assertFails(getDoc(doc(db, 'users', 'owner')));
  await assertFails(getDoc(doc(db, 'system', 'accountDeletion', 'jobs', 'private')));
});

test('an admin claim also requires an active server-owned admin registry entry', {
  skip: !hasEmulators,
}, async () => {
  const active = env.authenticatedContext('active-admin', { admin: true }).firestore();
  const inactive = env.authenticatedContext('inactive-admin', { admin: true }).firestore();
  const missing = env.authenticatedContext('missing-admin', { admin: true }).firestore();
  await assertSucceeds(getDoc(doc(active, 'users', 'owner')));
  await assertFails(getDoc(doc(inactive, 'users', 'owner')));
  await assertFails(getDoc(doc(missing, 'users', 'owner')));
});

test('social children inherit their parent publication state', {
  skip: !hasEmulators,
}, async () => {
  const db = env.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(doc(db, 'recommendations', 'rec-active', 'comments', 'comment-1')));
  await assertSucceeds(getDoc(doc(db, 'recommendations', 'rec-active', 'likes', 'owner')));
  await assertFails(getDoc(doc(db, 'recommendations', 'rec-deleting', 'comments', 'comment-1')));
  await assertFails(getDoc(doc(db, 'recommendations', 'rec-deleting', 'likes', 'owner')));
});

test('threaded comment root and reply queries remain bounded and active-only', {
  skip: !hasEmulators,
}, async () => {
  const db = env.unauthenticatedContext().firestore();
  await assertSucceeds(getDocs(query(
    collection(db, 'recommendations', 'rec-active', 'comments'),
    where('status', '==', 'active'),
    where('threadType', '==', 'root'),
    orderBy('createdAt', 'desc'),
    limit(20)
  )));
  await assertFails(getDoc(doc(
    db, 'recommendations', 'rec-active', 'comments', 'orphan-reply'
  )));
  await assertFails(getDocs(query(
    collection(db, 'recommendations', 'rec-active', 'comments'),
    where('status', '==', 'active'),
    where('threadType', '==', 'reply'),
    where('threadRootId', '==', 'held-root'),
    orderBy('createdAt', 'asc'),
    limit(20)
  )));
  await assertSucceeds(getDocs(query(
    collection(db, 'recommendations', 'rec-active', 'comments'),
    where('status', '==', 'active'),
    where('threadType', '==', 'reply'),
    where('threadRootId', '==', 'comment-1'),
    orderBy('createdAt', 'asc'),
    limit(20)
  )));
  await assertFails(getDocs(query(
    collection(db, 'recommendations', 'rec-active', 'comments'),
    where('threadType', '==', 'root'),
    limit(20)
  )));
  await assertFails(getDocs(query(
    collection(db, 'recommendations', 'rec-active', 'comments'),
    where('status', '==', 'active'),
    where('threadType', '==', 'root'),
    limit(31)
  )));
});

test('blocked-user documents are private to their owner and server-written', {
  skip: !hasEmulators,
}, async () => {
  const ownerDb = env.authenticatedContext('owner', verifiedClaims).firestore();
  const otherDb = env.authenticatedContext('other', verifiedClaims).firestore();
  await assertSucceeds(getDoc(doc(ownerDb, 'users', 'owner', 'blockedUsers', 'other')));
  await assertFails(getDoc(doc(otherDb, 'users', 'owner', 'blockedUsers', 'other')));
  await assertFails(setDoc(doc(ownerDb, 'users', 'owner', 'blockedUsers', 'new-user'), {
    blockedUid: 'new-user',
  }));
});

test('public collection queries require an active filter and bounded limit', {
  skip: !hasEmulators,
}, async () => {
  const db = env.unauthenticatedContext().firestore();
  await assertSucceeds(getDocs(query(
    collection(db, 'recommendations'),
    where('status', '==', 'active'),
    where('publicationGate.destinationApprovalVerified', '==', true),
    limit(50)
  )));
  await assertFails(getDocs(query(
    collection(db, 'recommendations'),
    where('status', '==', 'active'),
    limit(50)
  )));
  await assertFails(getDocs(query(collection(db, 'recommendations'), limit(50))));
  await assertFails(getDocs(query(
    collection(db, 'recommendations'),
    where('status', '==', 'active'),
    where('publicationGate.destinationApprovalVerified', '==', true),
    limit(51)
  )));
});

test('public destination collection queries use the bounded catalog callable', {
  skip: !hasEmulators,
}, async () => {
  const db = env.unauthenticatedContext().firestore();
  await assertFails(getDocs(query(
    collection(db, 'countries', 'cty_il', 'destinations'),
    where('status', '==', 'active'),
    limit(100)
  )));
  await assertFails(getDocs(query(
    collectionGroup(db, 'destinations'),
    where('status', '==', 'active'),
    limit(100)
  )));
});

test('destinations under inactive countries are not public', {
  skip: !hasEmulators,
}, async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'countries', 'cty_hidden'), {
      name: 'Hidden country', code: 'ZZ', status: 'inactive',
    });
    await setDoc(doc(db, 'countries', 'cty_hidden', 'destinations', 'city_active_child'), {
      schemaVersion: 3,
      countryId: 'cty_hidden', status: 'active',
      canonicalPolicy: {
        approved: true, registryId: 'zz-hidden-city', kind: 'city_hub',
        groupingPolicy: 'self', registryVersion: 3, approvalRevision: 1,
        registryAttestation: {
          approved: true, registryId: 'zz-hidden-city', registryVersion: 3,
          approvalRevision: 1, countryId: 'cty_hidden',
        },
      },
      googleCache: { names: { he: 'Hidden', en: 'Hidden' }, expiresAt: new Date('2099-01-01') },
    });
  });
  const db = env.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(db, 'countries', 'cty_hidden', 'destinations', 'city_active_child')));
});

test('active-looking destinations and content stay private until the canonical publication gate is verified', {
  skip: !hasEmulators,
}, async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'countries', 'cty_il', 'destinations', 'city_pending'), {
      schemaVersion: 3,
      countryId: 'cty_il', status: 'active',
      canonicalPolicy: {
        approved: false, registryId: 'il-pending-city', kind: 'city_hub',
        groupingPolicy: 'self', registryVersion: 3, provisional: true,
      },
      googleCache: { names: { he: 'Pending', en: 'Pending' }, expiresAt: new Date('2099-01-01') },
    });
    await setDoc(doc(db, 'recommendations', 'rec-missing-gate'), {
      ownerId: 'owner', title: 'Legacy active', status: 'active',
    });
    await setDoc(doc(db, 'recommendations', 'rec-false-gate'), {
      ownerId: 'owner', title: 'Held', status: 'active',
      publicationGate: { destinationApprovalVerified: false },
    });
  });
  const db = env.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(db, 'countries', 'cty_il', 'destinations', 'city_pending')));
  await assertFails(getDoc(doc(db, 'recommendations', 'rec-missing-gate')));
  await assertFails(getDoc(doc(db, 'recommendations', 'rec-false-gate')));
});

test('business documents and interactions are server-only', {
  skip: !hasEmulators,
}, async () => {
  const db = env.authenticatedContext('owner', verifiedClaims).firestore();
  await assertFails(setDoc(doc(db, 'recommendations', 'direct'), {
    ownerId: 'owner', title: 'Direct', status: 'active',
  }));
  await assertFails(setDoc(doc(db, 'recommendations', 'rec-active', 'likes', 'owner'), {
    ownerId: 'owner', createdAt: new Date(),
  }));
  await assertFails(setDoc(doc(db, 'recommendations', 'rec-active', 'comments', 'comment-2'), {
    ownerId: 'owner', text: 'Direct comment',
  }));
  await assertFails(setDoc(doc(db, 'countries', 'cty_fr'), {
    name: 'France', code: 'FR', status: 'active',
  }));
});

test('legacy mutable route day and stop paths are no longer public', {
  skip: !hasEmulators,
}, async () => {
  const db = env.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(db, 'routes', 'route-active', 'days', 'day-1')));
  await assertFails(getDocs(query(
    collection(db, 'routes', 'route-active', 'days'), limit(60)
  )));
  await assertFails(getDoc(doc(
    db, 'routes', 'route-active', 'days', 'day-1', 'stops', 'stop-1'
  )));
  await assertFails(setDoc(doc(db, 'routes', 'route-active', 'days', 'day-2'), {
    title: 'Direct',
  }));
});

test('only the active immutable route revision is public', {
  skip: !hasEmulators,
}, async () => {
  const db = env.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(doc(
    db, 'routes', 'route-active', 'revisions', 'revision-active', 'days', 'day-1'
  )));
  await assertSucceeds(getDocs(query(
    collection(db, 'routes', 'route-active', 'revisions', 'revision-active', 'days'),
    limit(60)
  )));
  await assertSucceeds(getDoc(doc(
    db,
    'routes', 'route-active', 'revisions', 'revision-active', 'days', 'day-1', 'stops', 'stop-1'
  )));
  await assertFails(getDoc(doc(
    db, 'routes', 'route-active', 'revisions', 'revision-old', 'days', 'day-1'
  )));
});

test('users can read only their own private data and cannot write projections', {
  skip: !hasEmulators,
}, async () => {
  const ownerDb = env.authenticatedContext('owner', verifiedClaims).firestore();
  const otherDb = env.authenticatedContext('other', verifiedClaims).firestore();
  await assertSucceeds(getDoc(doc(ownerDb, 'users', 'owner')));
  await assertSucceeds(getDoc(doc(ownerDb, 'users', 'owner', 'favorites', 'favorite-hash')));
  await assertSucceeds(getDoc(doc(ownerDb, 'users', 'owner', 'notifications', 'notification-1')));
  await assertFails(getDoc(doc(otherDb, 'users', 'owner')));
  await assertFails(getDoc(doc(otherDb, 'users', 'owner', 'favorites', 'favorite-hash')));
  await assertFails(setDoc(doc(ownerDb, 'users', 'owner', 'favorites', 'other'), {
    ownerId: 'owner', type: 'recommendation',
  }));
});

test('notification queries are owner-only and bounded', {
  skip: !hasEmulators,
}, async () => {
  const ownerDb = env.authenticatedContext('owner', verifiedClaims).firestore();
  const otherDb = env.authenticatedContext('other', verifiedClaims).firestore();
  const ownerNotifications = collection(ownerDb, 'users', 'owner', 'notifications');
  const otherNotifications = collection(otherDb, 'users', 'owner', 'notifications');

  await assertSucceeds(getDocs(query(
    ownerNotifications,
    where('schemaVersion', '==', 2),
    where('channel', '==', 'personal'),
    orderBy('createdAt', 'desc'),
    limit(25)
  )));
  await assertFails(getDocs(query(
    ownerNotifications,
    where('schemaVersion', '==', 2),
    where('channel', '==', 'personal'),
    orderBy('createdAt', 'desc')
  )));
  await assertFails(getDocs(query(
    ownerNotifications,
    where('schemaVersion', '==', 2),
    where('channel', '==', 'personal'),
    orderBy('createdAt', 'desc'),
    limit(26)
  )));
  await assertFails(getDocs(query(
    otherNotifications,
    where('schemaVersion', '==', 2),
    where('channel', '==', 'personal'),
    orderBy('createdAt', 'desc'),
    limit(25)
  )));
});

test('admin notification reads require ownership, claim, active registry, and channel filters', {
  skip: !hasEmulators,
}, async () => {
  const ownerDb = env.authenticatedContext('owner', verifiedClaims).firestore();
  const activeAdminDb = env.authenticatedContext('active-admin', { ...verifiedClaims, admin: true }).firestore();
  const inactiveAdminDb = env.authenticatedContext('inactive-admin', { ...verifiedClaims, admin: true }).firestore();

  await assertFails(getDoc(doc(ownerDb, 'users', 'owner', 'notifications', 'notification-admin')));
  await assertSucceeds(getDoc(doc(activeAdminDb, 'users', 'active-admin', 'notifications', 'notification-admin')));
  await assertFails(getDoc(doc(inactiveAdminDb, 'users', 'inactive-admin', 'notifications', 'notification-admin')));
  await assertSucceeds(getDocs(query(
    collection(activeAdminDb, 'users', 'active-admin', 'notifications'),
    where('schemaVersion', '==', 2),
    where('channel', '==', 'admin'),
    orderBy('createdAt', 'desc'),
    limit(25)
  )));
  await assertFails(getDocs(query(
    collection(ownerDb, 'users', 'owner', 'notifications'),
    orderBy('createdAt', 'desc'),
    limit(25)
  )));
});

test('notification state is owner-get-only and devices stay server-only', {
  skip: !hasEmulators,
}, async () => {
  const ownerDb = env.authenticatedContext('owner', verifiedClaims).firestore();
  const otherDb = env.authenticatedContext('other', verifiedClaims).firestore();
  const stateRef = doc(ownerDb, 'users', 'owner', 'notificationState', 'state');

  await assertSucceeds(getDoc(stateRef));
  await assertFails(getDoc(doc(otherDb, 'users', 'owner', 'notificationState', 'state')));
  await assertFails(getDocs(query(
    collection(ownerDb, 'users', 'owner', 'notificationState'),
    limit(1)
  )));
  await assertFails(setDoc(stateRef, { personalUnread: 999 }, { merge: true }));
  await assertFails(getDoc(doc(ownerDb, 'notificationDevices', 'token-hash')));
  await assertFails(setDoc(doc(ownerDb, 'notificationDevices', 'other-token'), {
    uid: 'owner', token: 'private', platform: 'ios',
  }));
  await assertFails(setDoc(doc(ownerDb, 'users', 'owner', 'notifications', 'direct'), {
    schemaVersion: 2, channel: 'personal', type: 'system', isRead: false,
  }));
});

test('storage accepts active owned JPEG staging creates without a tester allowlist', {
  skip: !hasEmulators,
}, async () => {
  const ownerStorage = env.authenticatedContext('owner', verifiedClaims).storage();
  const unverifiedStorage = env.authenticatedContext('owner', unverifiedClaims).storage();
  const incompleteStorage = env.authenticatedContext('incomplete', verifiedClaims).storage();
  const noyaSkippedStorage = env.authenticatedContext('noya-skipped', verifiedClaims).storage();
  const missingProfileStorage = env.authenticatedContext('missing-profile', verifiedClaims).storage();
  const validPath = 'media-staging/owner/123e4567-e89b-42d3-a456-426614174000.jpg';
  const metadata = {
    contentType: 'image/jpeg',
    customMetadata: { ownerUid: 'owner', variant: 'staging' },
  };
  await assertSucceeds(uploadBytes(ref(ownerStorage, validPath), new Uint8Array([1, 2, 3]), metadata));
  await assertSucceeds(uploadBytes(
    ref(noyaSkippedStorage, 'media-staging/noya-skipped/123e4567-e89b-42d3-a456-426614174006.jpg'),
    new Uint8Array([1]),
    { contentType: 'image/jpeg', customMetadata: { ownerUid: 'noya-skipped', variant: 'staging' } }
  ));
  await assertFails(uploadBytes(ref(ownerStorage, validPath), new Uint8Array([4]), metadata));
  await assertFails(uploadBytes(
    ref(missingProfileStorage, 'media-staging/missing-profile/123e4567-e89b-42d3-a456-426614174005.jpg'),
    new Uint8Array([1]),
    { contentType: 'image/jpeg', customMetadata: { ownerUid: 'missing-profile', variant: 'staging' } }
  ));
  await assertFails(uploadBytes(
    ref(unverifiedStorage, 'media-staging/owner/123e4567-e89b-42d3-a456-426614174001.jpg'),
    new Uint8Array([1]), metadata
  ));
  await assertFails(uploadBytes(
    ref(incompleteStorage, 'media-staging/incomplete/123e4567-e89b-42d3-a456-426614174004.jpg'),
    new Uint8Array([1]),
    { contentType: 'image/jpeg', customMetadata: { ownerUid: 'incomplete', variant: 'staging' } }
  ));
  await assertFails(uploadBytes(
    ref(ownerStorage, 'media-staging/other/123e4567-e89b-42d3-a456-426614174002.jpg'),
    new Uint8Array([1]), metadata
  ));
  await assertFails(uploadBytes(
    ref(ownerStorage, 'media-staging/owner/123e4567-e89b-42d3-a456-426614174003.jpg'),
    new Uint8Array([1]), { ...metadata, contentType: 'image/png' }
  ));
});

test('registered active media permits public get but never list or client mutation', {
  skip: !hasEmulators,
}, async () => {
  const anonymousStorage = env.unauthenticatedContext().storage();
  const ownerStorage = env.authenticatedContext('owner', verifiedClaims).storage();
  const mediaRef = ref(anonymousStorage, `media/owner/${ACTIVE_ASSET_ID}/large.webp`);
  await assertSucceeds(getBytes(mediaRef));
  await assertFails(listAll(ref(anonymousStorage, `media/owner/${ACTIVE_ASSET_ID}`)));
  await assertFails(uploadBytes(
    ref(ownerStorage, 'media/owner/other/large.webp'),
    new Uint8Array([1]), { contentType: 'image/webp' }
  ));
  await assertFails(deleteObject(ref(ownerStorage, `media/owner/${ACTIVE_ASSET_ID}/large.webp`)));
});

test('held canonical media is no longer publicly readable through Storage Rules', {
  skip: !hasEmulators,
}, async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'system', 'media', 'assets', ACTIVE_ASSET_ID), {
      status: 'held', ownerUid: 'owner',
    });
  });
  const anonymousStorage = env.unauthenticatedContext().storage();
  await assertFails(getBytes(ref(anonymousStorage, `media/owner/${ACTIVE_ASSET_ID}/large.webp`)));
});

test('unregistered canonical media is not publicly readable', {
  skip: !hasEmulators,
}, async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    await uploadBytes(
      ref(context.storage(), `media/owner/${UNREGISTERED_ASSET_ID}/large.webp`),
      new Uint8Array([1, 2, 3]),
      { contentType: 'image/webp' }
    );
  });
  const anonymousStorage = env.unauthenticatedContext().storage();
  await assertFails(getBytes(ref(anonymousStorage, `media/owner/${UNREGISTERED_ASSET_ID}/large.webp`)));
});

test('a registry entry cannot publish media under a different owner path', {
  skip: !hasEmulators,
}, async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    await uploadBytes(
      ref(context.storage(), `media/other/${ACTIVE_ASSET_ID}/large.webp`),
      new Uint8Array([1, 2, 3]),
      { contentType: 'image/webp' }
    );
  });
  const anonymousStorage = env.unauthenticatedContext().storage();
  await assertFails(getBytes(ref(anonymousStorage, `media/other/${ACTIVE_ASSET_ID}/large.webp`)));
});

test('the media registry publishes only canonical image variants', {
  skip: !hasEmulators,
}, async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    await uploadBytes(
      ref(context.storage(), `media/owner/${ACTIVE_ASSET_ID}/original.jpg`),
      new Uint8Array([1, 2, 3]),
      { contentType: 'image/jpeg' }
    );
  });
  const anonymousStorage = env.unauthenticatedContext().storage();
  await assertFails(getBytes(ref(anonymousStorage, `media/owner/${ACTIVE_ASSET_ID}/original.jpg`)));
});

test('legacy user-media prefixes are no longer public', {
  skip: !hasEmulators,
}, async () => {
  const paths = [
    'optimized/old.webp',
    'profilePicture/owner/avatar.jpg',
    'recommendations/owner/old.jpg',
    'routes/owner/old.jpg',
    'trips/owner/old.jpg',
  ];
  await env.withSecurityRulesDisabled(async (context) => {
    await Promise.all(paths.map((path) => uploadBytes(
      ref(context.storage(), path),
      new Uint8Array([1, 2, 3]),
      { contentType: 'image/jpeg' }
    )));
  });
  const anonymousStorage = env.unauthenticatedContext().storage();
  await Promise.all(paths.map((path) => assertFails(getBytes(ref(anonymousStorage, path)))));
});
