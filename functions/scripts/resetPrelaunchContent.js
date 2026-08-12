/* eslint-disable no-console, no-await-in-loop */
// Deliberately destructive pre-launch reset.  It is dry-run by default and
// requires an explicit confirmation phrase before any production write.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const admin = require('firebase-admin');

const { initializeAdmin } = require('./localCredentials');

const CONFIRMATION = 'DELETE_ALL_PRELAUNCH_CONTENT';
const STATE_DIRECTORY = path.join(__dirname, '..', '.prelaunch-reset');
const DEFAULT_MANIFEST = path.join(STATE_DIRECTORY, 'manifest.json');

function hasArgument(name) {
  return process.argv.includes(name);
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function manifestPath() {
  const specified = argumentValue('--manifest');
  return specified ? path.resolve(process.cwd(), specified) : DEFAULT_MANIFEST;
}

function writeManifest(filePath, manifest) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

function hasBotMarker(value) {
  if (!value) return false;
  if (typeof value === 'string') return /bot/i.test(value);
  if (Array.isArray(value)) return value.some(hasBotMarker);
  if (typeof value === 'object' && !value.toDate) return Object.values(value).some(hasBotMarker);
  return false;
}

function retainedUserSets(authUsers, usersByUid = new Map(), profilesByUid = new Map()) {
  const adminUids = authUsers
    .filter((user) => user.customClaims?.admin === true)
    .map((user) => user.uid);
  const botUids = authUsers
    .filter((user) => user.customClaims?.bot === true ||
      hasBotMarker(usersByUid.get(user.uid)) ||
      hasBotMarker(profilesByUid.get(user.uid)))
    .map((user) => user.uid);
  if (!adminUids.length) throw new Error('Reset aborted: no Firebase Auth ADMIN account was found.');
  if (!botUids.length) throw new Error('Reset aborted: no BOT account was found.');
  return {
    adminUids: [...new Set(adminUids)].sort(),
    botUids: [...new Set(botUids)].sort(),
    keepUids: [...new Set([...adminUids, ...botUids])].sort(),
  };
}

function sortedStrings(values) {
  return [...new Set(Array.isArray(values) ? values : [])].sort();
}

function manifestScope(manifest) {
  const deletion = manifest?.delete || {};
  return {
    projectId: manifest?.projectId || null,
    keepUids: sortedStrings(manifest?.keep?.uids),
    delete: Object.fromEntries(
      Object.keys(deletion).sort().map((key) => [key, sortedStrings(deletion[key])])
    ),
  };
}

function manifestFingerprint(manifest) {
  return crypto.createHash('sha256')
    .update(JSON.stringify(manifestScope(manifest)))
    .digest('hex');
}

async function listAllAuthUsers(auth) {
  let pageToken;
  const users = [];
  do {
    // eslint-disable-next-line no-await-in-loop
    const page = await auth.listUsers(1000, pageToken);
    users.push(...page.users);
    pageToken = page.pageToken;
  } while (pageToken);
  return users;
}

function mediaPrefixes(content) {
  return (Array.isArray(content?.media) ? content.media : []).flatMap((asset) =>
    ['large', 'feed', 'thumb'].map((variant) => asset?.[variant]?.path)
  ).filter((filePath) => typeof filePath === 'string' && filePath.startsWith('media/'))
    .map((filePath) => filePath.split('/').slice(0, 3).join('/'));
}

async function createManifest({ db, auth }) {
  const [authUsers, userDocs, profileDocs, recommendations, routes, trips, countries, catalog, jobs] = await Promise.all([
    listAllAuthUsers(auth),
    db.collection('users').get(),
    db.collection('publicProfiles').get(),
    db.collection('recommendations').get(),
    db.collection('routes').get(),
    db.collection('trips').get(),
    db.collection('countries').get(),
    db.collection('destinationCatalog').get(),
    db.collection('system').doc('runtime').collection('destinationJobs').get(),
  ]);
  const usersByUid = new Map(userDocs.docs.map((doc) => [doc.id, doc.data()]));
  const profilesByUid = new Map(profileDocs.docs.map((doc) => [doc.id, doc.data()]));
  const retained = retainedUserSets(authUsers, usersByUid, profilesByUid);
  const keepUids = new Set(retained.keepUids);

  const destinations = await db.collectionGroup('destinations').get();
  const favorites = await db.collectionGroup('favorites').get();
  const media = new Set([
    ...recommendations.docs.flatMap((doc) => mediaPrefixes(doc.data())),
    ...routes.docs.flatMap((doc) => mediaPrefixes(doc.data())),
    ...trips.docs.flatMap((doc) => mediaPrefixes(doc.data())),
  ]);
  return {
    version: 1,
    projectId: admin.app().options.projectId,
    mode: 'dry-run',
    createdAt: new Date().toISOString(),
    keep: {
      adminAuthUsers: retained.adminUids.length,
      botAuthUsers: retained.botUids.length,
      authUsers: retained.keepUids.length,
      uids: retained.keepUids,
    },
    delete: {
      authUsers: authUsers.filter((user) => !keepUids.has(user.uid)).map((user) => user.uid),
      userDocs: userDocs.docs.filter((doc) => !keepUids.has(doc.id)).map((doc) => doc.ref.path),
      publicProfiles: profileDocs.docs.filter((doc) => !keepUids.has(doc.id)).map((doc) => doc.ref.path),
      favorites: favorites.docs.map((doc) => doc.ref.path),
      recommendations: recommendations.docs.map((doc) => doc.ref.path),
      routes: routes.docs.map((doc) => doc.ref.path),
      trips: trips.docs.map((doc) => doc.ref.path),
      countries: countries.docs.map((doc) => doc.ref.path),
      destinations: destinations.docs.map((doc) => doc.ref.path),
      destinationCatalog: catalog.docs.map((doc) => doc.ref.path),
      destinationJobs: jobs.docs.map((doc) => doc.ref.path),
      mediaPrefixes: [...media],
      deletedUserMediaPrefixes: authUsers.filter((user) => !keepUids.has(user.uid)).map((user) => `media/${user.uid}`),
    },
  };
}

async function recursiveDelete(db, paths) {
  for (const targetPath of paths) {
    // eslint-disable-next-line no-await-in-loop
    await db.recursiveDelete(db.doc(targetPath));
  }
}

async function deleteMedia(bucket, prefixes) {
  for (const prefix of prefixes) {
    // eslint-disable-next-line no-await-in-loop
    await bucket.deleteFiles({ prefix: `${prefix}/`, force: true });
  }
}

async function deleteCollectionGroup(db, collectionId) {
  const snapshot = await db.collectionGroup(collectionId).get();
  const writer = db.bulkWriter();
  snapshot.docs.forEach((doc) => writer.delete(doc.ref));
  await writer.close();
  return snapshot.size;
}

async function resetProfiles(db, keepUids) {
  const timestamp = admin.firestore.FieldValue.serverTimestamp();
  for (const uid of keepUids) {
    // eslint-disable-next-line no-await-in-loop
    await db.doc(`publicProfiles/${uid}`).set({
      stats: { recommendations: 0, routes: 0, likesReceived: 0, contributionScore: 0, dominantCategory: null },
      updatedAt: timestamp,
    }, { merge: true });
    // eslint-disable-next-line no-await-in-loop
    await db.doc(`users/${uid}`).set({ updatedAt: timestamp }, { merge: true });
  }
}

async function applyManifest({ db, auth, bucket, manifest }) {
  const expectedProject = admin.app().options.projectId;
  if (manifest?.projectId !== expectedProject) throw new Error('Reset aborted: manifest project does not match the active project.');
  const currentManifest = await createManifest({ db, auth });
  if (manifestFingerprint(currentManifest) !== manifestFingerprint(manifest)) {
    throw new Error('Reset aborted: users or content changed since the dry run. Create a new manifest.');
  }
  const keepUids = new Set(currentManifest.keep.uids);

  // Delete Storage first.  If this fails, Firestore still retains the content
  // and the operator can safely fix permissions and retry.
  await deleteMedia(bucket, [
    ...(manifest.delete.mediaPrefixes || []),
    ...(manifest.delete.deletedUserMediaPrefixes || []),
  ]);
  await recursiveDelete(db, manifest.delete.favorites || []);
  await recursiveDelete(db, manifest.delete.recommendations || []);
  await recursiveDelete(db, manifest.delete.routes || []);
  await recursiveDelete(db, manifest.delete.trips || []);
  await recursiveDelete(db, manifest.delete.destinationCatalog || []);
  await recursiveDelete(db, manifest.delete.destinationJobs || []);
  // Country deletion recursively removes every nested destination and any future
  // country-owned data, so the explicit destinations list is validation-only.
  await recursiveDelete(db, manifest.delete.countries || []);
  await recursiveDelete(db, manifest.delete.publicProfiles || []);
  await recursiveDelete(db, manifest.delete.userDocs || []);
  // Firestore can retain subcollection documents after their parent document
  // has already disappeared.  A final collection-group sweep removes those
  // orphans as part of the reset contract.
  const deletedLikes = await deleteCollectionGroup(db, 'likes');
  const deletedComments = await deleteCollectionGroup(db, 'comments');
  // This is a full content reset, so no old user-generated media may survive
  // under the dedicated media/ namespace, including unreferenced uploads.
  await deleteMedia(bucket, ['media']);
  for (const uid of manifest.delete.authUsers || []) {
    // eslint-disable-next-line no-await-in-loop
    await auth.deleteUser(uid);
  }
  await resetProfiles(db, keepUids);
  return {
    deletedAuthUsers: (manifest.delete.authUsers || []).length,
    deletedCountries: (manifest.delete.countries || []).length,
    deletedDestinations: (manifest.delete.destinations || []).length,
    deletedRecommendations: (manifest.delete.recommendations || []).length,
    deletedRoutes: (manifest.delete.routes || []).length,
    deletedTrips: (manifest.delete.trips || []).length,
    deletedMediaPrefixes: (manifest.delete.mediaPrefixes || []).length +
      (manifest.delete.deletedUserMediaPrefixes || []).length,
    deletedOrphanLikes: deletedLikes,
    deletedOrphanComments: deletedComments,
  };
}

async function main() {
  initializeAdmin(admin);
  const db = admin.firestore();
  const auth = admin.auth();
  const filePath = manifestPath();
  if (!hasArgument('--apply')) {
    const manifest = await createManifest({ db, auth });
    writeManifest(filePath, manifest);
    console.log('Pre-launch reset dry run complete.', {
      filePath,
      keep: manifest.keep,
      delete: Object.fromEntries(Object.entries(manifest.delete).map(([key, value]) => [key, value.length])),
    });
    return;
  }
  if (argumentValue('--confirm') !== CONFIRMATION) {
    throw new Error(`Refusing destructive reset. Pass --confirm ${CONFIRMATION}.`);
  }
  if (!fs.existsSync(filePath)) throw new Error(`Manifest not found: ${filePath}`);
  const mediaBucket = String(process.env.MEDIA_STORAGE_BUCKET || '').trim();
  if (!mediaBucket) throw new Error('Set MEDIA_STORAGE_BUCKET before applying the reset.');
  const manifest = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const result = await applyManifest({ db, auth, bucket: admin.storage().bucket(mediaBucket), manifest });
  manifest.mode = 'applied';
  manifest.appliedAt = new Date().toISOString();
  manifest.result = result;
  writeManifest(filePath, manifest);
  console.log('Pre-launch reset complete.', result);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  createManifest,
  applyManifest,
  deleteCollectionGroup,
  hasBotMarker,
  manifestFingerprint,
  manifestScope,
  mediaPrefixes,
  retainedUserSets,
};
