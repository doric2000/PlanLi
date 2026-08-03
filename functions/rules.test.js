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
    });
    await setDoc(doc(db, 'publicProfiles', 'owner'), {
      displayName: 'Public owner',
    });
    await setDoc(doc(db, 'countries', 'cty_il'), {
      name: 'Israel', code: 'IL', status: 'active',
    });
    await setDoc(doc(db, 'countries', 'cty_il', 'cities', 'city_tlv'), {
      name: 'Tel Aviv', status: 'active',
    });
    await setDoc(doc(db, 'recommendations', 'rec-active'), {
      ownerId: 'owner', title: 'Active', status: 'active',
    });
    await setDoc(doc(db, 'recommendations', 'rec-deleting'), {
      ownerId: 'owner', title: 'Deleting', status: 'deleting',
    });
    await setDoc(doc(db, 'routes', 'route-active'), {
      ownerId: 'owner', title: 'Route', status: 'active',
    });
    await setDoc(doc(db, 'routes', 'route-active', 'days', 'day-1'), {
      position: 0, title: 'Day 1',
    });
    await setDoc(doc(db, 'routes', 'route-active', 'days', 'day-1', 'stops', 'stop-1'), {
      position: 0, title: 'Stop 1',
    });
    await setDoc(doc(db, 'users', 'owner', 'favorites', 'favorite-hash'), {
      ownerId: 'owner', type: 'recommendation', target: { id: 'rec-active' },
    });
    await setDoc(doc(db, 'users', 'owner', 'notifications', 'notification-1'), {
      actorId: 'other', type: 'like', isRead: false,
    });
    await setDoc(doc(db, 'system', 'accountDeletion', 'jobs', 'private'), { status: 'running' });
    await setDoc(doc(db, 'recommendations', 'rec-active', 'comments', 'comment-1'), {
      ownerId: 'owner', text: 'Hello',
    });

    const storage = context.storage();
    await uploadBytes(ref(storage, 'media/owner/asset/large.webp'), new Uint8Array([1, 2, 3]), {
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
  await assertSucceeds(getDoc(doc(db, 'publicProfiles', 'owner')));
  await assertFails(getDoc(doc(db, 'users', 'owner')));
  await assertFails(getDoc(doc(db, 'system', 'accountDeletion', 'jobs', 'private')));
});

test('public collection queries require an active filter and bounded limit', {
  skip: !hasEmulators,
}, async () => {
  const db = env.unauthenticatedContext().firestore();
  await assertSucceeds(getDocs(query(
    collection(db, 'recommendations'),
    where('status', '==', 'active'),
    limit(50)
  )));
  await assertFails(getDocs(query(collection(db, 'recommendations'), limit(50))));
  await assertFails(getDocs(query(
    collection(db, 'recommendations'),
    where('status', '==', 'active'),
    limit(51)
  )));
});

test('city collection-group queries require an active filter and bounded limit', {
  skip: !hasEmulators,
}, async () => {
  const db = env.unauthenticatedContext().firestore();
  await assertSucceeds(getDocs(query(
    collectionGroup(db, 'cities'),
    where('status', '==', 'active'),
    limit(100)
  )));
  await assertFails(getDocs(query(collectionGroup(db, 'cities'), limit(100))));
  await assertFails(getDocs(query(
    collectionGroup(db, 'cities'),
    where('status', '==', 'active'),
    limit(101)
  )));
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

test('route day and stop reads require an active parent and bounded queries', {
  skip: !hasEmulators,
}, async () => {
  const db = env.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(doc(db, 'routes', 'route-active', 'days', 'day-1')));
  await assertSucceeds(getDocs(query(
    collection(db, 'routes', 'route-active', 'days'), limit(60)
  )));
  await assertSucceeds(getDoc(doc(
    db, 'routes', 'route-active', 'days', 'day-1', 'stops', 'stop-1'
  )));
  await assertFails(setDoc(doc(db, 'routes', 'route-active', 'days', 'day-2'), {
    title: 'Direct',
  }));
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
    where('isRead', '==', false),
    limit(50)
  )));
  await assertFails(getDocs(query(
    ownerNotifications,
    where('isRead', '==', false)
  )));
  await assertFails(getDocs(query(
    otherNotifications,
    where('isRead', '==', false),
    limit(50)
  )));
});

test('storage accepts only verified owned JPEG staging creates', {
  skip: !hasEmulators,
}, async () => {
  const ownerStorage = env.authenticatedContext('owner', verifiedClaims).storage();
  const unverifiedStorage = env.authenticatedContext('owner', unverifiedClaims).storage();
  const validPath = 'media-staging/owner/123e4567-e89b-42d3-a456-426614174000.jpg';
  const metadata = {
    contentType: 'image/jpeg',
    customMetadata: { ownerUid: 'owner', variant: 'staging' },
  };
  await assertSucceeds(uploadBytes(ref(ownerStorage, validPath), new Uint8Array([1, 2, 3]), metadata));
  await assertFails(uploadBytes(ref(ownerStorage, validPath), new Uint8Array([4]), metadata));
  await assertFails(uploadBytes(
    ref(unverifiedStorage, 'media-staging/owner/123e4567-e89b-42d3-a456-426614174001.jpg'),
    new Uint8Array([1]), metadata
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

test('final media permits public get but never list or client mutation', {
  skip: !hasEmulators,
}, async () => {
  const anonymousStorage = env.unauthenticatedContext().storage();
  const ownerStorage = env.authenticatedContext('owner', verifiedClaims).storage();
  const mediaRef = ref(anonymousStorage, 'media/owner/asset/large.webp');
  await assertSucceeds(getBytes(mediaRef));
  await assertFails(listAll(ref(anonymousStorage, 'media/owner/asset')));
  await assertFails(uploadBytes(
    ref(ownerStorage, 'media/owner/other/large.webp'),
    new Uint8Array([1]), { contentType: 'image/webp' }
  ));
  await assertFails(deleteObject(ref(ownerStorage, 'media/owner/asset/large.webp')));
});
