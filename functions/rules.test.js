const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} = require('@firebase/rules-unit-testing');
const {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} = require('firebase/firestore');
const {
  deleteObject,
  getBytes,
  ref,
  uploadBytes,
} = require('firebase/storage');

const hasEmulators = Boolean(
  process.env.FIRESTORE_EMULATOR_HOST &&
    process.env.FIREBASE_STORAGE_EMULATOR_HOST
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
    firestore: {
      rules: fs.readFileSync(path.join(rootDir, 'firestore.rules'), 'utf8'),
    },
    storage: {
      rules: fs.readFileSync(path.join(rootDir, 'storage.rules'), 'utf8'),
    },
  });
});

test.after(async () => {
  await env?.cleanup();
});

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
      privatePreference: 'hidden',
    });
    await setDoc(doc(db, 'publicProfiles', 'owner'), {
      uid: 'owner',
      displayName: 'Public owner',
    });
    await setDoc(doc(db, 'countries', 'IL'), {
      name: 'Israel',
      code: 'IL',
    });
    await setDoc(doc(db, 'countries', 'IL', 'cities', 'TLV'), {
      name: 'Tel Aviv',
      googlePlaceId: 'city-place',
    });
    await setDoc(doc(db, 'countries', 'IL', 'cities', 'Ariel'), {
      name: 'Ariel',
      googlePlaceId: 'ariel-place',
    });
    await setDoc(doc(db, 'recommendations', 'rec-1'), {
      userId: 'owner',
      title: 'Recommendation',
      likes: 0,
      likedBy: [],
      createdAt: new Date(),
    });
    await setDoc(doc(db, 'routes', 'route-1'), {
      userId: 'owner',
      Title: 'Route',
      likes: 0,
      likedBy: [],
      createdAt: new Date(),
    });
  });
});

test('public content/profile reads work while private users are isolated', {
  skip: !hasEmulators,
}, async () => {
  const anonymousDb = env.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(doc(anonymousDb, 'recommendations', 'rec-1')));
  await assertSucceeds(getDoc(doc(anonymousDb, 'publicProfiles', 'owner')));
  await assertFails(getDoc(doc(anonymousDb, 'users', 'owner')));

  const otherDb = env
    .authenticatedContext('other', verifiedClaims)
    .firestore();
  await assertFails(getDoc(doc(otherDb, 'users', 'owner')));

  const ownerDb = env
    .authenticatedContext('owner', {
      ...verifiedClaims,
      email: 'owner@example.com',
    })
    .firestore();
  await assertSucceeds(getDoc(doc(ownerDb, 'users', 'owner')));
});

test('recommendation and destination writes are server-only; own exact likes work', {
  skip: !hasEmulators,
}, async () => {
  const ownerDb = env
    .authenticatedContext('owner', {
      ...verifiedClaims,
      email: 'owner@example.com',
    })
    .firestore();

  await assertFails(
    setDoc(doc(ownerDb, 'recommendations', 'direct'), {
      userId: 'owner',
      title: 'Direct write',
    })
  );
  await assertFails(
    setDoc(doc(ownerDb, 'countries', 'FR'), {
      name: 'France',
      code: 'FR',
    })
  );
  await assertFails(
    setDoc(doc(ownerDb, 'countries', 'IL', 'cities', 'fake'), {
      name: 'Fake city',
    })
  );

  await assertSucceeds(
    updateDoc(doc(ownerDb, 'recommendations', 'rec-1'), {
      likes: 1,
      likedBy: ['owner'],
    })
  );
  await assertFails(
    updateDoc(doc(ownerDb, 'recommendations', 'rec-1'), {
      likes: 99,
      likedBy: ['owner', 'victim'],
    })
  );
  await assertFails(
    updateDoc(doc(ownerDb, 'recommendations', 'rec-1'), {
      title: 'Client edit',
    })
  );
});

