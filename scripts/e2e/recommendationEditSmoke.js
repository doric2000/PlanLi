'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { createRequire } = require('node:module');
const { ROOT, PROJECT, BUCKET, assertLocalEnvironment } = require('./environment');

// Real emulator callables, storage metadata and document readback. No production
// credentials, data, or client-side authorization shortcuts are used here.
async function recommendationEditSmoke({ call, fixture, recommendationId, media, uploadPrepared }) {
  assertLocalEnvironment();
  const fromFunctions = createRequire(path.join(ROOT, 'functions/package.json'));
  const { initializeApp, deleteApp } = fromFunctions('firebase-admin/app');
  const { getFirestore } = fromFunctions('firebase-admin/firestore');
  const { getStorage } = fromFunctions('firebase-admin/storage');
  const app = initializeApp({ projectId: PROJECT, storageBucket: BUCKET }, 'recommendation-edit-smoke');
  try {
    const db = getFirestore(app);
    const source = db.doc(`recommendations/${recommendationId}`);
    const second = await uploadPrepared();
    const waitForJob = async (operationId) => {
      const deadline = Date.now() + 90000;
      let job;
      do {
        job = await call('getBackgroundOperations', { operationId });
        if (['success', 'review', 'failed'].includes(job.status)) break;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } while (Date.now() < deadline);
      assert.equal(job.status, 'success', JSON.stringify(job.error || { status: job.status }));
      assert.equal(job.result.recommendationId, recommendationId);
    };
    const edit = async (assets) => {
      const draft = await call('saveRecommendationDraft', { sourceRecommendationId: recommendationId, draft: {
        step: 4, locationMode: 'destination', selectedCountry: { id: 'GB', name: 'בריטניה' },
        selectedCity: { id: fixture.cityId, name: 'לונדון' }, categoryId: 'activities', subcategoryIds: ['aquarium'],
        title: 'Local edited aquarium', description: 'Synthetic retained media edit.', budget: 'balanced',
        details: {}, media: assets, localMediaCount: 0,
      } });
      const operationId = crypto.randomUUID();
      const request = { operationId, kind: 'recommendation', draftId: draft.draftId, expectedVersion: draft.version,
        items: assets.map((asset) => ({ id: crypto.randomUUID(), asset })) };
      await call('startBackgroundOperation', request);
      // No publish call follows admission: only the server worker completes it.
      await waitForJob(operationId);
      assert.equal((await call('startBackgroundOperation', request)).status, 'success');
      const saved = (await source.get()).data();
      assert.equal(saved.ownerId, fixture.uid);
      assert.deepEqual(saved.media.map((asset) => asset.assetId), assets.map((asset) => asset.assetId));
      assert.deepEqual(saved.subcategoryIds, ['aquarium']);
      assert.equal(saved.categoryId, 'activities');
      assert.equal((await call('getCurrentRecommendationDraft', {})).draft, null);
      return saved.media;
    };
    let assets = await edit([media, second]);
    // An existing displayed image can have a missing URL for a smaller variant.
    // Set this synthetic legacy shape after all normal publication writes finish.
    const partial = assets.map((asset) => ({ ...asset, thumb: { ...asset.thumb } }));
    delete partial[0].thumb.url;
    await source.update({ media: partial });
    const file = getStorage(app).bucket(BUCKET).file(partial[0].thumb.path);
    const [metadata] = await file.getMetadata();
    await file.setMetadata({ metadata: { ...metadata.metadata, state: 'claimed' } });
    assets = await edit([...partial].reverse());
    assert.ok(assets[1].thumb.url, 'Retained claimed thumbnail must recover its download URL');
    const downloadUrl = new URL(assets[1].thumb.url);
    assert.ok(downloadUrl.pathname.startsWith(`/v0/b/${BUCKET}/o/`));
    downloadUrl.protocol = 'http:';
    downloadUrl.host = '127.0.0.1:9199';
    const image = await fetch(downloadUrl, { signal: AbortSignal.timeout(10000) });
    assert.equal(image.status, 200);
    assert.match(image.headers.get('content-type'), /image\/webp/);
    await edit([assets[0]]);
    console.log('PASS recommendation edit: add, reorder, retained claimed URL recovery, image download, remove, catalog preservation, worker-only completion and idempotent replay.');
  } finally { await deleteApp(app); }
}

module.exports = { recommendationEditSmoke };
