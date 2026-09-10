const crypto = require('node:crypto');
const { HttpsError } = require('firebase-functions/v2/https');
const { authorizeRequest } = require('./authPolicy');
const { prepareMedia, MAX_SOURCE_BYTES } = require('./mediaProcessor');
const { validateMediaAssets, saveRecommendation } = require('./recommendationService');
const { updateProfile } = require('./profileService');
const routeDrafts = require('./routeDraftService');
const recommendationDrafts = require('./recommendationDraftService');
const { buildNotificationDocument, upsertNotification } = require('./notificationService');

const JOBS = 'system/operations/jobs';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LEASE_MS = 10 * 60 * 1000;
const TERMINAL = new Set(['success', 'review', 'failed', 'discarded']);
const fail = (reason, code = 'failed-precondition') => { throw new HttpsError(code, 'The operation could not be completed.', { reason }); };
const assert = (condition, reason, code) => { if (!condition) fail(reason, code); };
const timestamp = (value) => value?.toMillis?.() || (value?._seconds ? value._seconds * 1000 : Number(value) || 0);
const operationId = (id) => { assert(typeof id === 'string' && UUID.test(id), 'OPERATION_INVALID', 'invalid-argument'); return id; };
const jobRef = (admin, id) => admin.firestore().doc(`${JOBS}/${operationId(id)}`);
const json = (value) => JSON.parse(JSON.stringify(value));

function normalizeManifest(kind, ownerUid, items) {
  assert(['avatar', 'recommendation', 'route'].includes(kind), 'OPERATION_INVALID', 'invalid-argument');
  assert(Array.isArray(items) && items.length <= (kind === 'route' ? 40 : kind === 'avatar' ? 1 : 5), 'OPERATION_MEDIA_LIMIT', 'invalid-argument');
  if (kind === 'avatar') assert(items.length === 1, 'OPERATION_AVATAR_REQUIRED', 'invalid-argument');
  const ids = new Set();
  return items.map((item, index) => {
    assert(item && typeof item === 'object', 'OPERATION_INVALID', 'invalid-argument');
    const id = operationId(item.id);
    assert(!ids.has(id), 'OPERATION_DUPLICATE_MEDIA', 'invalid-argument');
    ids.add(id);
    assert(item && typeof item === 'object', 'OPERATION_INVALID', 'invalid-argument');
    const slot = kind === 'route' ? Object.fromEntries(['type', 'dayIndex', 'stopIndex', 'mediaIndex', 'draftId', 'dayDraftId']
      .filter((key) => item.slot?.[key] != null).map((key) => [key, item.slot[key]])) : null;
    if (kind === 'route') {
      assert(slot && ['route-day', 'route-stop'].includes(slot.type) && Number.isSafeInteger(slot.dayIndex)
        && slot.dayIndex >= 0 && slot.dayIndex < 60, 'OPERATION_SLOT_INVALID', 'invalid-argument');
      assert(slot.type !== 'route-stop' || (Number.isSafeInteger(slot.stopIndex) && slot.stopIndex >= 0 && slot.stopIndex < 150
        && Number.isSafeInteger(slot.mediaIndex) && slot.mediaIndex >= 0 && slot.mediaIndex < 3), 'OPERATION_SLOT_INVALID', 'invalid-argument');
    }
    if (slot) for (const key of ['draftId', 'dayDraftId']) assert(slot[key] == null ||
      (typeof slot[key] === 'string' && slot[key].length <= 120 && !slot[key].includes('/')), 'OPERATION_SLOT_INVALID', 'invalid-argument');
    if (item.asset) return { id, index, slot: slot ? json(slot) : null, asset: item.asset, state: 'prepared' };
    assert(Number.isSafeInteger(item.bytes) && item.bytes > 0 && item.bytes <= MAX_SOURCE_BYTES, 'OPERATION_MEDIA_SIZE', 'invalid-argument');
    const path = `media-staging/${ownerUid}/${id}.jpg`;
    assert(item.stagingPath === path, 'OPERATION_MEDIA_OWNER', 'permission-denied');
    return { id, index, slot: slot ? json(slot) : null, stagingPath: path, bytes: item.bytes, state: 'waiting' };
  });
}

