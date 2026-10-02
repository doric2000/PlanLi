const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ROLLOUT_STAGES,
  buildPublishData,
  collectionBudgetCheck,
  computeReadiness,
  deterministicPublishRequestId,
  evaluateSource,
  groupKeyFor,
  normalizeApifyItem,
  parseFacebookGroupUrl,
  spanIsInSource,
} = require('./recommendationIngestionPolicy');
const { normalizePublishRequestId } = require('./recommendationService');

const NOW = new Date('2026-10-01T10:00:00Z');
const daysAgo = (days) => new Date(NOW.getTime() - days * 86_400_000).toISOString();
const syntheticItem = (overrides = {}) => ({
  postId: 'post-1',
  url: 'https://www.facebook.com/groups/123/posts/1/',
  time: daysAgo(10),
  text: 'Synthetic Cafe Aurora is a quiet place with great pastries near the old square. Highly recommended!',
  reactionLikeCount: 64,
  likesCount: 140,
  attachments: [
    { __typename: 'Photo', id: 'm1', photo_image: { uri: 'https://scontent.xx.fbcdn.net/v/a.jpg', width: 1200, height: 900 }, ocrText: '' },
    { __typename: 'Video', id: 'v1', thumbnail: 'https://scontent.xx.fbcdn.net/v/video.jpg' },
  ],
  ...overrides,
});

test('normalization uses actual Like reactions and never total reactions', () => {
  const source = normalizeApifyItem(syntheticItem(), { groupKey: 'g1' });
  assert.equal(source.actualLikes, 64);
  assert.equal(source.totalReactions, 140);
  assert.equal(source.images.length, 1, 'videos are not source photos');
  assert.match(source.sourceId, /^src_[a-f0-9]{32}$/);

  const withoutLikes = normalizeApifyItem(syntheticItem({ reactionLikeCount: undefined, likesCount: 900 }), { groupKey: 'g1' });
  assert.equal(withoutLikes.actualLikes, null);
  assert.deepEqual(evaluateSource(withoutLikes, { now: NOW, metric: 'actual_likes' }), {
    status: 'likes_unverifiable', reason: 'actual_likes_missing',
  });
});

test('filtering rejects stale, short, and under-threshold posts before any model call', () => {
  const evaluate = (overrides) => evaluateSource(normalizeApifyItem(syntheticItem(overrides), { groupKey: 'g' }),
    { now: NOW, metric: 'actual_likes' }).status;
  assert.equal(evaluate({}), 'eligible');
  assert.equal(evaluate({ reactionLikeCount: 50 }), 'eligible');
  assert.equal(evaluate({ reactionLikeCount: 49 }), 'below_threshold');
  assert.equal(evaluate({ time: daysAgo(200) }), 'stale');
  assert.equal(evaluate({ time: undefined }), 'stale');
  assert.equal(evaluate({ text: 'short' }), 'no_text');
  const watched = evaluateSource(normalizeApifyItem(syntheticItem({ reactionLikeCount: 40 }), { groupKey: 'g' }),
    { now: NOW, metric: 'actual_likes' });
  assert.equal(watched.watch, true);
});

test('source identity is stable and content changes alter only the content hash', () => {
  const first = normalizeApifyItem(syntheticItem(), { groupKey: 'g1' });
  const edited = normalizeApifyItem(syntheticItem({ text: `${syntheticItem().text} Edited.` }), { groupKey: 'g1' });
  assert.equal(first.sourceId, edited.sourceId);
  assert.notEqual(first.contentHash, edited.contentHash);
  assert.notEqual(normalizeApifyItem(syntheticItem(), { groupKey: 'g2' }).sourceId, first.sourceId);
});

