const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { TERMS_VERSION, PRIVACY_VERSION, PROFILE_DETAILS_VERSION } = require('./legalPolicy.generated');
const service = require('./backgroundOperationService');

const bucket = 'demo-planli-e2e.appspot.com';
const auth = { uid: 'owner', token: { email_verified: true, auth_time: Math.floor(Date.now() / 1000), firebase: { sign_in_provider: 'password' } } };
function fixture() {
  const records = new Map([['users/owner', { displayName: 'Test Owner', status: 'active',
    onboarding: { profileDetailsVersion: PROFILE_DETAILS_VERSION, profileDetailsCompletedAt: 1 },
    legal: { termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION, acceptedAt: 1 },
    smartProfile: { setupRequired: false },
  }]]);
  const snap = (path) => ({ id: path.split('/').at(-1), ref: doc(path), exists: records.has(path), data: () => records.get(path) });
  function doc(path) { return { path, id: path.split('/').at(-1), get: async () => snap(path),
    update: async (patch) => { assert(records.has(path), `Missing ${path}`); records.set(path, { ...records.get(path), ...patch }); },
    collection: (name) => collection(`${path}/${name}`) }; }
  function collection(path, filters = [], ordering = null, size = Infinity) {
    return { doc: (id) => doc(`${path}/${id}`), where: (key, op, value) => collection(path, [...filters, [key, op, value]], ordering, size),
      orderBy: (key, direction) => collection(path, filters, [key, direction], size), limit: (n) => collection(path, filters, ordering, n),
      async get() {
        let entries = [...records].filter(([key, value]) => key.startsWith(`${path}/`) && key.split('/').length === path.split('/').length + 1
          && filters.every(([field, op, expected]) => op === '==' ? value[field] === expected : op === 'in' ? expected.includes(value[field]) : value[field] <= expected));
        if (ordering) entries.sort((a, b) => (a[1][ordering[0]] - b[1][ordering[0]]) * (ordering[1] === 'desc' ? -1 : 1));
        const docs = entries.slice(0, size).map(([key]) => snap(key)); return { docs, size: docs.length, empty: !docs.length };
      } };
  }
  let transactionQueue = Promise.resolve();
  const db = { doc, collection, recursiveDelete: async (ref) => {
    for (const key of records.keys()) if (key === ref.path || key.startsWith(`${ref.path}/`)) records.delete(key);
  }, runTransaction: (work) => {
    const task = transactionQueue.then(async () => {
      const changes = [];
      const result = await work({ get: async (ref) => ref.path ? snap(ref.path) : ref.get(),
        delete: (ref) => changes.push(() => records.delete(ref.path)),
        update: (ref, patch) => changes.push(() => { assert(records.has(ref.path)); records.set(ref.path, { ...records.get(ref.path), ...patch }); }),
        set: (ref, data) => changes.push(() => records.set(ref.path, data)),
        create: (ref, data) => changes.push(() => { assert(!records.has(ref.path)); records.set(ref.path, data); }) });
      changes.forEach((apply) => apply()); return result;
    });
    transactionQueue = task.catch(() => {}); return task;
  } };
  const user = { emailVerified: true, disabled: false };
  const admin = { storage: () => ({ bucket: () => ({ file: () => ({ getMetadata: async () => { throw Object.assign(new Error(), { code: 404 }); } }) }) }), firestore: Object.assign(() => db, { FieldValue: { serverTimestamp: () => Date.now() } }), auth: () => ({ getUser: async () => user }) };
  const id = randomUUID(); const mediaId = randomUUID();
  const item = { id: mediaId, bytes: 123, stagingPath: `media-staging/owner/${mediaId}.jpg` };
  const options = { admin, auth, mediaBucket: bucket, data: { operationId: id, kind: 'avatar', items: [item] } };
  const jobPath = `${service.JOBS}/${id}`; const itemPath = `${jobPath}/items/${mediaId}`;
  const finalized = { bucket, name: item.stagingPath, size: '123', contentType: 'image/jpeg', generation: '1',
    metadata: { operationId: id, ownerUid: 'owner', variant: 'staging' } };
  const notifications = [];
  const asset = { assetId: randomUUID(), feed: { url: 'https://example.test/photo.webp' } };
  const worker = { admin, id, mediaBucket: bucket, notify: async (notice) => notifications.push(notice),
    prepareMediaImpl: async ({ commitPreparedAsset }) => { await commitPreparedAsset(asset); return asset; },
    updateProfileImpl: async ({ operation }) => {
      assert.equal(records.get(itemPath).asset.assetId, asset.assetId, 'Media checkpoint precedes the business write');
      await operation.ref.update({ committedResult: { photoMedia: asset, publicationStatus: 'active' } });
      return { photoMedia: asset, publicationStatus: 'active' };
    } };
  return { records, admin, id, item, options, finalized, worker, user, asset, notifications, jobPath, itemPath };
}