function attachManifestAssets(draft, items, kind) {
  const ordered = [...items].sort((a, b) => a.index - b.index);
  assert(ordered.every((item) => item.asset?.assetId), 'OPERATION_MEDIA_INCOMPLETE');
  if (kind === 'recommendation') return { ...draft, media: ordered.map((item) => item.asset), localMediaCount: 0 };
  const next = json(draft);
  const slots = new Set();
  const stops = new Map();
  for (const item of ordered) {
    const slot = item.slot;
    const day = next.days?.[slot.dayIndex];
    assert(day && (!slot.dayDraftId || day.draftId === slot.dayDraftId), 'OPERATION_DRAFT_CONFLICT');
    const key = `${slot.dayIndex}:${slot.type}:${slot.stopIndex ?? ''}:${slot.mediaIndex ?? ''}`;
    assert(!slots.has(key), 'OPERATION_SLOT_DUPLICATE'); slots.add(key);
    if (slot.type === 'route-day') {
      assert(!slot.draftId || day.draftId === slot.draftId, 'OPERATION_DRAFT_CONFLICT');
      day.media = item.asset; delete day.image;
    } else {
      const stop = day.stops?.[slot.stopIndex];
      assert(stop && (!slot.draftId || stop.draftId === slot.draftId), 'OPERATION_DRAFT_CONFLICT');
      if (!stops.has(stop)) {
        const remote = [stop.media, ...(stop.additionalMedia || [])].filter(Boolean);
        let remoteIndex = 0;
        stops.set(stop, stop.mediaOrder?.includes('local')
          ? stop.mediaOrder.map((type) => type === 'remote' ? remote[remoteIndex++] : null) : remote);
      }
      stops.get(stop)[slot.mediaIndex] = item.asset;
    }
  }
  for (const [stop, assets] of stops) {
    assert(Array.from(assets).every(Boolean) && assets.length <= 3, 'OPERATION_MEDIA_INCOMPLETE');
    stop.media = assets[0] || null; stop.additionalMedia = assets.slice(1);
    delete stop.mediaOrder; delete stop.pendingMedia; delete stop.image;
  }
  next.localMediaCount = 0;
  return next;
}

function publicJob(id, job) {
  return { operationId: id, kind: job.kind, status: job.status, stage: job.stage,
    createdAt: job.createdAt, updatedAt: job.updatedAt, attempt: job.attempt,
    result: job.result || null, error: job.error || null };
}

