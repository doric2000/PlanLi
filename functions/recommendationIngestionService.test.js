const test = require('node:test');
const assert = require('node:assert/strict');

const { createIngestionMemoryAdmin } = require('./testSupport/ingestionMemoryAdmin');
const service = require('./recommendationIngestionService');
const { buildPublishData, groupKeyFor } = require('./recommendationIngestionPolicy');

const NOW = new Date('2026-10-01T10:00:00Z');
const ROOT = 'system/recommendationIngestion';
const PUBLISHER = 'system-recommendations-publisher';
const GROUP_URL = 'https://www.facebook.com/groups/327521953445426/';
const GROUP_KEY = groupKeyFor(GROUP_URL);

function adminAuth(overrides = {}) {
  return {
    uid: 'admin-1',
    token: {
      admin: true,
      email_verified: true,
      auth_time: Math.floor(Date.now() / 1000),
      firebase: { sign_in_provider: 'password', sign_in_second_factor: 'totp' },
      ...overrides,
    },
  };
}

function seed(extra = {}) {
  return {
    'system/moderation/admins/admin-1': { active: true },
    [`${ROOT}/config/main`]: { enabled: true, publisherUid: PUBLISHER, rolloutStage: 'trial', perRunChargeCapUsd: 0.25 },
    [`${ROOT}/groups/${GROUP_KEY}`]: {
      groupKey: GROUP_KEY, url: GROUP_URL, label: 'פראג', enabled: true, verifiedAt: NOW,
      countryId: 'CZ', cityId: 'prague', resultsLimit: 10,
    },
    'countries/CZ': { status: 'active', code: 'CZ', name: 'צ׳כיה' },
    // Production destinations keep their names and centre under identity.
    'countries/CZ/destinations/prague': {
      status: 'active', destinationType: 'city',
      identity: { names: { he: 'פראג', en: 'Prague' }, coordinates: { lat: 50.0755, lng: 14.4378 } },
    },
    [`publicProfiles/${PUBLISHER}`]: { displayName: 'המלצות מערכת', status: 'active', uid: PUBLISHER },
    ...extra,
  };
}

const postText = [
  'Cafe Aurora: quiet garden, excellent cardamom buns and friendly staff.',
  'We came back twice during our week in the city.',
].join('\n');

function providerItem(overrides = {}) {
  return {
    postId: 'post-1',
    url: 'https://www.facebook.com/groups/327521953445426/posts/1/',
    time: '2026-09-20T09:00:00Z',
    text: postText,
    reactionLikeCount: 72,
    likesCount: 130,
    attachments: [
      { __typename: 'Photo', id: 'm1', photo_image: { uri: 'https://scontent.xx.fbcdn.net/v/1.jpg' } },
      { __typename: 'Photo', id: 'm2', photo_image: { uri: 'https://scontent.xx.fbcdn.net/v/2.jpg' } },
    ],
    ...overrides,
  };
}