test('group URLs are validated and keyed deterministically', () => {
  assert.equal(parseFacebookGroupUrl('https://www.facebook.com/groups/WarszawaVacation/').slug, 'WarszawaVacation');
  assert.equal(groupKeyFor('https://facebook.com/groups/123456/'), groupKeyFor('https://www.facebook.com/groups/123456'));
  for (const bad of ['http://www.facebook.com/groups/1/', 'https://evil.example/groups/1/', 'https://www.facebook.com/pages/1/']) {
    assert.throws(() => parseFacebookGroupUrl(bad), (error) => error.details?.reason === 'ingestion_group_invalid');
  }
});

test('publish request IDs are deterministic and accepted by canonical publication', () => {
  const id = deterministicPublishRequestId('cand_abc');
  assert.equal(id, deterministicPublishRequestId('cand_abc'));
  assert.notEqual(id, deterministicPublishRequestId('cand_abd'));
  assert.equal(normalizePublishRequestId(id), id);
});

test('exact-span validation tolerates whitespace only', () => {
  const source = 'Line one.\n\nGreat   coffee here.';
  assert.equal(spanIsInSource('Great coffee here.', source), true);
  assert.equal(spanIsInSource('Great coffee here. Open daily.', source), false);
  assert.equal(spanIsInSource('', source), false);
});

test('collection budget reservations cover spent and in-flight runs', () => {
  const ledger = { spentUsd: 9.6, reservedUsd: 0.25, collectedPosts: 900, reservedPosts: 20 };
  assert.equal(collectionBudgetCheck(ledger, { reserveUsd: 0.25, reservePosts: 20, capUsd: 10, capPosts: 1000 }).allowed, false);
  assert.equal(collectionBudgetCheck(ledger, { reserveUsd: 0.15, reservePosts: 20, capUsd: 10, capPosts: 1000 }).allowed, true);
  assert.equal(collectionBudgetCheck(ledger, { reserveUsd: 0.1, reservePosts: 81, capUsd: 10, capPosts: 1000 }).allowed, false);
  assert.equal(ROLLOUT_STAGES.trial.bulk, false);
  assert.equal(ROLLOUT_STAGES.trial.maxResultsLimit, 10);
  assert.equal(ROLLOUT_STAGES.trial.maxEnabledGroups, 1);
});

function readyCandidate(overrides = {}) {
  return {
    candidateId: 'cand_1',
    publishRequestId: deterministicPublishRequestId('cand_1'),
    content: {
      title: 'Cafe Aurora',
      description: 'Synthetic Cafe Aurora is a quiet place with great pastries near the old square.',
      categoryId: 'food',
      subcategoryIds: ['cafe'],
      customSubcategoryLabel: '',
      budget: 'economy',
      details: { priceNote: '' },
      needs: [],
      practicalFacts: [],
    },
    fidelity: { descriptionVerified: true, editedByReviewer: false },
    location: { status: 'resolved', placeId: 'place-1' },
    destinationRef: { countryId: 'CZ', cityId: 'prague' },
    photoIds: [0],
    issues: [],
    ...overrides,
  };
}
const pool = [{ index: 0, state: 'prepared', asset: { assetId: 'a1' } }, { index: 1, state: 'failed' }];
const eligibleSource = { actualLikes: 64, filter: { status: 'eligible' } };

test('readiness requires every canonical field, a prepared photo, and an exact location', () => {
  assert.deepEqual(computeReadiness(readyCandidate(), { photoPool: pool, source: eligibleSource }), { ready: true, missing: [] });
  const missing = (overrides, extra = {}) => computeReadiness(readyCandidate(overrides),
    { photoPool: pool, source: eligibleSource, destinationNames: ['Prague', 'פראג'], ...extra }).missing;
  assert.ok(missing({ content: { ...readyCandidate().content, budget: '' } }).includes('budget'));
  assert.ok(missing({ content: { ...readyCandidate().content, title: 'Prague' } }).includes('title_generic'));
  assert.ok(missing({ content: { ...readyCandidate().content, description: '' } }).includes('description'));
  assert.ok(missing({ fidelity: { descriptionVerified: false } }).includes('description_unverified'));
  assert.ok(missing({ location: { status: 'ambiguous', placeId: '' } }).includes('location'));
  assert.ok(missing({ photoIds: [] }).includes('photos'));
  assert.ok(missing({ photoIds: [1] }).includes('photos'), 'a failed download is not a photo');
  assert.ok(missing({ content: { ...readyCandidate().content, subcategoryIds: ['museum'] } }).includes('subcategories'));
  assert.ok(missing({}, { source: { actualLikes: 49, filter: { status: 'eligible' } } }).includes('source_likes'));
  assert.ok(missing({ issues: [{ code: 'x', severity: 'blocking' }] }).includes('blocking_issue'));
});