async function startBackgroundOperation({ admin, auth, data, mediaBucket }) {
  await authorizeRequest({ admin, auth, access: 'active' });
  const id = operationId(data?.operationId);
  const ref = jobRef(admin, id);
  const manifest = normalizeManifest(data.kind, auth.uid, data.items);
  const requestHash = crypto.createHash('sha256').update(JSON.stringify({ kind: data.kind,
    draftId: data.draftId || null, expectedVersion: data.expectedVersion || null,
    payload: data.payload || null, items: manifest })).digest('hex');
  const existing = await ref.get();
  if (existing.exists) {
    assert(existing.data().ownerUid === auth.uid, 'OPERATION_OWNER', 'permission-denied');
    assert(existing.data().requestHash === requestHash, 'OPERATION_ID_REUSED', 'already-exists');
    return publicJob(id, existing.data());
  }
  const remote = manifest.filter((item) => item.asset);
  let existingMedia = [];
  let draft = null;
  let legacyPayload = null;
  let expectedPhotoAssetId = null;
  let expectedUpdatedAt = null;
  if (data.kind === 'avatar') {
    const profile = await admin.firestore().doc(`users/${auth.uid}`).get();
    expectedPhotoAssetId = profile.data()?.photoMedia?.assetId || null;
  } else if (data.draftId) {
    const service = data.kind === 'route' ? routeDrafts : recommendationDrafts;
    const loaded = await (data.kind === 'route' ? service.getCurrentRouteDraft : service.getCurrentRecommendationDraft)({ admin, auth });
    assert(loaded.draft?.id === data.draftId && loaded.draft.version === data.expectedVersion, 'OPERATION_DRAFT_CONFLICT');
    const pointerRef = data.kind === 'route' ? service.draftPointerRef : service.pointerRef;
    const pointer = (await pointerRef(admin.firestore(), auth.uid).get()).data();
    assert(pointer?.draftId === data.draftId && pointer.version === data.expectedVersion, 'OPERATION_DRAFT_CONFLICT');
    draft = { id: data.draftId, version: data.expectedVersion, pointer: {
      ownerId: auth.uid, draftId: data.draftId, version: data.expectedVersion,
      ...(data.kind === 'route' ? { revisionPath: pointer.revisionPath, sourceRouteId: pointer.sourceRouteId || null }
        : { versionPath: pointer.versionPath, sourceRecommendationId: pointer.sourceRecommendationId || null }),
    } };
    const sourceId = pointer.sourceRouteId || pointer.sourceRecommendationId;
    if (sourceId) {
      const source = await admin.firestore().doc(`${data.kind === 'route' ? 'routes' : 'recommendations'}/${sourceId}`).get();
      assert(source.exists && source.data()?.ownerId === auth.uid, 'OPERATION_OWNER', 'permission-denied');
      expectedUpdatedAt = timestamp(source.data().updatedAt);
      existingMedia = source.data().media || [];
    }
  } else {
    assert(data.kind === 'recommendation' && data.payload?.recommendation, 'OPERATION_DRAFT_REQUIRED', 'invalid-argument');
    const allowed = ['recommendationId', 'recommendation', 'destinationRef', 'resolvedPlaceToken', 'placeId', 'locationMode', 'incidentId'];
    assert(Object.keys(data.payload).every((key) => allowed.includes(key))
      && Buffer.byteLength(JSON.stringify(data.payload)) <= 64 * 1024, 'OPERATION_INVALID', 'invalid-argument');
    legacyPayload = json(data.payload);
    if (legacyPayload.recommendationId) {
      assert(typeof legacyPayload.recommendationId === 'string' && !legacyPayload.recommendationId.includes('/'), 'OPERATION_INVALID', 'invalid-argument');
      const content = await admin.firestore().doc(`recommendations/${legacyPayload.recommendationId}`).get();
      assert(content.exists && content.data()?.ownerId === auth.uid, 'OPERATION_OWNER', 'permission-denied');
      expectedUpdatedAt = timestamp(content.data().updatedAt);
      existingMedia = content.data().media || [];
    }
  }
  // Retained images must come from the authorized edit target, never a client
  // claim that an image is already owned or safe to reuse in a different post.
  if (remote.length) {
    const validated = await validateMediaAssets({ admin, uid: auth.uid, media: remote.map((item) => item.asset),
      mediaBucket, maxAssets: 40, existingMedia });
    remote.forEach((item, index) => { item.asset = validated[index]; });
  }
  const now = Date.now();
  const job = { ownerUid: auth.uid, requestHash, kind: data.kind, status: manifest.every((item) => item.asset) ? 'ready' : 'uploading',
    stage: 'uploading', createdAt: now, updatedAt: now, attempt: 1, leaseUntil: 0,
    authTime: Number(auth.token?.auth_time || now / 1000),
    provider: String(auth.token?.firebase?.sign_in_provider || 'password'),
    draft, legacyPayload, expectedPhotoAssetId, expectedUpdatedAt, expectedCount: manifest.length,
    mediaSaveRequestId: crypto.randomUUID(), result: null, error: null, committedResult: null };
  const quota = admin.firestore().doc(`system/operations/owners/${auth.uid}`);
  await admin.firestore().runTransaction(async (transaction) => {
    const [old, quotaSnapshot, ownerSnapshot] = await Promise.all([transaction.get(ref), transaction.get(quota),
      transaction.get(admin.firestore().doc(`users/${auth.uid}`))]);
    assert(ownerSnapshot.exists && !['suspended', 'deleting'].includes(ownerSnapshot.data()?.moderation?.status)
      && ownerSnapshot.data()?.status !== 'deleting', 'OPERATION_OWNER', 'permission-denied');
    if (old.exists) {
      assert(old.data()?.ownerUid === auth.uid, 'OPERATION_OWNER', 'permission-denied');
      assert(old.data()?.requestHash === requestHash, 'OPERATION_ID_REUSED', 'already-exists'); return;
    }
    const quotaData = quotaSnapshot.data() || {};
    const window = Math.floor(now / 86400000);
    const count = quotaData.window === window ? Number(quotaData.count || 0) : 0;
    assert(count < 40, 'OPERATION_DAILY_LIMIT', 'resource-exhausted');
    transaction.set(quota, { window, count: count + 1 });
    transaction.create(ref, job);
    manifest.forEach((item) => transaction.create(ref.collection('items').doc(item.id), item));
  });
  return publicJob(id, (await ref.get()).data());
}