function makeDeps({ predictions, extractCandidates } = {}) {
  const calls = { extract: 0, autocomplete: 0, fetchPlace: 0, download: 0, staged: [], start: [], save: [] };
  let assetSequence = 0;
  const deps = {
    now: () => NOW,
    calls,
    apify: {
      startGroupRun: async (options) => {
        calls.start.push(options);
        return { providerRunId: `run-${calls.start.length}`, datasetId: 'ds-1', status: 'RUNNING' };
      },
      getRun: async () => ({ providerRunId: 'run-1', status: 'SUCCEEDED', datasetId: 'ds-1', usageTotalUsd: 0.05, terminal: true }),
      listDatasetItems: async () => deps.items,
    },
    items: [
      providerItem(),
      providerItem({ postId: 'post-2', reactionLikeCount: 12, text: `${postText} Second post.` }),
      providerItem({ postId: 'post-3', reactionLikeCount: undefined, text: `${postText} Third post.` }),
      providerItem({ postId: 'post-4', time: '2025-01-01T00:00:00Z', text: `${postText} Old post.` }),
    ],
    extract: async () => {
      calls.extract += 1;
      return {
        model: 'claude-haiku-4-5',
        usage: { inputTokens: 800, outputTokens: 100 },
        candidates: extractCandidates || [{
          placeName: 'Cafe Aurora', titleSpan: 'Cafe Aurora',
          descriptionSpans: ['quiet garden, excellent cardamom buns and friendly staff.'],
          categoryId: 'food', subcategoryIds: ['cafe'],
          detailSpans: { phone: '', externalUrl: '', priceNote: '' }, photoIndexes: [], photoEvidence: '',
        }],
      };
    },
    downloadImage: async () => {
      calls.download += 1;
      return { buffer: Buffer.from('jpeg-bytes') };
    },
    writeStaging: async (path, _buffer, ownerUid) => calls.staged.push({ path, ownerUid }),
    prepareMedia: async ({ ownerUid, commitPreparedAsset }) => {
      assetSequence += 1;
      const assetId = `00000000-0000-4000-8000-00000000000${assetSequence}`;
      const variant = (name) => ({ path: `media/${ownerUid}/${assetId}/${name}.webp`, url: `https://firebasestorage.googleapis.com/${name}` });
      const asset = { assetId, aspectRatio: 1, placeholder: { color: '#eeeeee' }, large: variant('large'), feed: variant('feed'), thumb: variant('thumb') };
      await commitPreparedAsset(asset);
      return asset;
    },
    autocomplete: async () => {
      calls.autocomplete += 1;
      return predictions || [{ placeId: 'place-aurora', text: 'Cafe Aurora', secondaryText: 'Prague' }];
    },
    fetchPlace: async (placeId) => {
      calls.fetchPlace += 1;
      const localized = { placeId, displayName: 'Cafe Aurora', address: 'Synthetic street 1, Prague',
        coordinates: { lat: 50.08, lng: 14.42 }, countryCode: 'CZ', types: ['cafe'] };
      return { he: localized, en: localized };
    },
    saveRecommendation: async (options) => {
      calls.save.push(options);
      return { recommendationId: 'rec_synthetic', publicationStatus: 'active', publiclyVisible: true };
    },
  };
  return deps;
}

async function collectAndProcess(admin, deps) {
  const auth = adminAuth();
  await service.startRecommendationIngestionCollection({ admin, auth, data: { groupKey: GROUP_KEY }, apifyToken: 'token', deps });
  await service.pollRecommendationIngestionRuns({ admin, apifyToken: 'token', deps });
  const tasks = [...admin.documents.keys()].filter((key) => key.startsWith(`${ROOT}/tasks/`));
  for (const task of tasks) {
    // eslint-disable-next-line no-await-in-loop
    await service.processIngestionSource({ admin, sourceId: admin.documents.get(task).sourceId, deps });
  }
  const candidates = [...admin.documents.entries()].filter(([key]) => key.startsWith(`${ROOT}/candidates/`) && key.split('/').length === 4);
  return { tasks, candidates };
}

test('ingestion callables require an active admin with recent TOTP for every mutation', async () => {
  const admin = createIngestionMemoryAdmin(seed());
  const deps = makeDeps();
  const denied = [
    { uid: 'user-1', token: { email_verified: true } },
    adminAuth({ firebase: { sign_in_provider: 'password' } }),
    adminAuth({ auth_time: Math.floor(Date.now() / 1000) - 3600 }),
  ];
  for (const auth of denied) {
    for (const call of [
      () => service.startRecommendationIngestionCollection({ admin, auth, data: { groupKey: GROUP_KEY }, apifyToken: 't', deps }),
      () => service.approveSystemRecommendationCandidate({ admin, auth, data: { candidateId: 'cand_x', expectedRevision: 1 }, deps }),
      () => service.updateSystemRecommendationCandidate({ admin, auth, data: { candidateId: 'cand_x', expectedRevision: 1, patch: { budget: 'free' } }, deps }),
      () => service.rejectSystemRecommendationCandidate({ admin, auth, data: { candidateId: 'cand_x', expectedRevision: 1, reason: 'no' } }),
      () => service.updateRecommendationIngestionGroup({ admin, auth, data: { groupKey: GROUP_KEY, enabled: false } }),
    ]) {
      // eslint-disable-next-line no-await-in-loop
      await assert.rejects(call(), (error) => ['admin_required', 'totp_required', 'recent_sign_in_required'].includes(error.details?.reason));
    }
  }
  await assert.rejects(service.listSystemRecommendationCandidates({ admin, auth: denied[0], data: {} }),
    (error) => error.details?.reason === 'admin_required');
  await assert.rejects(service.listSystemRecommendationCandidates({ admin, auth: adminAuth({ admin: false }), data: {} }),
    (error) => error.details?.reason === 'admin_required');
  assert.equal(deps.calls.start.length, 0);
});

