/* eslint-disable no-console */
const crypto = require('crypto');
const admin = require('firebase-admin');

const { evaluateTextSafety } = require('../moderationService');
const { initializeAdmin } = require('./localCredentials');

const PROJECT_ID = 'planli-f0b12';
const MEDIA_BUCKET = 'planli-f0b12-media-eu';
const CONFIRMATION = 'ACTIVATE_TAXONOMY_OTHER';

function valueAfter(argv, flag) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : null;
}

function parseArgs(argv) {
  return {
    apply: argv.includes('--apply'),
    confirmation: valueAfter(argv, '--confirm'),
    expectedFingerprint: valueAfter(argv, '--fingerprint'),
  };
}

function fingerprint(items) {
  return crypto.createHash('sha256')
    .update(JSON.stringify(items.map((item) => ({
      path: item.path,
      updateTime: item.updateTime,
      valid: item.valid,
      failures: item.failures,
    }))))
    .digest('hex');
}

function canonicalMediaDescriptor(asset, ownerId) {
  const assetId = typeof asset?.assetId === 'string' ? asset.assetId.toLowerCase() : '';
  if (!/^[0-9a-f-]{36}$/.test(assetId) || !ownerId) return null;
  const paths = ['large', 'feed', 'thumb'].map((variant) => asset?.[variant]?.path);
  const valid = paths.every((path, index) => (
    path === `media/${ownerId}/${assetId}/${['large', 'feed', 'thumb'][index]}.webp`
  ));
  return valid ? { assetId, paths } : null;
}

async function inspectMedia({ adminApi, data }) {
  const assets = Array.isArray(data.media) ? data.media : [];
  const descriptors = assets.map((asset) => canonicalMediaDescriptor(asset, data.ownerId));
  if (descriptors.some((descriptor) => !descriptor)) {
    return { valid: false, verification: 'invalid_descriptor' };
  }
  const db = adminApi.firestore();
  const registry = await Promise.all(descriptors.map(({ assetId }) => (
    db.doc(`system/media/assets/${assetId}`).get()
  )));
  if (registry.some((entry) => (
    !entry.exists
      || entry.data()?.ownerUid !== data.ownerId
      || !['active', 'held'].includes(entry.data()?.status)
  ))) {
    return { valid: false, verification: 'registry_missing' };
  }

  const bucket = adminApi.storage().bucket(MEDIA_BUCKET);
  let registryOnly = false;
  for (const path of descriptors.flatMap((descriptor) => descriptor.paths)) {
    try {
      const [exists] = await bucket.file(path).exists();
      if (!exists) return { valid: false, verification: 'object_missing' };
    } catch (error) {
      if (Number(error?.code) === 403) registryOnly = true;
      else return { valid: false, verification: 'object_check_failed' };
    }
  }
  return { valid: true, verification: registryOnly ? 'registry_only' : 'object_verified' };
}

async function inspectRecommendation({ adminApi, entry }) {
  const data = entry.data() || {};
  const failures = [];
  const textSafety = evaluateTextSafety([
    data.title,
    data.description,
    ...Object.values(data.details || {}),
    data.customSubcategoryLabel,
  ]);
  if (!textSafety.safe) failures.push(`text_${textSafety.reason}`);
  if (!data.ownerId) failures.push('owner_missing');
  if (!data.destination?.countryId || !data.destination?.cityId) failures.push('destination_missing');

  const db = adminApi.firestore();
  const [owner, country, destination, authUser] = await Promise.all([
    data.ownerId ? db.doc(`users/${data.ownerId}`).get() : Promise.resolve(null),
    data.destination?.countryId
      ? db.doc(`countries/${data.destination.countryId}`).get()
      : Promise.resolve(null),
    data.destination?.countryId && data.destination?.cityId
      ? db.doc(`countries/${data.destination.countryId}/destinations/${data.destination.cityId}`).get()
      : Promise.resolve(null),
    data.ownerId
      ? adminApi.auth().getUser(data.ownerId).catch(() => null)
      : Promise.resolve(null),
  ]);
  if (!owner?.exists || owner.data()?.moderation?.status === 'suspended') failures.push('owner_inactive');
  if (!authUser || authUser.disabled) failures.push('auth_inactive');
  if (!country?.exists || country.data()?.status !== 'active') failures.push('country_inactive');
  if (!destination?.exists || destination.data()?.status !== 'active') failures.push('destination_inactive');

  const media = await inspectMedia({ adminApi, data });
  if (!media.valid) failures.push(`media_${media.verification}`);

  return {
    path: entry.ref.path,
    updateTime: entry.updateTime?.toDate?.().toISOString() || null,
    valid: failures.length === 0,
    failures,
    imageCount: Array.isArray(data.media) ? data.media.length : 0,
    mediaVerification: media.verification,
  };
}