async function getBackgroundOperations({ admin, auth, data = {} }) {
  assert(auth?.uid, 'OPERATION_OWNER', 'unauthenticated');
  if (data.operationId) {
    const ref = jobRef(admin, data.operationId);
    const snapshot = await ref.get();
    assert(snapshot.exists && snapshot.data()?.ownerUid === auth.uid, 'OPERATION_NOT_FOUND', 'not-found');
    const items = await ref.collection('items').get();
    return { ...publicJob(ref.id, snapshot.data()), items: items.docs.map((item) => ({ id: item.id, state: item.data().state })) };
  }
  let query = admin.firestore().collection(JOBS).where('ownerUid', '==', auth.uid).orderBy('createdAt', 'desc').limit(50);
  if (data.before != null) {
    const cursor = await jobRef(admin, data.before).get();
    assert(cursor.exists && cursor.data().ownerUid === auth.uid, 'OPERATION_INVALID', 'invalid-argument');
    query = query.startAfter(cursor);
  }
  const snapshot = await query.get();
  return { operations: snapshot.docs.map((item) => publicJob(item.id, item.data())),
    nextBefore: snapshot.size === 50 ? snapshot.docs.at(-1).id : null };
}

async function retryBackgroundOperation({ admin, auth, data, mediaBucket }) {
  await authorizeRequest({ admin, auth, access: 'active' });
  const ref = jobRef(admin, data?.operationId);
  const items = await ref.collection('items').get();
  await admin.firestore().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const job = snapshot.data();
    assert(job?.ownerUid === auth.uid, 'OPERATION_NOT_FOUND', 'not-found');
    assert(job.status === 'failed' && job.error?.retryable === true, 'OPERATION_REVIEW_REQUIRED');
    assert(job.attempt < 5, 'OPERATION_RETRY_LIMIT', 'resource-exhausted');
    transaction.update(ref, { status: 'ready', stage: 'queued', error: null, attempt: job.attempt + 1,
      authTime: Number(auth.token?.auth_time || Date.now() / 1000), updatedAt: Date.now(), lastTransferAt: Date.now(), leaseUntil: 0 });
    items.docs.forEach((item) => transaction.update(item.ref, { transferFailed: false }));
  });
  // Reconcile a finalization event whose delivery was interrupted before repeating bytes.
  for (const item of items.docs) {
    if (item.data().state !== 'waiting') continue;
    try {
      const [object] = await admin.storage().bucket(mediaBucket).file(item.data().stagingPath).getMetadata();
      await recordBackgroundUpload({ admin, object, mediaBucket });
    } catch (error) { if (Number(error.code) !== 404) throw error; }
  }
  return getBackgroundOperations({ admin, auth, data });
}