test('trial collection reserves a capped budget, filters before extraction, and settles once', async () => {
  const admin = createIngestionMemoryAdmin(seed());
  const deps = makeDeps();
  const auth = adminAuth();
  const started = await service.startRecommendationIngestionCollection({ admin, auth, data: { groupKey: GROUP_KEY }, apifyToken: 'token', deps });
  assert.equal(started.resultsLimit, 10);
  assert.equal(started.reservedUsd, 0.25);
  assert.equal(deps.calls.start[0].maxTotalChargeUsd, 0.25);
  assert.equal(deps.calls.start[0].resultsLimit, 10);
  assert.equal(deps.calls.start[0].onlyPostsNewerThan, '2026-04-01');
  assert.deepEqual(admin.documents.get(`${ROOT}/state/collectionBudget`).reservedUsd, 0.25);

  await assert.rejects(service.startRecommendationIngestionCollection({ admin, auth, data: { groupKey: GROUP_KEY }, apifyToken: 'token', deps }),
    (error) => error.details?.reason === 'ingestion_run_active');

  await service.pollRecommendationIngestionRuns({ admin, apifyToken: 'token', deps });
  await service.pollRecommendationIngestionRuns({ admin, apifyToken: 'token', deps });
  const ledger = admin.documents.get(`${ROOT}/state/collectionBudget`);
  assert.equal(ledger.reservedUsd, 0);
  assert.equal(ledger.spentUsd, 0.05);
  assert.equal(ledger.collectedPosts, 4);
  const run = admin.documents.get(`${ROOT}/runs/${started.runId}`);
  assert.equal(run.status, 'completed');
  assert.deepEqual(run.counts, { invalid: 0, eligible: 1, below_threshold: 1, likes_unverifiable: 1, stale: 1 });
  const tasks = [...admin.documents.keys()].filter((key) => key.startsWith(`${ROOT}/tasks/`));
  assert.equal(tasks.length, 1, 'only the eligible post is queued for extraction');
  assert.equal(deps.calls.extract, 0, 'collection itself never calls the model');
});

test('the collection ledger refuses runs beyond the total cap and releases definitive start failures', async () => {
  const admin = createIngestionMemoryAdmin(seed({
    [`${ROOT}/state/collectionBudget`]: { spentUsd: 9.9, reservedUsd: 0, collectedPosts: 10, reservedPosts: 0 },
  }));
  const deps = makeDeps();
  await assert.rejects(service.startRecommendationIngestionCollection({ admin, auth: adminAuth(), data: { groupKey: GROUP_KEY }, apifyToken: 't', deps }),
    (error) => error.details?.reason === 'ingestion_budget_exhausted');

  const failing = createIngestionMemoryAdmin(seed());
  const failDeps = makeDeps();
  failDeps.apify.startGroupRun = async () => {
    const error = new Error('rejected');
    error.details = { reason: 'apify_http_402', uncertain: false };
    throw error;
  };
  await assert.rejects(service.startRecommendationIngestionCollection({ admin: failing, auth: adminAuth(), data: { groupKey: GROUP_KEY }, apifyToken: 't', deps: failDeps }));
  assert.equal(failing.documents.get(`${ROOT}/state/collectionBudget`).reservedUsd, 0);

  const uncertain = createIngestionMemoryAdmin(seed());
  const uncertainDeps = makeDeps();
  uncertainDeps.apify.startGroupRun = async () => {
    const error = new Error('lost');
    error.details = { reason: 'apify_unreachable', uncertain: true };
    throw error;
  };
  await assert.rejects(service.startRecommendationIngestionCollection({ admin: uncertain, auth: adminAuth(), data: { groupKey: GROUP_KEY }, apifyToken: 't', deps: uncertainDeps }));
  assert.equal(uncertain.documents.get(`${ROOT}/state/collectionBudget`).reservedUsd, 0.25, 'an uncertain start stays charged');
});

