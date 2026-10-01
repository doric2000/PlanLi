#!/usr/bin/env node
// Guarded setup for system recommendation ingestion.
// Dry-run by default. Production writes require --apply --confirm-project=planli-f0b12.
//   node scripts/setupRecommendationIngestion.js                 # plan only
//   node scripts/setupRecommendationIngestion.js --apply --confirm-project=planli-f0b12
//   ... --apply --enable --confirm-project=planli-f0b12   # separately authorized: turn ingestion on
//   ... --apply --trial-group=אתונה --confirm-project=planli-f0b12   # verify + enable the one trial group
// It creates the "המלצות מערכת" publisher (an Auth user with no sign-in method),
// its private/public profile, the disabled ingestion config, and the agreed
// groups (unverified and disabled until an admin verifies them in the console).
const admin = require('firebase-admin');

const { initializeAdmin, DEFAULT_PROJECT_ID } = require('./localCredentials');
const { PRIVACY_VERSION, PROFILE_DETAILS_VERSION, TERMS_VERSION } = require('../authPolicy');
const { syncCurrentPublicProfile } = require('../publicProfiles');
const { INGESTION_ROOT, groupKeyFor, parseFacebookGroupUrl } = require('../recommendationIngestionPolicy');

const PUBLISHER_DISPLAY_NAME = 'המלצות מערכת';
const PUBLISHER_UID = 'system-recommendations-publisher';

// Agreed pilot groups and their existing PlanLi destinations (stable IDs, checked
// read-only on 2026-10-01). Baku has no PlanLi destination yet. Groups stay
// disabled and unverified until an admin verifies them in the console.
const PILOT_GROUPS = Object.freeze([
  { label: 'אתונה', url: 'https://www.facebook.com/groups/1864457083986225/', countryId: 'GR', cityId: 'dst_6DDALrP3ktGtLo1YeVKm' },
  { label: 'פראג', url: 'https://www.facebook.com/groups/327521953445426/', countryId: 'CZ', cityId: 'dst_XFjNCQCWnMCUscmnS738' },
  { label: 'קרקוב', url: 'https://www.facebook.com/groups/WarszawaVacation/', numericGroupId: '1846624642287968',
    countryId: 'PL', cityId: 'dst_gQ5ftfcaGLgxjLpXcoDk' },
  { label: 'באקו', url: 'https://www.facebook.com/groups/913521937040269/' },
  { label: 'דובאי', url: 'https://www.facebook.com/groups/297481884916709/', countryId: 'AE', cityId: 'dst_i98ZsOJi8ZwmtI1y6i5a' },
]);

async function activeDestination(firestore, group) {
  if (!group.countryId || !group.cityId) return null;
  const snapshot = await firestore.doc(`countries/${group.countryId}/destinations/${group.cityId}`).get();
  return snapshot.exists && snapshot.data()?.status === 'active'
    ? { countryId: group.countryId, cityId: group.cityId }
    : null;
}

function valueAfter(argv, flag) {
  const prefix = `${flag}=`;
  return argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) || null;
}

function parseArgs(argv) {
  return {
    apply: argv.includes('--apply'),
    enable: argv.includes('--enable'),
    trialGroup: valueAfter(argv, '--trial-group'),
    confirmProject: valueAfter(argv, '--confirm-project'),
  };
}

function publisherProfile(now) {
  return {
    uid: PUBLISHER_UID,
    email: '',
    displayName: PUBLISHER_DISPLAY_NAME,
    photoURL: null,
    moderation: { status: 'active' },
    smartProfile: { setupRequired: false },
    onboarding: { profileDetailsVersion: PROFILE_DETAILS_VERSION, profileDetailsCompletedAt: now },
    legal: { termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION, acceptedAt: now, acceptedBy: 'operator_provisioning' },
    systemAccount: { kind: 'system_publisher', provisionedAt: now },
  };
}

async function planSetup({ auth, firestore }) {
  const plan = [];
  let authUser = null;
  try {
    authUser = await auth.getUser(PUBLISHER_UID);
  } catch (error) {
    if (error?.code !== 'auth/user-not-found') throw error;
  }
  if (!authUser) plan.push({ action: 'create_auth_user', uid: PUBLISHER_UID, signInMethods: 'none' });
  const userSnapshot = await firestore.doc(`users/${PUBLISHER_UID}`).get();
  if (!userSnapshot.exists) plan.push({ action: 'create_private_profile', path: `users/${PUBLISHER_UID}` });
  plan.push({ action: 'sync_public_profile', path: `publicProfiles/${PUBLISHER_UID}` });
  const configSnapshot = await firestore.doc(`${INGESTION_ROOT}/config/main`).get();
  if (!configSnapshot.exists) plan.push({ action: 'create_config', enabled: false, rolloutStage: 'trial' });
  for (const group of PILOT_GROUPS) {
    const groupKey = groupKeyFor(group.url);
    // eslint-disable-next-line no-await-in-loop
    const exists = (await firestore.doc(`${INGESTION_ROOT}/groups/${groupKey}`).get()).exists;
    // eslint-disable-next-line no-await-in-loop
    const destination = await activeDestination(firestore, group);
    if (!exists) {
      plan.push({ action: 'create_group', groupKey, label: group.label, enabled: false, verified: false,
        destination: destination ? `${destination.countryId}/${destination.cityId}` : 'missing' });
    }
  }
  return plan;
}