async function buildManifest(adminApi) {
  const snapshot = await adminApi.firestore().collection('recommendations')
    .where('status', '==', 'moderation_hold')
    .get();
  const candidates = snapshot.docs.filter((entry) => (
    entry.data()?.moderation?.holdReason === 'taxonomy_other'
  ));
  const items = await Promise.all(candidates.map((entry) => inspectRecommendation({ adminApi, entry })));
  items.sort((left, right) => left.path.localeCompare(right.path));
  return {
    projectId: adminApi.app().options.projectId,
    candidates: items.length,
    valid: items.filter((item) => item.valid).length,
    blocked: items.filter((item) => !item.valid).length,
    items,
    fingerprint: fingerprint(items),
  };
}

async function applyManifest(adminApi, manifest) {
  const db = adminApi.firestore();
  let activated = 0;
  for (const item of manifest.items.filter((entry) => entry.valid)) {
    const contentRef = db.doc(item.path);
    const auditRef = db.collection('system/moderation/audit').doc();
    await db.runTransaction(async (transaction) => {
      const current = await transaction.get(contentRef);
      if (!current.exists
        || current.data()?.status !== 'moderation_hold'
        || current.data()?.moderation?.holdReason !== 'taxonomy_other') {
        throw new Error(`Candidate changed before apply: ${item.path}`);
      }
      transaction.update(contentRef, {
        status: 'active',
        moderation: adminApi.firestore.FieldValue.delete(),
      });
      transaction.create(auditRef, {
        actorUid: 'maintenance:repairTaxonomyOtherRecommendations',
        actorName: 'PlanLi maintenance',
        action: 'taxonomy_other_hold_repaired',
        target: { type: 'recommendation', id: contentRef.id, path: contentRef.path },
        reason: 'Safe custom taxonomy labels are publishable.',
        metadata: { previousStatus: 'moderation_hold', previousHoldReason: 'taxonomy_other' },
        createdAt: adminApi.firestore.FieldValue.serverTimestamp(),
      });
    });
    activated += 1;
  }
  return { activated };
}

async function run({ adminApi = admin, options }) {
  const manifest = await buildManifest(adminApi);
  if (!options.apply) return { mode: 'dry-run', ...manifest };
  if (options.confirmation !== CONFIRMATION) {
    throw new Error(`Apply requires --confirm ${CONFIRMATION}.`);
  }
  if (!options.expectedFingerprint || options.expectedFingerprint !== manifest.fingerprint) {
    throw new Error('The live candidate set changed. Run dry-run again and pass its fingerprint.');
  }
  if (manifest.blocked) throw new Error('At least one candidate failed validation; no changes were applied.');
  const result = await applyManifest(adminApi, manifest);
  const verification = await buildManifest(adminApi);
  if (verification.candidates !== 0) throw new Error('Post-apply verification found taxonomy_other holds.');
  return { mode: 'apply', ...result, remaining: verification.candidates };
}

if (require.main === module) {
  initializeAdmin(admin, { projectId: PROJECT_ID, storageBucket: MEDIA_BUCKET });
  run({ options: parseArgs(process.argv.slice(2)) })
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .finally(() => admin.app().delete());
}

module.exports = {
  applyManifest,
  buildManifest,
  canonicalMediaDescriptor,
  fingerprint,
  inspectMedia,
  parseArgs,
  run,
};