test('registration persists one private, immutable intent without credentials', async () => {
  const f = fixture();
  const result = await service.startBackgroundOperation(f.options);
  assert.equal(result.status, 'uploading');
  assert.equal((await service.startBackgroundOperation(f.options)).operationId, f.id);
  assert.equal(f.records.get('system/operations/owners/owner').count, 1);
  assert.equal(JSON.stringify([...f.records]).includes('access_token'), false);
  await assert.rejects(service.startBackgroundOperation({ ...f.options, data: { ...f.options.data, items: [{ ...f.item, bytes: 124 }] } }), /could not be completed/);
  await assert.rejects(service.getBackgroundOperations({ admin: f.admin, auth: { uid: 'other' }, data: { operationId: f.id } }), (error) => error.code === 'not-found');
});

test('manifest rejects foreign paths, malformed entries, duplicate identities and excess media', () => {
  const f = fixture();
  for (const items of [[null], [{ ...f.item, stagingPath: 'media-staging/other/a.jpg' }], [{ ...f.item, bytes: 30 * 1024 * 1024 }], [f.item, f.item]]) {
    assert.throws(() => service.normalizeManifest('recommendation', 'owner', items));
  }
  assert.throws(() => service.normalizeManifest('avatar', 'owner', []));
});

test('upload events bind bucket, owner, exact bytes and operation before processing', async () => {
  const f = fixture(); await service.startBackgroundOperation(f.options);
  for (const object of [{ ...f.finalized, bucket: 'other' }, { ...f.finalized, size: '999' }, { ...f.finalized, metadata: { ...f.finalized.metadata, ownerUid: 'other' } }]) {
    await service.recordBackgroundUpload({ admin: f.admin, object, mediaBucket: bucket });
    assert.equal(f.records.get(f.itemPath).state, 'waiting');
  }
  await service.recordBackgroundUpload({ admin: f.admin, object: f.finalized, mediaBucket: bucket });
  assert.equal(f.records.get(f.jobPath).status, 'ready');
  await service.processBackgroundOperation(f.worker);
  assert.equal(f.records.get(f.jobPath).status, 'success');
  assert.equal(f.notifications.length, 1);
});

test('committed business receipt wins over a lost response and is not saved twice', async () => {
  const f = fixture(); await service.startBackgroundOperation(f.options);
  await service.recordBackgroundUpload({ admin: f.admin, object: f.finalized, mediaBucket: bucket });
  let saves = 0;
  const save = f.worker.updateProfileImpl;
  f.worker.updateProfileImpl = async (options) => { saves++; await save(options); throw new Error('Lost response'); };
  await service.processBackgroundOperation(f.worker);
  assert.equal(f.records.get(f.jobPath).status, 'ready');
  f.user.disabled = true; // Recording an already committed result needs no new business authorization.
  await service.processBackgroundOperation(f.worker);
  assert.equal(saves, 1);
  assert.equal(f.records.get(f.jobPath).status, 'success');
});

test('prepared media checkpoint survives worker restart without processing twice', async () => {
  const f = fixture(); await service.startBackgroundOperation(f.options);
  await service.recordBackgroundUpload({ admin: f.admin, object: f.finalized, mediaBucket: bucket });
  let encodes = 0;
  const prepare = f.worker.prepareMediaImpl;
  f.worker.prepareMediaImpl = async (options) => { encodes++; await prepare(options); throw Object.assign(new Error(), { code: 'unavailable' }); };
  await service.processBackgroundOperation(f.worker);
  await service.retryBackgroundOperation(f.options);
  await service.processBackgroundOperation(f.worker);
  assert.equal(encodes, 1);
  assert.equal(f.records.get(f.jobPath).status, 'success');
});