async function applySetup({ auth, firestore, enable = false, trialGroup = null, adminApp = admin }) {
  const now = new Date();
  try {
    await auth.getUser(PUBLISHER_UID);
  } catch (error) {
    if (error?.code !== 'auth/user-not-found') throw error;
    await auth.createUser({ uid: PUBLISHER_UID, displayName: PUBLISHER_DISPLAY_NAME, disabled: false });
  }
  const userRef = firestore.doc(`users/${PUBLISHER_UID}`);
  await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(userRef);
    if (!snapshot.exists) {
      transaction.create(userRef, { ...publisherProfile(now), createdAt: now, updatedAt: now });
    }
  });
  await syncCurrentPublicProfile(adminApp, PUBLISHER_UID);
  const configRef = firestore.doc(`${INGESTION_ROOT}/config/main`);
  await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(configRef);
    if (!snapshot.exists) {
      transaction.create(configRef, {
        enabled: false, publisherUid: PUBLISHER_UID, rolloutStage: 'trial', perRunChargeCapUsd: 0.25,
        capUsd: 10, capPosts: 1000, createdAt: now, updatedAt: now,
      });
    } else if (!snapshot.data()?.publisherUid) {
      transaction.update(configRef, { publisherUid: PUBLISHER_UID, updatedAt: now });
    }
  });
  if (enable) await configRef.update({ enabled: true, updatedAt: now });
  for (const group of PILOT_GROUPS) {
    const groupKey = groupKeyFor(group.url);
    const ref = firestore.doc(`${INGESTION_ROOT}/groups/${groupKey}`);
    // eslint-disable-next-line no-await-in-loop
    const destination = await activeDestination(firestore, group);
    // eslint-disable-next-line no-await-in-loop
    await firestore.runTransaction(async (transaction) => {
      if ((await transaction.get(ref)).exists) return;
      transaction.create(ref, {
        groupKey, label: group.label, url: parseFacebookGroupUrl(group.url).url,
        ...(group.numericGroupId ? { numericGroupId: group.numericGroupId } : {}),
        ...(destination || {}),
        enabled: false, verifiedAt: null, resultsLimit: 10, createdAt: now, updatedAt: now,
      });
    });
  }
  if (trialGroup) await enableTrialGroup({ firestore, label: trialGroup, now });
}

// Trial rollout: exactly one verified, enabled group bound to an active destination.
async function enableTrialGroup({ firestore, label, now = new Date() }) {
  const group = PILOT_GROUPS.find((entry) => entry.label === label || groupKeyFor(entry.url) === label);
  if (!group) throw new Error(`Unknown trial group: ${label}`);
  const groupKey = groupKeyFor(group.url);
  if (!(await activeDestination(firestore, group))) throw new Error(`${group.label} has no active PlanLi destination.`);
  const groups = await firestore.collection(`${INGESTION_ROOT}/groups`).where('enabled', '==', true).get();
  if (groups.docs.some((doc) => doc.id !== groupKey)) throw new Error('Another group is already enabled.');
  await firestore.doc(`${INGESTION_ROOT}/groups/${groupKey}`).update({
    verifiedAt: now, enabled: true, resultsLimit: 10, updatedAt: now,
  });
  return groupKey;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  initializeAdmin(admin, { projectId: DEFAULT_PROJECT_ID });
  const firestore = admin.firestore();
  const auth = admin.auth();
  const plan = await planSetup({ auth, firestore });
  if (options.enable) plan.push({ action: 'enable_ingestion' });
  if (options.trialGroup) plan.push({ action: 'verify_and_enable_trial_group', label: options.trialGroup });
  console.log(JSON.stringify({ mode: options.apply ? 'apply' : 'dry-run', project: firestore.projectId, plan }, null, 2));
  if (!options.apply) return;
  if (options.confirmProject !== DEFAULT_PROJECT_ID || firestore.projectId !== DEFAULT_PROJECT_ID) {
    throw new Error(`Production writes require --confirm-project=${DEFAULT_PROJECT_ID}.`);
  }
  await applySetup({ auth, firestore, enable: options.enable, trialGroup: options.trialGroup });
  console.log(`System recommendation ingestion setup applied. Ingestion ${options.enable ? 'enabled' : 'remains disabled'}.`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  PILOT_GROUPS, PUBLISHER_DISPLAY_NAME, PUBLISHER_UID, applySetup, enableTrialGroup, parseArgs, planSetup, publisherProfile,
};
