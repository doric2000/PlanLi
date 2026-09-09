'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const { ROOT, PROJECT, BUCKET, DIRECTORY, assertLocalEnvironment } = require('./environment');
const fromFunctions = createRequire(path.join(ROOT, 'functions/package.json'));
const { ACCOUNT, recommendationFixture } = require('./fixtures');
const { email: EMAIL, password: PASSWORD, uid: UID } = ACCOUNT;

async function seed() {
  assertLocalEnvironment();
  for (const url of [
    `http://127.0.0.1:8080/emulator/v1/projects/${PROJECT}/databases/(default)/documents`,
    `http://127.0.0.1:9099/emulator/v1/projects/${PROJECT}/accounts`,
  ]) {
    const response = await fetch(url, { method: 'DELETE' });
    if (!response.ok) throw new Error(`Could not reset local fixtures: ${response.status}`);
  }
  const admin = fromFunctions('firebase-admin');
  if (!admin.apps.length) admin.initializeApp({ projectId: PROJECT, storageBucket: BUCKET });
  const { TERMS_VERSION, PRIVACY_VERSION, PROFILE_DETAILS_VERSION } = fromFunctions('./authPolicy');
  await admin.auth().createUser({ uid: UID, email: EMAIL, password: PASSWORD, emailVerified: true, displayName: 'מטייל בדיקה' });
  const db = admin.firestore();
  const now = admin.firestore.Timestamp.now();
  const user = { displayName: 'מטייל בדיקה', email: EMAIL, status: 'active', moderation: { status: 'active' },
    onboarding: { profileDetailsVersion: PROFILE_DETAILS_VERSION, profileDetailsCompletedAt: now,
      noya: { version: 2, status: 'completed', completedAt: now } },
    legal: { termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION, acceptedAt: now },
    smartProfile: { setupRequired: false, completedAt: now, onboardingVersion: 2,
      interests: ['food', 'nature_scenery'], budget: 'balanced', travelParties: ['solo'] }, discoveryRegionId: 'europe', createdAt: now };
  await db.doc(`users/${UID}`).set(user);
  await db.doc(`publicProfiles/${UID}`).set({ displayName: user.displayName, status: 'active' });
  const { canonicalDestinationId } = fromFunctions('./canonicalDestinationRegistry');
  const cityId = canonicalDestinationId('GB', 'gb-london');
  const policy = { approved: true, registryId: 'gb-london', kind: 'city_hub', groupingPolicy: 'self', registryVersion: 3,
    approvalRevision: 1, registryAttestation: { approved: true, registryId: 'gb-london', registryVersion: 3, approvalRevision: 1, countryId: 'GB' } };
  await db.doc('countries/GB').set({ code: 'GB', name: 'בריטניה', nameEn: 'United Kingdom', status: 'active', discoveryRegionId: 'europe' });
  const destination = { name: 'לונדון', nameEn: 'London', hebrewName: 'לונדון', status: 'active', countryId: 'GB',
    googleCache: { names: { he: 'לונדון', en: 'London' }, nameSources: { he: 'admin', en: 'google' },
      geometry: { location: { lat: 51.5074, lng: -0.1278 } } },
    type: 'city', coordinates: { lat: 51.5074, lng: -0.1278 }, canonicalPolicy: policy,
    providerRefs: { googlePlaceId: 'local-london' }, discoveryRegionId: 'europe',
    stats: { recommendationCount: 0 }, updatedAt: now, createdAt: now };
  await db.doc(`countries/GB/destinations/${cityId}`).set(destination);
  const image = await fromFunctions('sharp')({ create: { width: 960, height: 720, channels: 3, background: '#00a99d' } }).jpeg().toBuffer();
  fs.writeFileSync(path.join(DIRECTORY, 'fixture.jpg'), image);
  const auth = { uid: UID, token: { email_verified: true, firebase: { sign_in_provider: 'password' } } };
  const media = [];
  for (let i = 0; i < 2; i++) {
    const stagingPath = `media-staging/${UID}/${crypto.randomUUID()}.jpg`;
    const galleryImage = i === 0 ? image : await fromFunctions('sharp')({
      create: { width: 960, height: 720, channels: 3, background: '#e19c3e' },
    }).jpeg().toBuffer();
    await admin.storage().bucket(BUCKET).file(stagingPath).save(galleryImage, { metadata: { contentType: 'image/jpeg',
      metadata: { ownerUid: UID, variant: 'staging' } } });
    media.push(await fromFunctions('./mediaProcessor').prepareMedia({ admin, auth, data: { stagingPath, kind: 'recommendation' }, mediaBucket: BUCKET }));
  }
  const recommendation = recommendationFixture(media);
  const { saveRecommendation } = fromFunctions('./recommendationService');
  const result = await saveRecommendation({ admin, auth, mediaBucket: BUCKET,
    data: { destinationRef: { countryId: 'GB', cityId }, recommendation } });
  const fixture = { uid: UID, email: EMAIL, password: PASSWORD, cityId, recommendationId: result.recommendationId, recommendation };
  fs.writeFileSync(path.join(DIRECTORY, 'fixture.json'), JSON.stringify(fixture));
  console.log('Seeded one local traveler, approved destination and a real two-photo recommendation.');
  await admin.app().delete();
  return fixture;
}

if (require.main === module) seed().catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { seed };