test('publish data contains only canonical fields and the selected photos in order', () => {
  const data = buildPublishData(readyCandidate({ photoIds: [0] }), pool);
  assert.deepEqual(Object.keys(data).sort(), ['destinationRef', 'locationMode', 'placeId', 'publishRequestId', 'recommendation']);
  assert.equal(data.locationMode, 'exact');
  assert.deepEqual(data.recommendation.media, [{ assetId: 'a1' }]);
  assert.deepEqual(data.recommendation.details, {});
  const serialized = JSON.stringify(data);
  for (const privateField of ['facebook', 'actualLikes', 'sourceId', 'evidence', 'fbcdn']) {
    assert.equal(serialized.includes(privateField), false, `${privateField} must stay private`);
  }
});

test('provider output shape: posts keep distinct identities and zero reactions are a verified zero', () => {
  // Real actor output: facebookId is the group's ID, legacyId is the post's ID.
  const base = { facebookId: '1864457083986225', url: 'https://www.facebook.com/groups/1864457083986225/permalink/1/' };
  const first = normalizeApifyItem(syntheticItem({ ...base, postId: undefined, legacyId: '2681420632289862', id: 'UzpfSTE' }), { groupKey: 'g' });
  const second = normalizeApifyItem(syntheticItem({ ...base, postId: undefined, legacyId: '2681407385624520', id: 'UzpfSTF' }), { groupKey: 'g' });
  assert.notEqual(first.sourceId, second.sourceId);
  assert.equal(first.providerPostId, '2681420632289862');

  const noReactions = normalizeApifyItem(syntheticItem({ postId: 'p0', reactionLikeCount: undefined, likesCount: 0 }), { groupKey: 'g' });
  assert.equal(noReactions.actualLikes, 0);
  assert.equal(evaluateSource(noReactions, { now: NOW, metric: 'actual_likes' }).status, 'below_threshold');
  const reactionsWithoutBreakdown = normalizeApifyItem(syntheticItem({ postId: 'p1', reactionLikeCount: undefined, likesCount: 80 }), { groupKey: 'g' });
  assert.equal(reactionsWithoutBreakdown.actualLikes, null, 'total reactions never stand in for Likes');
});

test('crowdpull output normalizes and qualifies by total reactions only when that metric is chosen', () => {
  const item = { postId: 'p9', postUrl: 'https://www.facebook.com/groups/1/posts/9/', postText: syntheticItem().text,
    timestamp: daysAgo(5), reactionCount: 70, imageUrls: ['https://scontent.xx.fbcdn.net/v/x.jpg'] };
  const source = normalizeApifyItem(item, { groupKey: 'g' });
  assert.equal(source.totalReactions, 70);
  assert.equal(source.actualLikes, null);
  assert.equal(source.images.length, 1);
  assert.equal(evaluateSource(source, { now: NOW, metric: 'total_reactions' }).status, 'eligible');
  assert.equal(evaluateSource(source, { now: NOW, metric: 'actual_likes' }).status, 'likes_unverifiable');
  assert.equal(evaluateSource({ ...source, totalReactions: 49 }, { now: NOW, metric: 'total_reactions' }).status, 'below_threshold');
});