test('revoked and suspended accounts cannot complete accepted work', async () => {
  for (const mode of ['disabled', 'revoked', 'deleting']) {
    const f = fixture(); await service.startBackgroundOperation(f.options);
    await service.recordBackgroundUpload({ admin: f.admin, object: f.finalized, mediaBucket: bucket });
    if (mode === 'disabled') f.user.disabled = true;
    if (mode === 'revoked') f.user.tokensValidAfterTime = new Date(Date.now() + 60000).toISOString();
    if (mode === 'deleting') f.records.get('users/owner').status = 'deleting';
    f.worker.updateProfileImpl = async () => assert.fail('No business write may run');
    await service.processBackgroundOperation(f.worker);
    assert.equal(f.records.get(f.jobPath).status, 'failed');
    assert.equal(f.records.get(f.jobPath).error.retryable, false);
  }
});

test('concurrent trigger delivery claims only one worker lease', async () => {
  const f = fixture(); await service.startBackgroundOperation(f.options);
  await service.recordBackgroundUpload({ admin: f.admin, object: f.finalized, mediaBucket: bucket });
  let saves = 0; const save = f.worker.updateProfileImpl;
  f.worker.updateProfileImpl = async (options) => { saves++; return save(options); };
  await Promise.all([service.processBackgroundOperation(f.worker), service.processBackgroundOperation(f.worker)]);
  assert.equal(saves, 1);
});

test('failed transfer has an explicit retry, while late finalized bytes are retained', async () => {
  const f = fixture(); await service.startBackgroundOperation(f.options);
  await service.reportBackgroundTransferFailure({ ...f.options, data: { operationId: f.id, itemIds: [f.item.id] } });
  await service.processBackgroundOperation(f.worker);
  assert.equal(f.records.get(f.jobPath).status, 'failed');
  await service.recordBackgroundUpload({ admin: f.admin, object: f.finalized, mediaBucket: bucket });
  assert.equal(f.records.get(f.jobPath).status, 'failed');
  assert.equal(f.records.get(f.itemPath).state, 'uploaded');
  await service.retryBackgroundOperation(f.options);
  await service.processBackgroundOperation(f.worker);
  assert.equal(f.records.get(f.jobPath).status, 'success');
});

test('discard cannot race a pending save and cannot resurrect a discarded failure', async () => {
  const f = fixture(); await service.startBackgroundOperation(f.options);
  await assert.rejects(service.discardBackgroundOperation(f.options));
  f.records.get(f.jobPath).status = 'failed';
  await service.discardBackgroundOperation(f.options);
  await service.recordBackgroundUpload({ admin: f.admin, object: f.finalized, mediaBucket: bucket });
  await service.processBackgroundOperation(f.worker);
  assert.equal(f.records.get(f.jobPath).status, 'discarded');
  await assert.rejects(service.retryBackgroundOperation(f.options));
});

test('route media preserves mixed remote/local ordering and rejects stale slot identities', () => {
  const old = { assetId: 'remote' }; const added = { assetId: 'new' };
  const draft = { days: [{ draftId: 'day', stops: [{ draftId: 'stop', media: old, mediaOrder: ['local', 'remote'] }] }] };
  const item = { index: 0, asset: added, slot: { type: 'route-stop', dayIndex: 0, stopIndex: 0, mediaIndex: 0, dayDraftId: 'day', draftId: 'stop' } };
  const result = service.attachManifestAssets(draft, [item], 'route');
  assert.deepEqual(result.days[0].stops[0].media, added);
  assert.deepEqual(result.days[0].stops[0].additionalMedia, [old]);
  assert.equal(draft.days[0].stops[0].media, old);
  assert.throws(() => service.attachManifestAssets(draft, [{ ...item, slot: { ...item.slot, draftId: 'moved' } }], 'route'));
});