async function acknowledgeBackgroundOperation({ admin, auth, data }) {
  assert(auth?.uid, 'OPERATION_OWNER', 'unauthenticated');
  const ref = jobRef(admin, data?.operationId);
  await admin.firestore().runTransaction(async (transaction) => {
    const job = (await transaction.get(ref)).data();
    assert(job?.ownerUid === auth.uid, 'OPERATION_NOT_FOUND', 'not-found');
    if (!['success', 'review'].includes(job.status) || job.acknowledgedAt) return;
    transaction.update(ref, { acknowledgedAt: Date.now(), expireAt: new Date(Date.now() + 30 * 86400000) });
  });
  return { acknowledged: true };
}

async function discardBackgroundOperation({ admin, auth, data }) {
  assert(auth?.uid, 'OPERATION_OWNER', 'unauthenticated');
  const ref = jobRef(admin, data?.operationId);
  await admin.firestore().runTransaction(async (transaction) => {
    const job = (await transaction.get(ref)).data();
    assert(job?.ownerUid === auth.uid, 'OPERATION_NOT_FOUND', 'not-found');
    assert(['failed', 'discarded'].includes(job.status) && !job.committedResult, 'OPERATION_STILL_RUNNING');
    transaction.update(ref, { status: 'discarded', stage: 'discarded', updatedAt: Date.now(), expireAt: new Date(Date.now() + 86400000) });
  });
  return { discarded: true };
}

async function reportBackgroundTransferFailure({ admin, auth, data }) {
  await authorizeRequest({ admin, auth, access: 'active' });
  const ref = jobRef(admin, data?.operationId);
  assert(Array.isArray(data.itemIds) && data.itemIds.length <= 40, 'OPERATION_INVALID', 'invalid-argument');
  const refs = data.itemIds.map((id) => ref.collection('items').doc(operationId(id)));
  await admin.firestore().runTransaction(async (transaction) => {
    const [snapshot, ...items] = await Promise.all([transaction.get(ref), ...refs.map((item) => transaction.get(item))]);
    const job = snapshot.data();
    assert(job?.ownerUid === auth.uid, 'OPERATION_NOT_FOUND', 'not-found');
    if (TERMINAL.has(job.status)) return;
    items.forEach((item) => { if (item.exists && item.data().state === 'waiting') transaction.update(item.ref, { transferFailed: true }); });
    if (job.leaseUntil <= Date.now()) transaction.update(ref, { status: 'ready', updatedAt: Date.now() });
  });
  return { recorded: true };
}

async function recordBackgroundUpload({ admin, object, mediaBucket }) {
  const id = object.metadata?.operationId;
  if (!UUID.test(String(id || '')) || object.bucket !== mediaBucket) return;
  const ref = jobRef(admin, id);
  const sourceId = String(object.name || '').split('/').at(-1)?.replace(/\.jpg$/, '');
  if (!UUID.test(sourceId || '')) return;
  const itemRef = ref.collection('items').doc(sourceId);
  await admin.firestore().runTransaction(async (transaction) => {
    const [snapshot, itemSnapshot] = await Promise.all([transaction.get(ref), transaction.get(itemRef)]);
    const job = snapshot.data(); const item = itemSnapshot.data();
    if (!job || !item || ['success', 'review', 'discarded'].includes(job.status) || item.state === 'prepared') return;
    if (!(item.stagingPath === object.name && object.name === `media-staging/${job.ownerUid}/${sourceId}.jpg`
      && object.metadata?.ownerUid === job.ownerUid && object.metadata?.variant === 'staging'
      && object.contentType === 'image/jpeg' && Number(object.size) === item.bytes)) return;
    transaction.update(itemRef, { state: 'uploaded', transferFailed: false, generation: String(object.generation) });
    transaction.update(ref, { status: job.status === 'failed' || job.leaseUntil > Date.now() ? job.status : 'ready', updatedAt: Date.now(), lastTransferAt: Date.now() });
  });
}