test('trial limits are enforced for groups', async () => {
  const otherUrl = 'https://www.facebook.com/groups/1864457083986225/';
  const admin = createIngestionMemoryAdmin(seed());
  const auth = adminAuth();
  await assert.rejects(service.updateRecommendationIngestionGroup({ admin, auth, data: { groupKey: GROUP_KEY, resultsLimit: 20 } }),
    (error) => error.details?.reason === 'ingestion_stage_limit');
  await service.updateRecommendationIngestionGroup({ admin, auth, data: { url: otherUrl, label: 'אתונה', countryId: 'CZ', cityId: 'prague', verified: true } });
  await assert.rejects(service.updateRecommendationIngestionGroup({ admin, auth, data: { groupKey: groupKeyFor(otherUrl), enabled: true } }),
    (error) => error.details?.reason === 'ingestion_stage_limit');
});

test('an eligible post becomes a faithful private candidate with prepared photos and an exact place', async () => {
  const admin = createIngestionMemoryAdmin(seed());
  const deps = makeDeps();
  const { candidates } = await collectAndProcess(admin, deps);
  assert.equal(candidates.length, 1);
  const [, candidate] = candidates[0];
  assert.equal(candidate.content.title, 'Cafe Aurora');
  assert.equal(candidate.content.description, 'quiet garden, excellent cardamom buns and friendly staff.');
  assert.equal(candidate.content.budget, '');
  assert.equal(candidate.location.status, 'resolved');
  assert.equal(candidate.location.placeId, 'place-aurora');
  assert.deepEqual(candidate.photoIds, [0, 1]);
  assert.equal(candidate.reviewState, 'needs_input');
  assert.deepEqual(candidate.readiness.missing, ['budget']);
  assert.ok(deps.calls.staged.every((entry) => entry.ownerUid === PUBLISHER && entry.path.startsWith(`media-staging/${PUBLISHER}/`)));
  const item = admin.documents.get(`${ROOT}/sources/${candidate.sourceId}/items/photo_0`);
  assert.deepEqual(item.mediaCleanupKeys, [`${PUBLISHER}/${item.asset.assetId}`]);
  assert.equal(deps.calls.extract, 1);

  // A retry of the same source version reuses extraction, photos, and place work.
  const sourcePath = `${ROOT}/sources/${candidate.sourceId}`;
  admin.documents.set(sourcePath, { ...admin.documents.get(sourcePath), processing: { state: 'pending', attempts: 0 } });
  await service.processIngestionSource({ admin, sourceId: candidate.sourceId, deps });
  assert.equal(deps.calls.extract, 1);
  assert.equal(deps.calls.download, 2);
  assert.equal(deps.calls.autocomplete, 1);
  const metrics = admin.documents.get(`${ROOT}/metrics/2026-10-01`);
  assert.equal(metrics.extractionCalls, 1);
  assert.equal(metrics.imagesPrepared, 2);
});

test('ambiguous branches stay unready until the reviewer chooses the exact place', async () => {
  const admin = createIngestionMemoryAdmin(seed());
  const deps = makeDeps({ predictions: [
    { placeId: 'branch-1', text: 'Cafe Aurora', secondaryText: 'Old Town' },
    { placeId: 'branch-2', text: 'Cafe Aurora', secondaryText: 'Vinohrady' },
  ] });
  const { candidates } = await collectAndProcess(admin, deps);
  const [path, candidate] = candidates[0];
  const candidateId = path.split('/').at(-1);
  assert.equal(candidate.location.status, 'ambiguous');
  assert.equal(candidate.location.choices.length, 2);
  assert.equal(deps.calls.fetchPlace, 0, 'a name match alone is not enough to fetch a branch');

  const auth = adminAuth();
  const budgeted = await service.updateSystemRecommendationCandidate({ admin, auth, deps,
    data: { candidateId, expectedRevision: candidate.revision, patch: { budget: 'balanced' } } });
  assert.equal(budgeted.reviewState, 'needs_input');
  assert.deepEqual(budgeted.readiness.missing, ['location']);

  await assert.rejects(service.updateSystemRecommendationCandidate({ admin, auth, deps,
    data: { candidateId, expectedRevision: candidate.revision, patch: { placeId: 'branch-2' } } }),
  (error) => error.details?.reason === 'candidate_revision_conflict');
  const located = await service.updateSystemRecommendationCandidate({ admin, auth, deps,
    data: { candidateId, expectedRevision: budgeted.revision, patch: { placeId: 'branch-2' } } });
  assert.equal(located.reviewState, 'ready');
  assert.equal(admin.documents.get(path).location.resolvedBy, 'reviewer');
});

