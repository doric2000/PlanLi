'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { createRequire } = require('node:module');
const { ROOT, PROJECT, BUCKET, assertLocalEnvironment } = require('./environment');
const { LOCAL_APP_CHECK_TOKEN } = require('../../client/src/config/localEmulators');

async function backgroundOperationSmoke({ call, fixture, bytes, upload }) {
  assertLocalEnvironment();
  const fromFunctions = createRequire(path.join(ROOT, 'functions/package.json'));
  const { initializeApp, deleteApp } = fromFunctions('firebase-admin/app');
  const { getFirestore } = fromFunctions('firebase-admin/firestore');
  const { getAuth } = fromFunctions('firebase-admin/auth');
  const { getStorage } = fromFunctions('firebase-admin/storage');
  const app = initializeApp({ projectId: PROJECT, storageBucket: BUCKET }, 'background-rollout-smoke');
  const db = getFirestore(app);
  const item = () => {
    const id = crypto.randomUUID();
    return { id, bytes: bytes.length, stagingPath: `media-staging/${fixture.uid}/${id}.jpg` };
  };
  const waitFor = async (operationId, status) => {
    const deadline = Date.now() + 90000;
    let job;
    do {
      job = await call('getBackgroundOperations', { operationId });
      if (job.status === status || (job.status === 'failed' && status !== 'failed')) break;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } while (Date.now() < deadline);
    assert.equal(job.status, status, JSON.stringify(job.error || job));
    return job;
  };
  try {
    const operationId = crypto.randomUUID();
    const source = item();
    const intent = { operationId, kind: 'avatar', items: [source] };
    await call('startBackgroundOperation', intent);
    await call('reportBackgroundTransferFailure', { operationId, itemIds: [source.id] });
    const failed = await waitFor(operationId, 'failed');
    assert.equal(failed.error.retryable, true);
    await call('retryBackgroundOperation', { operationId });
    await upload(source.stagingPath, operationId);
    const result = await waitFor(operationId, 'success');
    assert.equal(result.attempt, 2);
    assert.deepEqual((await call('startBackgroundOperation', intent)).result, result.result);
    const jobRef = db.doc(`system/operations/jobs/${operationId}`);
    const before = (await jobRef.get()).data();
    const mediaBucket = getStorage(app).bucket(BUCKET);
    // Redeliver the real finalized-object shape after completion. It must not save twice.
    await fromFunctions('./backgroundOperationService').recordBackgroundUpload({
      admin: { firestore: () => db }, mediaBucket: BUCKET,
      object: { bucket: BUCKET, name: source.stagingPath, size: String(bytes.length),
        contentType: 'image/jpeg', generation: '1',
        metadata: { ownerUid: fixture.uid, variant: 'staging', operationId } },
    });
    assert.deepEqual((await jobRef.get()).data().committedResult, before.committedResult);
    assert.equal((await jobRef.get()).data().updatedAt, before.updatedAt);

    const area = { countryId: 'GB', cityId: fixture.cityId, cityName: 'London' };
    const routeDraft = await call('saveRouteDraft', { draft: {
      area, dayCount: 1, title: 'Local background route', description: 'Synthetic rollout validation.',
      attributes: { audienceScope: 'all', audiences: [], budgetLevel: 'balanced' }, localMediaCount: 1,
      days: [{ stops: [
        { title: 'First stop', locationPrecision: 'general', destination: area },
        { title: 'Second stop', locationPrecision: 'general', destination: area },
      ] }],
    } });
    const routeOperationId = crypto.randomUUID(); const routeSource = item();
    await call('startBackgroundOperation', { operationId: routeOperationId, kind: 'route',
      draftId: routeDraft.draftId, expectedVersion: routeDraft.version,
      items: [{ ...routeSource, slot: { type: 'route-stop', dayIndex: 0, stopIndex: 0, mediaIndex: 0 } }] });
    await upload(routeSource.stagingPath, routeOperationId);
    const routeResult = await waitFor(routeOperationId, 'success');
    const route = (await db.doc(`routes/${routeResult.result.routeId}`).get()).data();
    assert.equal(route.ownerId, fixture.uid);
    const revisionPath = `routes/${routeResult.result.routeId}/revisions/${route.activeRevisionId}`;
    assert.equal((await db.doc(revisionPath).get()).data().stopCount, 2);
    const days = await db.collection(`${revisionPath}/days`).get();
    const stops = await days.docs[0].ref.collection('stops').orderBy('position').get();
    assert.equal(stops.size, 2);
    const routePhoto = stops.docs[0].data().media;
    assert(routePhoto?.feed?.path, 'The published stop must retain the processed photo');
    assert.equal((await mediaBucket.file(routePhoto.feed.path).exists())[0], true);

    // A separate synthetic account proves ownership and deletion without removing
    // the shared device-flow fixture or using production credentials.
    const uid = `background-delete-${crypto.randomUUID()}`;
    const email = `${uid}@example.test`; const password = 'Local-only-2468!';
    await getAuth(app).createUser({ uid, email, password, emailVerified: true });
    await db.doc(`users/${uid}`).set({ ...(await db.doc(`users/${fixture.uid}`).get()).data(), photoMedia: null, photoURL: null });
    const login = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=local', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }), signal: AbortSignal.timeout(10000),
    });
    assert.equal(login.status, 200);
    const { idToken } = await login.json();
    const callOther = async (name, data) => {
      const response = await fetch(`http://127.0.0.1:5001/${PROJECT}/europe-west1/${name}`, {
        method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${idToken}`,
          'X-Firebase-AppCheck': LOCAL_APP_CHECK_TOKEN }, body: JSON.stringify({ data }), signal: AbortSignal.timeout(60000),
      });
      const payload = await response.json();
      if (!response.ok || payload.error) throw new Error(payload.error?.status || String(response.status));
      return payload.result ?? payload.data;
    };
    await assert.rejects(callOther('getBackgroundOperations', { operationId }), /NOT_FOUND/);
    await assert.rejects(callOther('retryBackgroundOperation', { operationId }), /NOT_FOUND/);
    const deletionId = crypto.randomUUID(); const deletionMedia = crypto.randomUUID();
    const deletionPath = `media-staging/${uid}/${deletionMedia}.jpg`;
    await callOther('startBackgroundOperation', { operationId: deletionId, kind: 'avatar',
      items: [{ id: deletionMedia, bytes: bytes.length, stagingPath: deletionPath }] });
    // An owned but unfinished source must be removed along with job children.
    await mediaBucket.file(deletionPath).save(bytes, { metadata: { contentType: 'image/jpeg',
      metadata: { ownerUid: uid, variant: 'staging' } } });
    await callOther('requestAccountDeletion', {});
    assert.equal((await db.doc(`system/operations/jobs/${deletionId}`).get()).exists, false);
    assert.equal((await db.collection(`system/operations/jobs/${deletionId}/items`).get()).empty, true);
    assert.equal((await db.doc(`system/operations/owners/${uid}`).get()).exists, false);
    assert.equal((await mediaBucket.file(deletionPath).exists())[0], false);
    await assert.rejects(getAuth(app).getUser(uid), (error) => error.code === 'auth/user-not-found');
    console.log('PASS background rollout: interrupted upload, explicit retry, duplicate delivery, route completion, foreign-owner rejection, account/job/source deletion.');
  } finally { await deleteApp(app); }
}

module.exports = { backgroundOperationSmoke };