async function actorForJob(admin, job) {
  const record = await admin.auth().getUser(job.ownerUid);
  assert(!record.disabled && (!record.tokensValidAfterTime || job.authTime * 1000 >= Date.parse(record.tokensValidAfterTime)), 'OPERATION_AUTH_EXPIRED', 'unauthenticated');
  const auth = { uid: job.ownerUid, token: { email_verified: record.emailVerified === true,
    email: record.email || '', firebase: { sign_in_provider: job.provider } } };
  await authorizeRequest({ admin, auth, access: 'active' });
  return auth;
}

async function notifyOutcome({ admin, id, job }) {
  if (job.status === 'discarded') return;
  const subtype = job.status === 'failed' ? 'operation_failed' : job.status === 'review' ? 'operation_review' : 'operation_completed';
  const message = job.status === 'failed' ? 'הפעולה לא הושלמה. פרטים ואפשרויות המשך בפעילות שלי.'
    : job.status === 'review' ? 'הפרסום נשמר ונשלח לבדיקה.' : 'הפעולה הושלמה בהצלחה.';
  const notification = buildNotificationDocument({ channel: 'personal', type: 'system', subtype,
    target: { type: 'profile', id: job.ownerUid }, navigation: { action: 'open_operation', operationId: id }, message });
  await upsertNotification({ admin, uid: job.ownerUid, notificationId: `operation_${id}_${job.attempt}`,
    notification, createOnly: true, activityVersion: job.attempt });
}

async function finalizeCommittedDraft({ admin, ref, leaseId }) {
  const db = admin.firestore();
  await db.runTransaction(async (transaction) => {
    const job = (await transaction.get(ref)).data();
    assert(job?.leaseId === leaseId, 'OPERATION_LEASE_LOST', 'aborted');
    if (!job.draft || !job.committedResult) return;
    const service = job.kind === 'route' ? routeDrafts : recommendationDrafts;
    const ownerRef = (service.draftPointerRef || service.pointerRef)(db, job.ownerUid);
    const pointer = (await transaction.get(ownerRef)).data();
    // Clear only the published version. A newer draft belongs to its editor.
    if (pointer?.ownerId !== job.ownerUid || pointer.draftId !== job.draft.id || pointer.version !== job.draft.version) return;
    const versionRef = db.doc(pointer.revisionPath || pointer.versionPath);
    const version = await transaction.get(versionRef);
    const receipt = (service.publishedReceiptRef || service.receiptRef)(db, job.ownerUid, job.draft.id);
    transaction.set(receipt, { ownerId: job.ownerUid, draftId: job.draft.id, version: job.draft.version,
      result: job.committedResult, createdAt: admin.firestore.FieldValue.serverTimestamp(), expireAt: new Date(Date.now() + 86400000) });
    if (version.exists) transaction.update(versionRef, { expireAt: new Date(), publishedAt: admin.firestore.FieldValue.serverTimestamp() });
    transaction.delete(ownerRef);
  });
}