test('unseen server outcomes are retained until their owner acknowledges them', async () => {
  const f = fixture(); await service.startBackgroundOperation(f.options);
  await service.recordBackgroundUpload({ admin: f.admin, object: f.finalized, mediaBucket: bucket });
  await service.processBackgroundOperation(f.worker);
  assert.equal(f.records.get(f.jobPath).expireAt, undefined);
  await assert.rejects(service.acknowledgeBackgroundOperation({ ...f.options, auth: { uid: 'other' } }));
  await service.acknowledgeBackgroundOperation(f.options);
  const expiry = f.records.get(f.jobPath).expireAt;
  assert(expiry > new Date());
  await service.acknowledgeBackgroundOperation(f.options);
  assert.equal(f.records.get(f.jobPath).expireAt, expiry);
});

test('maintenance cannot replace a completion that raced its pending query', async () => {
  const f = fixture(); await service.startBackgroundOperation(f.options);
  f.records.get(f.jobPath).createdAt = Date.now() - 3600000;
  const db = f.admin.firestore(); const transact = db.runTransaction;
  db.runTransaction = (work) => {
    f.records.set(f.jobPath, { ...f.records.get(f.jobPath), status: 'success', committedResult: { photoMedia: f.asset } });
    return transact(work);
  };
  await service.maintainBackgroundOperations(f.worker);
  assert.equal(f.records.get(f.jobPath).status, 'success');
  assert.equal(f.notifications.length, 0);
});

test('maintenance reports an interrupted upload and preserves a running worker lease', async () => {
  for (const leased of [false, true]) {
    const f = fixture(); await service.startBackgroundOperation(f.options);
    Object.assign(f.records.get(f.jobPath), { createdAt: Date.now() - 3600000, leaseUntil: leased ? Date.now() + 60000 : 0 });
    await service.maintainBackgroundOperations(f.worker);
    assert.equal(f.records.get(f.jobPath).status, leased ? 'uploading' : 'failed');
    assert.equal(f.notifications.length, leased ? 0 : 1);
  }
});

test('a committed receipt clears its abandoned publish claim without deleting a newer draft', async () => {
  for (const newer of [false, true]) {
    const f = fixture(); await service.startBackgroundOperation(f.options);
    Object.assign(f.records.get(f.jobPath), { kind: 'recommendation', draft: { id: 'draft', version: 2 },
      leaseId: 'lease', committedResult: { recommendationId: 'published' } });
    const pointerPath = 'system/recommendationDrafts/owners/owner';
    const versionPath = `${pointerPath}/draftVersions/version`;
    f.records.set(pointerPath, { ownerId: 'owner', draftId: 'draft', version: newer ? 3 : 2, state: 'publishing', versionPath });
    f.records.set(versionPath, { draft: {} });
    await service.finalizeCommittedDraft({ admin: f.admin, ref: f.admin.firestore().doc(f.jobPath), leaseId: 'lease' });
    assert.equal(f.records.has(pointerPath), newer);
    assert.equal(f.records.has(`${pointerPath}/publicationReceipts/draft`), !newer);
  }
});

test('an edit retains only canonical images from its owned content', async () => {
  const f = fixture(); const assetId = randomUUID();
  const asset = { assetId, ...Object.fromEntries(['large', 'feed', 'thumb'].map((variant) => [variant,
    { path: `media/owner/${assetId}/${variant}.webp`, url: `https://example.test/${variant}.webp` }])) };
  f.records.set('recommendations/owned', { ownerId: 'owner', media: [asset], updatedAt: 1 });
  const data = { operationId: f.id, kind: 'recommendation', items: [{ id: f.item.id, asset }],
    payload: { recommendationId: 'owned', recommendation: { title: 'An edit' } } };
  const result = await service.startBackgroundOperation({ ...f.options, data });
  assert.equal(result.status, 'ready');
  assert.deepEqual(f.records.get(f.itemPath).asset, asset);
  await assert.rejects(service.startBackgroundOperation({ ...f.options, data: {
    ...data, operationId: randomUUID(), payload: { recommendation: { title: 'Another post' } },
  } }));
});