test('routes and comments enforce verification, ownership and immutable fields', {
  skip: !hasEmulators,
}, async () => {
  const ownerDb = env
    .authenticatedContext('owner', {
      ...verifiedClaims,
      email: 'owner@example.com',
    })
    .firestore();
  const unverifiedDb = env
    .authenticatedContext('other', unverifiedClaims)
    .firestore();

  const routeData = {
    Title: 'New route',
    days: 1,
    tripDaysData: [],
    places: ['Tel Aviv'],
    distance: 5,
    tags: [],
    desc: 'A valid route',
    difficultyTag: '',
    travelStyleTag: '',
    roadTripTags: [],
    experienceTags: [],
    userId: 'owner',
    media: [],
    createdAt: serverTimestamp(),
  };
  await assertSucceeds(setDoc(doc(ownerDb, 'routes', 'route-2'), routeData));
  await assertSucceeds(
    updateDoc(doc(ownerDb, 'routes', 'route-2'), {
      likes: 1,
      likedBy: ['owner'],
    })
  );
  await assertFails(
    setDoc(doc(unverifiedDb, 'routes', 'route-3'), {
      ...routeData,
      userId: 'other',
    })
  );
  await assertFails(
    updateDoc(doc(ownerDb, 'routes', 'route-1'), {
      userId: 'other',
    })
  );

  await assertSucceeds(
    setDoc(doc(ownerDb, 'recommendations', 'rec-1', 'comments', 'comment-1'), {
      text: 'Useful comment',
      userId: 'owner',
      createdAt: serverTimestamp(),
    })
  );
  await assertFails(
    setDoc(doc(ownerDb, 'recommendations', 'rec-1', 'comments', 'comment-2'), {
      text: '',
      userId: 'owner',
      createdAt: serverTimestamp(),
    })
  );
});

test('user documents protect identity and trust fields; favorites are bounded', {
  skip: !hasEmulators,
}, async () => {
  const ownerDb = env
    .authenticatedContext('owner', {
      ...verifiedClaims,
      email: 'owner@example.com',
    })
    .firestore();

  await assertSucceeds(
    updateDoc(doc(ownerDb, 'users', 'owner'), {
      displayName: 'Updated',
      updatedAt: serverTimestamp(),
    })
  );
  await assertFails(
    updateDoc(doc(ownerDb, 'users', 'owner'), {
      isExpert: true,
    })
  );
  await assertSucceeds(
    setDoc(doc(ownerDb, 'users', 'owner', 'favorites', 'rec-1'), {
      id: 'rec-1',
      type: 'recommendations',
      name: 'Snapshot',
      created_at: serverTimestamp(),
    })
  );
  await assertSucceeds(
    setDoc(doc(ownerDb, 'users', 'owner', 'favorites', 'route-1'), {
      id: 'route-1',
      type: 'routes',
      name: 'Existing route',
      created_at: serverTimestamp(),
    })
  );
  await assertSucceeds(
    setDoc(doc(ownerDb, 'users', 'owner', 'favorites', 'TLV'), {
      id: 'TLV',
      type: 'cities',
      countryId: 'IL',
      name: 'Tel Aviv',
      created_at: serverTimestamp(),
    })
  );
  await assertFails(
    setDoc(doc(ownerDb, 'users', 'owner', 'favorites', 'missing-rec'), {
      id: 'missing-rec',
      type: 'recommendations',
      name: 'Deleted recommendation',
      created_at: serverTimestamp(),
    })
  );
  await assertFails(
    setDoc(doc(ownerDb, 'users', 'owner', 'favorites', 'missing-route'), {
      id: 'missing-route',
      type: 'routes',
      name: 'Deleted route',
      created_at: serverTimestamp(),
    })
  );
  await assertFails(
    setDoc(doc(ownerDb, 'users', 'owner', 'favorites', 'Ariel'), {
      id: 'Ariel',
      type: 'cities',
      countryId: 'US',
      name: 'Wrong country',
      created_at: serverTimestamp(),
    })
  );
  await assertFails(
    setDoc(doc(ownerDb, 'users', 'owner', 'favorites', 'evil'), {
      id: 'evil',
      type: 'recommendations',
      privatePayload: 'not allowed',
      created_at: serverTimestamp(),
    })
  );
});