async function processBackgroundOperation(options) {
  const { admin, id, mediaBucket, prepareMediaImpl = prepareMedia, updateProfileImpl = updateProfile,
    saveRecommendationImpl = saveRecommendation, notify = notifyOutcome } = options;
  const ref = jobRef(admin, id);
  const leaseId = crypto.randomUUID();
  const job = await admin.firestore().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const current = snapshot.data();
    if (!current || current.leaseUntil > Date.now()) return null;
    if (TERMINAL.has(current.status)) return { ...current, terminal: true };
    transaction.update(ref, { leaseId, leaseUntil: Date.now() + LEASE_MS, status: 'processing', stage: 'processing' });
    return current;
  });
  if (!job) return;
  if (job.terminal) { await notify({ admin, id, job }); return; }
  const update = (patch) => admin.firestore().runTransaction(async (transaction) => {
    const latest = (await transaction.get(ref)).data();
    assert(latest?.leaseId === leaseId && latest.status !== 'discarded', 'OPERATION_LEASE_LOST', 'aborted');
    transaction.update(ref, { ...patch, updatedAt: Date.now() });
  });
  try {
    let result = job.committedResult || job.result;
    if (!result) {
      const auth = await actorForJob(admin, job);
      const snapshot = await ref.collection('items').get();
      const items = snapshot.docs.map((item) => ({ ...item.data(), ref: item.ref }));
      assert(items.length === job.expectedCount, 'OPERATION_MEDIA_INCOMPLETE');
      if (items.some((item) => item.state === 'waiting' && item.transferFailed)) fail('OPERATION_UPLOAD_INTERRUPTED', 'unavailable');
      for (const item of items) {
        if (item.asset || item.state === 'waiting') continue;
        await actorForJob(admin, job);
        item.asset = await prepareMediaImpl({ admin, auth, mediaBucket, data: { stagingPath: item.stagingPath, kind: job.kind },
          commitPreparedAsset: async (asset) => admin.firestore().runTransaction(async (transaction) => {
            const current = (await transaction.get(ref)).data();
            assert(current?.leaseId === leaseId && current.status !== 'discarded', 'OPERATION_LEASE_LOST', 'aborted');
            transaction.update(item.ref, { asset, state: 'prepared', mediaCleanupKeys: [`${job.ownerUid}/${asset.assetId}`] });
          }) });
      }
      if (items.some((item) => !item.asset)) {
        const latestItems = await ref.collection('items').get();
        const ready = latestItems.docs.some((item) => item.data().state === 'uploaded' || item.data().transferFailed);
        await update({ status: ready ? 'ready' : 'uploading', stage: 'uploading', leaseUntil: 0 });
        return;
      }
      await actorForJob(admin, job);
      await update({ stage: 'saving' });
      if (job.kind === 'avatar') {
        result = await updateProfileImpl({ admin, auth, mediaBucket, data: { photoMedia: items[0].asset },
          operation: { ref, leaseId, expectedPhotoAssetId: job.expectedPhotoAssetId } });
      } else if (job.draft) {
        const service = job.kind === 'route' ? routeDrafts : recommendationDrafts;
        const publish = job.kind === 'route' ? service.publishRouteDraft : service.publishRecommendationDraft;
        let draftId = job.draft.id; let version = job.draft.version;
        if (!job.mediaSaved) {
          const loaded = job.kind === 'route'
            ? await service.readDraftRevision(admin.firestore(), job.draft.pointer)
            : await service.readVersion(admin.firestore(), job.draft.pointer);
          const content = job.kind === 'route' ? service.stripServerLocationBindings(loaded.draft) : loaded.version.draft;
          const { sourceRouteId, sourceRecommendationId } = job.draft.pointer;
          const draft = attachManifestAssets(content, items, job.kind);
          const save = job.kind === 'route' ? service.saveRouteDraft : service.saveRecommendationDraft;
          const saved = await save({ ...options, auth, data: { draftId, expectedVersion: version,
            saveRequestId: job.mediaSaveRequestId, ...(sourceRouteId ? { sourceRouteId } : {}),
            ...(sourceRecommendationId ? { sourceRecommendationId } : {}), draft } });
          draftId = saved.draftId; version = saved.version;
          await update({ draft: { ...job.draft, id: draftId, version }, mediaSaved: true });
        }
        result = await publish({ ...options, auth, operation: { ref, leaseId, expectedUpdatedAt: job.expectedUpdatedAt }, data: { draftId, expectedVersion: version } });
      } else {
        result = await saveRecommendationImpl({ ...options, auth, data: {
          ...job.legacyPayload,
          ...(job.legacyPayload.recommendationId ? {} : { publishRequestId: id }),
          recommendation: { ...job.legacyPayload.recommendation, media: items.sort((a, b) => a.index - b.index).map((item) => item.asset) },
        }, operation: { ref, leaseId, expectedUpdatedAt: job.expectedUpdatedAt } });
      }
    }
    await finalizeCommittedDraft({ admin, ref, leaseId });
    const status = result.publicationStatus === 'moderation_hold' ? 'review' : 'success';
    await update({ status, stage: status, result, leaseUntil: 0, error: null });
    await notify({ admin, id, job: { ...job, status, result } });
  } catch (error) {
    const latest = (await ref.get()).data();
    if (!latest || latest.status === 'discarded' || latest.leaseId !== leaseId) return;
    if (latest?.result || latest?.committedResult) {
      // A receipt is authoritative even when cache cleanup or notification delivery failed.
      if (!TERMINAL.has(latest.status)) await update({ status: 'ready', leaseUntil: 0 });
      if (TERMINAL.has(latest.status)) throw error;
      return;
    }
    const code = String(error?.code || 'internal');
    const reason = String(error?.details?.reason || 'OPERATION_FAILED').slice(0, 80);
    const retryable = ['unavailable', 'internal', 'deadline-exceeded'].includes(code);
    await update({ status: 'failed', stage: 'failed', leaseUntil: 0, error: { code, reason, retryable } });
    await notify({ admin, id, job: { ...job, status: 'failed' } });
  }
}