test('approval publishes the exact reviewed revision once under the system publisher', async () => {
  const admin = createIngestionMemoryAdmin(seed());
  const deps = makeDeps();
  const { candidates } = await collectAndProcess(admin, deps);
  const [path, initial] = candidates[0];
  const candidateId = path.split('/').at(-1);
  const auth = adminAuth();

  await assert.rejects(service.approveSystemRecommendationCandidate({ admin, auth, deps,
    data: { candidateId, expectedRevision: initial.revision } }),
  (error) => error.details?.reason === 'candidate_not_ready', 'missing budget blocks publication');

  const edited = await service.updateSystemRecommendationCandidate({ admin, auth, deps,
    data: { candidateId, expectedRevision: initial.revision, patch: { budget: 'economy', photoIds: [1, 0] } } });
  await assert.rejects(service.approveSystemRecommendationCandidate({ admin, auth, deps,
    data: { candidateId, expectedRevision: initial.revision } }),
  (error) => error.details?.reason === 'candidate_revision_conflict', 'a stale preview cannot be approved');

  const detail = await service.getSystemRecommendationCandidate({ admin, auth, data: { candidateId } });
  const poolBefore = [0, 1].map((index) => admin.documents.get(`${ROOT}/sources/${initial.sourceId}/items/photo_${index}`));
  const published = await service.approveSystemRecommendationCandidate({ admin, auth, deps,
    data: { candidateId, expectedRevision: edited.revision } });
  assert.equal(published.recommendationId, 'rec_synthetic');
  assert.equal(published.url, 'https://planli.cc/recommendation/rec_synthetic');
  assert.equal(deps.calls.save.length, 1);
  const [saveCall] = deps.calls.save;
  assert.equal(saveCall.trustedOwnerUid, PUBLISHER);
  assert.equal(saveCall.auth.uid, 'admin-1', 'the reviewer stays the authenticated actor');
  assert.equal(Object.hasOwn(saveCall.data, 'trustedOwnerUid'), false);
  assert.equal(Object.hasOwn(saveCall.data.recommendation, 'ownerId'), false);
  const stored = admin.documents.get(path);
  assert.deepEqual(saveCall.data, buildPublishData({ ...stored, candidateId }, poolBefore));
  assert.deepEqual(saveCall.data.recommendation.media.map((asset) => asset.assetId),
    [poolBefore[1].asset.assetId, poolBefore[0].asset.assetId], 'reviewer photo order is preserved');
  assert.deepEqual(saveCall.data.recommendation.media.map((asset) => asset.assetId), detail.preview.media.map((asset) => asset.assetId));
  assert.equal(detail.preview.title, saveCall.data.recommendation.title);
  assert.equal(detail.preview.description, saveCall.data.recommendation.description);
  assert.equal(detail.preview.budget, 'economy');
  assert.equal(detail.preview.ownerId, PUBLISHER);
  const serialized = JSON.stringify(saveCall.data);
  for (const privateValue of ['facebook.com', 'fbcdn', '72', 'reactionLike', 'sourceId']) {
    assert.equal(serialized.includes(privateValue), false, `${privateValue} must not reach public data`);
  }

  const replay = await service.approveSystemRecommendationCandidate({ admin, auth, deps,
    data: { candidateId, expectedRevision: edited.revision } });
  assert.equal(replay.idempotentReplay, true);
  assert.equal(replay.recommendationId, 'rec_synthetic');
  assert.equal(deps.calls.save.length, 1, 'double approval does not publish twice');
  assert.equal(admin.documents.get(`${ROOT}/sources/${stored.sourceId}`).reviewLocked, true);
  assert.ok([...admin.documents.values()].some((entry) => entry.action === 'approveSystemRecommendationCandidate' && entry.actorUid === 'admin-1'));
});