test('notifications bind the actor and recipient to the referenced post', {
  skip: !hasEmulators,
}, async () => {
  const actorDb = env
    .authenticatedContext('actor', {
      ...verifiedClaims,
      email: 'actor@example.com',
    })
    .firestore();
  const validNotification = {
    userId: 'owner',
    type: 'like',
    postType: 'recommendation',
    postId: 'rec-1',
    postTitle: 'Recommendation',
    actorId: 'actor',
    actorName: 'Actor',
    actorAvatar: null,
    count: 1,
    batchThreshold: 1,
    isRead: false,
    timestamp: serverTimestamp(),
  };

  await assertSucceeds(
    setDoc(
      doc(actorDb, 'users', 'owner', 'notifications', 'valid'),
      validNotification
    )
  );
  await assertFails(
    setDoc(
      doc(actorDb, 'users', 'victim', 'notifications', 'wrong-recipient'),
      { ...validNotification, userId: 'victim' }
    )
  );
  await assertFails(
    setDoc(
      doc(actorDb, 'users', 'owner', 'notifications', 'spoofed-actor'),
      { ...validNotification, actorId: 'someone-else' }
    )
  );
});

const jpegMetadata = (ownerUid, variant = 'staging') => ({
  contentType: 'image/jpeg',
  customMetadata: { ownerUid, variant },
});
const fullUuid = '123e4567-e89b-42d3-a456-426614174000.jpg';
const secondUuid = '123e4567-e89b-42d3-a456-426614174001.jpg';

test('storage accepts only owned staging JPEGs and blocks final client writes', {
  skip: !hasEmulators,
}, async () => {
  const ownerStorage = env
    .authenticatedContext('owner', {
      ...verifiedClaims,
      email: 'owner@example.com',
    })
    .storage();
  const otherStorage = env
    .authenticatedContext('other', verifiedClaims)
    .storage();
  const target = ref(
    ownerStorage,
    `media-staging/owner/${fullUuid}`
  );

  await assertSucceeds(
    uploadBytes(target, new Uint8Array([0xff, 0xd8, 0xff]), jpegMetadata('owner'))
  );
  await assertFails(
    uploadBytes(target, new Uint8Array([0xff, 0xd8]), jpegMetadata('owner'))
  );
  await assertFails(
    uploadBytes(
      ref(otherStorage, `media-staging/owner/${secondUuid}`),
      new Uint8Array([0xff, 0xd8]),
      jpegMetadata('other')
    )
  );
  await assertFails(
    uploadBytes(
      ref(ownerStorage, `media-staging/owner/${secondUuid}`),
      new Uint8Array([1, 2, 3]),
      {
        contentType: 'image/png',
        customMetadata: { ownerUid: 'owner', variant: 'staging' },
      }
    )
  );
  await assertFails(
    uploadBytes(
      ref(
        ownerStorage,
        'media/owner/123e4567-e89b-42d3-a456-426614174010/large.webp'
      ),
      new Uint8Array([0xff, 0xd8]),
      jpegMetadata('owner')
    )
  );

  await assertSucceeds(deleteObject(target));
});

test('storage blocks oversized staging files and keeps final media public', {
  skip: !hasEmulators,
}, async () => {
  const ownerStorage = env
    .authenticatedContext('owner', {
      ...verifiedClaims,
      email: 'owner@example.com',
    })
    .storage();
  await assertFails(
    uploadBytes(
      ref(ownerStorage, `media-staging/owner/${fullUuid}`),
      new Uint8Array(20 * 1024 * 1024 + 1),
      jpegMetadata('owner')
    )
  );

  await env.withSecurityRulesDisabled(async (context) => {
    await uploadBytes(
      ref(
        context.storage(),
        'media/owner/123e4567-e89b-42d3-a456-426614174010/thumb.webp'
      ),
      new Uint8Array([1, 2, 3]),
      { contentType: 'image/webp' }
    );
  });
  await assertSucceeds(
    getBytes(
      ref(
        env.unauthenticatedContext().storage(),
        'media/owner/123e4567-e89b-42d3-a456-426614174010/thumb.webp'
      )
    )
  );
  await assertFails(
    deleteObject(
      ref(
        ownerStorage,
        'media/owner/123e4567-e89b-42d3-a456-426614174010/thumb.webp'
      )
    )
  );
});