async function maintainBackgroundOperations(options) {
  const { admin, notify = notifyOutcome } = options;
  const db = admin.firestore();
  const pending = await db.collection(JOBS).where('status', 'in', ['ready', 'processing', 'uploading']).limit(50).get();
  for (const item of pending.docs) {
    // Re-read under a transaction: a finalize event or worker may have advanced
    // the job since the maintenance query, including committing its result.
    const failed = await db.runTransaction(async (transaction) => {
      const job = (await transaction.get(item.ref)).data();
      if (!job || TERMINAL.has(job.status) || job.leaseUntil > Date.now()) return null;
      if (job.status === 'uploading' && !job.committedResult
        && Date.now() - (job.lastTransferAt || job.createdAt) > 30 * 60 * 1000) {
        transaction.update(item.ref, { status: 'failed', stage: 'failed', updatedAt: Date.now(),
          error: { code: 'upload-interrupted', reason: 'OPERATION_UPLOAD_INTERRUPTED', retryable: true } });
        return { ...job, status: 'failed' };
      }
      const items = job.status === 'uploading' ? await transaction.get(item.ref.collection('items')) : null;
      if (!items || job.committedResult || items.docs.some((media) => media.data().state === 'uploaded' || media.data().transferFailed)
        || items.docs.every((media) => media.data().asset)) {
        transaction.update(item.ref, { status: 'ready', leaseUntil: 0, updatedAt: Date.now() });
      }
      return null;
    });
    if (failed) await notify({ admin, id: item.id, job: failed });
  }
  const expired = await db.collection(JOBS).where('expireAt', '<=', new Date()).limit(50).get();
  for (const item of expired.docs) await db.recursiveDelete(item.ref);
}

module.exports = { JOBS, normalizeManifest, attachManifestAssets, publicJob, startBackgroundOperation,
  getBackgroundOperations, retryBackgroundOperation, acknowledgeBackgroundOperation, discardBackgroundOperation, reportBackgroundTransferFailure, recordBackgroundUpload, processBackgroundOperation,
  maintainBackgroundOperations, finalizeCommittedDraft, actorForJob, notifyOutcome };
