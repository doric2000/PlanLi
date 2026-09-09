'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const { ROOT, PROJECT, DIRECTORY, BUCKET, assertLocalEnvironment } = require('./environment');
const { LOCAL_APP_CHECK_TOKEN } = require('../../client/src/config/localEmulators');
const { ACCOUNT, recommendationFixture } = require('./fixtures');

async function backendSmoke() {
  assertLocalEnvironment();
  const fromClient = createRequire(path.join(ROOT, 'client/package.json'));
  const { initializeApp, deleteApp } = fromClient('firebase/app');
  const { getAuth, connectAuthEmulator, signInWithEmailAndPassword } = fromClient('firebase/auth');
  const { getStorage, connectStorageEmulator, ref, uploadBytes } = fromClient('firebase/storage');
  const app = initializeApp({ apiKey: 'local', projectId: PROJECT, storageBucket: BUCKET });
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const storage = getStorage(app);
  connectStorageEmulator(storage, '127.0.0.1', 9199);
  try {
  const fromFunctions = createRequire(path.join(ROOT, 'functions/package.json'));
  const { canonicalDestinationId } = fromFunctions('./canonicalDestinationRegistry');
  const fixture = { ...ACCOUNT, cityId: canonicalDestinationId('GB', 'gb-london') };
  const session = await signInWithEmailAndPassword(auth, fixture.email, fixture.password);
  const idToken = await session.user.getIdToken();
  async function call(name, data, signedIn = true) {
    const result = await fetch(`http://127.0.0.1:5001/${PROJECT}/europe-west1/${name}`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'X-Firebase-AppCheck': LOCAL_APP_CHECK_TOKEN,
        ...(signedIn ? { Authorization: `Bearer ${idToken}` } : {}) }, body: JSON.stringify({ data }), signal: AbortSignal.timeout(60000),
    });
    const payload = await result.json();
    if (!result.ok || payload.error) throw new Error(`${name}: ${payload.error?.status || result.status} ${payload.error?.message || ''}`);
    return payload.result ?? payload.data;
  }
  const guest = await call('issueGuestSession', {}, false);
  assert.match(guest.guestSessionToken, /^v1\./, 'Guest access must use the real issued session');
  const catalog = await call('searchDestinations', { query: 'London', sort: 'popular', limit: 30,
    _security: { guestSessionToken: guest.guestSessionToken, nonce: crypto.randomUUID().replace(/-/g, '') } }, false);
  assert.ok(catalog.items?.length, 'A guest must discover the seeded destination');
  await assert.rejects(call('saveRecommendation', {}, false), /UNAUTHENTICATED/);
  const objectPath = `media-staging/${fixture.uid}/${crypto.randomUUID()}.jpg`;
  const bytes = fs.readFileSync(path.join(DIRECTORY, 'fixture.jpg'));
  const metadata = { contentType: 'image/jpeg', customMetadata: { ownerUid: fixture.uid, variant: 'staging' } };
  await uploadBytes(ref(storage, objectPath), bytes, metadata);
  const media = await call('prepareMedia', { stagingPath: objectPath, kind: 'recommendation' });
  const saved = await call('saveRecommendation', { destinationRef: { countryId: 'GB', cityId: fixture.cityId },
    recommendation: { ...recommendationFixture([media]), title: 'Local E2E Published' } });
  assert.ok(saved.recommendationId, 'The real callable must return the published recommendation');
  await assert.rejects(uploadBytes(ref(storage, `media-staging/someone-else/${crypto.randomUUID()}.jpg`), bytes, metadata),
    (error) => error.code === 'storage/unauthorized');
  // Exercise the same persisted-draft state left by a previous device flow.
  const draft = await call('saveRecommendationDraft', { draft: {
    step: 2, locationMode: 'destination', selectedCountry: { id: 'GB', name: 'Britain' },
    selectedCity: { id: fixture.cityId, name: 'London' }, categoryId: 'food', subcategoryIds: ['cafe'],
    title: 'Local E2E unfinished draft', description: '', budget: '', details: {}, media: [], localMediaCount: 0,
  } });
  assert.ok(draft.draftId, 'The real draft callable must establish the composer-resume fixture');
  console.log('PASS local backend: guest session and discovery, email login, owned upload, real media processing, publication, unauthenticated and wrong-owner rejection, persisted draft fixture.');
  } finally { await deleteApp(app); }
}
if (require.main === module) backendSmoke().catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { backendSmoke };