test('a failed publication releases the claim and source changes never rewrite a reviewed candidate', async () => {
  const admin = createIngestionMemoryAdmin(seed());
  const deps = makeDeps();
  const { candidates } = await collectAndProcess(admin, deps);
  const [path, initial] = candidates[0];
  const candidateId = path.split('/').at(-1);
  const auth = adminAuth();
  const edited = await service.updateSystemRecommendationCandidate({ admin, auth, deps,
    data: { candidateId, expectedRevision: initial.revision, patch: { budget: 'free' } } });
  const failingDeps = { ...deps, saveRecommendation: async () => {
    const error = new Error('destination locked');
    error.details = { reason: 'destination_reassignment_in_progress' };
    throw error;
  } };
  await assert.rejects(service.approveSystemRecommendationCandidate({ admin, auth, deps: failingDeps,
    data: { candidateId, expectedRevision: edited.revision } }));
  assert.equal(admin.documents.get(path).reviewState, 'ready');
  assert.equal(admin.documents.get(`${ROOT}/sources/${initial.sourceId}`).reviewLocked, false,
    'a failed publication does not freeze the source');

  await service.approveSystemRecommendationCandidate({ admin, auth, deps, data: { candidateId, expectedRevision: edited.revision } });
  deps.items = [providerItem({ text: `${postText}\nUpdate: now closed on Mondays.` })];
  admin.documents.set(`${ROOT}/config/main`, { ...admin.documents.get(`${ROOT}/config/main`) });
  const before = JSON.stringify(admin.documents.get(path));
  await service.startRecommendationIngestionCollection({ admin, auth, data: { groupKey: GROUP_KEY }, apifyToken: 'token', deps });
  await service.pollRecommendationIngestionRuns({ admin, apifyToken: 'token', deps });
  assert.equal(JSON.stringify(admin.documents.get(path)), before);
  assert.equal(admin.documents.get(`${ROOT}/sources/${initial.sourceId}`).changedAfterReview, true);
});

test('multi-place posts never attach every album photo to every candidate', async () => {
  const admin = createIngestionMemoryAdmin(seed());
  const twoPlaceText = 'Cafe Aurora: quiet garden, excellent cardamom buns.\nLantern Museum: small but beautifully curated.';
  const deps = makeDeps({
    predictions: [{ placeId: 'p', text: 'Cafe Aurora' }],
    extractCandidates: [
      { placeName: 'Cafe Aurora', titleSpan: 'Cafe Aurora', descriptionSpans: ['quiet garden, excellent cardamom buns.'],
        categoryId: 'food', subcategoryIds: ['cafe'], detailSpans: { phone: '', externalUrl: '', priceNote: '' },
        photoIndexes: [0], photoEvidence: 'caption' },
      { placeName: 'Lantern Museum', titleSpan: 'Lantern Museum', descriptionSpans: ['small but beautifully curated.'],
        categoryId: 'culture', subcategoryIds: ['museum'], detailSpans: { phone: '', externalUrl: '', priceNote: '' },
        photoIndexes: [], photoEvidence: '' },
    ],
  });
  deps.items = [providerItem({ text: twoPlaceText })];
  const { candidates } = await collectAndProcess(admin, deps);
  assert.equal(candidates.length, 2);
  const byTitle = Object.fromEntries(candidates.map(([, candidate]) => [candidate.content.title, candidate]));
  assert.deepEqual(byTitle['Cafe Aurora'].photoIds, [0]);
  assert.deepEqual(byTitle['Lantern Museum'].photoIds, []);
  assert.equal(byTitle['Lantern Museum'].photoMapping.mode, 'manual_required');
  assert.ok(byTitle['Lantern Museum'].readiness.missing.includes('photos'));
});

test('bulk publication is unavailable in trial and reports partial success afterwards', async () => {
  const admin = createIngestionMemoryAdmin(seed());
  const deps = makeDeps();
  const { candidates } = await collectAndProcess(admin, deps);
  const [path, initial] = candidates[0];
  const candidateId = path.split('/').at(-1);
  const auth = adminAuth();
  const edited = await service.updateSystemRecommendationCandidate({ admin, auth, deps,
    data: { candidateId, expectedRevision: initial.revision, patch: { budget: 'premium' } } });
  const items = [{ candidateId, expectedRevision: edited.revision }, { candidateId: 'cand_missing', expectedRevision: 1 }];
  await assert.rejects(service.bulkApproveSystemRecommendationCandidates({ admin, auth, deps, data: { items } }),
    (error) => error.details?.reason === 'ingestion_stage_limit');
  admin.documents.set(`${ROOT}/config/main`, { ...admin.documents.get(`${ROOT}/config/main`), rolloutStage: 'pilot' });
  const result = await service.bulkApproveSystemRecommendationCandidates({ admin, auth, deps, data: { items } });
  assert.equal(result.succeeded, 1);
  assert.equal(result.failed, 1);
  assert.equal(result.results[1].reason, 'candidate_not_found');
});

test('the rollout cannot expand until a published system recommendation is verified', async () => {
  const admin = createIngestionMemoryAdmin(seed());
  const auth = adminAuth();
  const checklist = { photos: true, title: true, description: true, location: true, budget: true, author: true };
  await assert.rejects(service.advanceRecommendationIngestionStage({ admin, auth,
    data: { targetStage: 'pilot', recommendationId: 'rec_synthetic', checklist } }),
  (error) => error.details?.reason === 'ingestion_stage_unverified');
  admin.documents.set(`${ROOT}/candidates/cand_1`, { reviewState: 'published', published: { recommendationId: 'rec_synthetic' } });
  admin.documents.set('recommendations/rec_synthetic', { status: 'active', ownerId: PUBLISHER });
  await assert.rejects(service.advanceRecommendationIngestionStage({ admin, auth,
    data: { targetStage: 'pilot', recommendationId: 'rec_synthetic', checklist: { ...checklist, author: false } } }),
  (error) => error.details?.reason === 'ingestion_stage_checklist_incomplete');
  await assert.rejects(service.advanceRecommendationIngestionStage({ admin, auth,
    data: { targetStage: 'scale', recommendationId: 'rec_synthetic', checklist } }),
  (error) => error.details?.reason === 'ingestion_stage_invalid');
  const advanced = await service.advanceRecommendationIngestionStage({ admin, auth,
    data: { targetStage: 'pilot', recommendationId: 'rec_synthetic', checklist } });
  assert.equal(advanced.rolloutStage, 'pilot');
  assert.equal(admin.documents.get(`${ROOT}/config/main`).stageVerifications.trial.verifiedBy, 'admin-1');
  const status = await service.getRecommendationIngestionStatus({ admin, auth, deps: { now: () => NOW } });
  assert.equal(status.rolloutStage, 'pilot');
  assert.equal(status.stageLimits.maxResultsLimit, 20);
});

test('rejection is revision-checked and audited', async () => {
  const admin = createIngestionMemoryAdmin(seed());
  const deps = makeDeps();
  const { candidates } = await collectAndProcess(admin, deps);
  const [path, candidate] = candidates[0];
  const candidateId = path.split('/').at(-1);
  const auth = adminAuth();
  await assert.rejects(service.rejectSystemRecommendationCandidate({ admin, auth,
    data: { candidateId, expectedRevision: candidate.revision + 1, reason: 'not useful' } }),
  (error) => error.details?.reason === 'candidate_revision_conflict');
  await service.rejectSystemRecommendationCandidate({ admin, auth,
    data: { candidateId, expectedRevision: candidate.revision, reason: 'not useful' } });
  assert.equal(admin.documents.get(path).reviewState, 'rejected');
  assert.equal([...admin.documents.keys()].some((key) => key.includes('/items/photo_')), false,
    'unused prepared photos lose cleanup protection once every candidate is terminal');
  const list = await service.listSystemRecommendationCandidates({ admin, auth, data: { reviewState: 'rejected' } });
  assert.equal(list.items.length, 1);
});

test('retryable processing failures are requeued with a fresh task until the attempt limit', async () => {
  const admin = createIngestionMemoryAdmin(seed());
  const deps = makeDeps();
  deps.extract = async () => {
    const error = new Error('provider down');
    error.code = 'unavailable';
    error.details = { reason: 'extraction_incomplete' };
    throw error;
  };
  const { tasks } = await collectAndProcess(admin, deps).catch(() => ({ tasks: [] }));
  const sourceKey = [...admin.documents.keys()].find((key) => /sources\/src_[a-f0-9]+$/.test(key));
  assert.equal(admin.documents.get(sourceKey).processing.state, 'failed');
  const later = { ...deps, now: () => new Date(NOW.getTime() + 20 * 60 * 1000) };
  const result = await service.pollRecommendationIngestionRuns({ admin, apifyToken: '', deps: later });
  assert.equal(result.requeued, 1);
  const allTasks = [...admin.documents.keys()].filter((key) => key.startsWith(`${ROOT}/tasks/`));
  assert.equal(allTasks.length, (tasks.length || 1) + 1, 'the retry creates a new task document');
});

test('a worker that lost its lease never overwrites the new owner', async () => {
  const admin = createIngestionMemoryAdmin(seed());
  const deps = makeDeps();
  await service.startRecommendationIngestionCollection({ admin, auth: adminAuth(), data: { groupKey: GROUP_KEY }, apifyToken: 'token', deps });
  await service.pollRecommendationIngestionRuns({ admin, apifyToken: 'token', deps });
  const sourceKey = [...admin.documents.keys()].find((key) => /sources\/src_[a-f0-9]+$/.test(key));
  const sourceId = sourceKey.split('/').at(-1);
  deps.extract = async () => {
    // Another worker takes over while this one is still running.
    const current = admin.documents.get(sourceKey);
    admin.documents.set(sourceKey, { ...current, processing: { ...current.processing, leaseId: 'other-worker' } });
    return { model: 'claude-haiku-4-5', usage: {}, candidates: [{
      placeName: 'Cafe Aurora', titleSpan: 'Cafe Aurora', descriptionSpans: ['quiet garden, excellent cardamom buns and friendly staff.'],
      categoryId: 'food', subcategoryIds: ['cafe'], detailSpans: { phone: '', externalUrl: '', priceNote: '' }, photoIndexes: [], photoEvidence: '',
    }] };
  };
  const result = await service.processIngestionSource({ admin, sourceId, deps });
  assert.deepEqual(result, { failed: 'ingestion_lease_lost' });
  assert.equal(admin.documents.get(sourceKey).processing.leaseId, 'other-worker');
  assert.equal(admin.documents.get(sourceKey).processing.state, 'processing');
});

test('a changed source image is prepared again instead of reusing the old photo', async () => {
  const admin = createIngestionMemoryAdmin(seed());
  const deps = makeDeps();
  const { candidates } = await collectAndProcess(admin, deps);
  const sourceId = candidates[0][1].sourceId;
  const sourceKey = `${ROOT}/sources/${sourceId}`;
  const before = admin.documents.get(`${sourceKey}/items/photo_0`).asset.assetId;
  const current = admin.documents.get(sourceKey);
  admin.documents.set(sourceKey, {
    ...current,
    images: [{ ...current.images[0], providerMediaId: 'replaced', url: 'https://scontent.xx.fbcdn.net/v/new.jpg' }, current.images[1]],
    contentHash: 'changed', processing: { state: 'pending', attempts: 0 },
  });
  for (const [path, candidate] of candidates) admin.documents.set(path, { ...candidate, reviewedBy: undefined });
  await service.processIngestionSource({ admin, sourceId, deps });
  assert.notEqual(admin.documents.get(`${sourceKey}/items/photo_0`).asset.assetId, before);
  assert.equal(deps.calls.download, 3, 'only the replaced image is downloaded again');
});
