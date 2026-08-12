const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildUnsplashDestinationImage,
  destinationQuery,
  searchUnsplash,
  selectMostPopularRecommendationImage,
} = require('./destinationImageService');

test('image query prefers cached English Google data without a further Google request', () => {
  assert.equal(destinationQuery({
    googleCache: { names: { he: 'פריז', en: 'Paris' }, countryCode: 'FR' },
  }, { code: 'FR', name: 'צרפת' }), 'Paris France');
});

function asset(id) {
  return {
    assetId: id,
    large: { url: `https://cdn.planli.test/${id}/large.jpg`, width: 1600, height: 900 },
    feed: { url: `https://cdn.planli.test/${id}/feed.jpg` },
    thumb: { url: `https://cdn.planli.test/${id}/thumb.jpg` },
    placeholder: { color: '#123456' },
  };
}

test('Unsplash selection preserves ixid and required attribution links', () => {
  const image = buildUnsplashDestinationImage({
    id: 'photo-1',
    width: 2400,
    height: 1600,
    color: '#abcdef',
    blur_hash: 'blur',
    urls: { raw: 'https://images.unsplash.com/photo-1?ixid=important' },
    links: { html: 'https://unsplash.com/photos/photo-1' },
    user: { name: 'Traveler', links: { html: 'https://unsplash.com/@traveler' } },
  }, 'Paris France');
  assert.equal(image.source.type, 'unsplash');
  assert.match(image.urls.large, /ixid=important/);
  assert.match(image.urls.large, /w=1600/);
  assert.match(image.attribution.photographerProfileUrl, /utm_source=planli/);
  assert.match(image.attribution.photoUrl, /utm_medium=referral/);
});

test('recommendation fallback skips inactive and missing media, then applies stable ranking', () => {
  const image = selectMostPopularRecommendationImage([
    { id: 'a', data: { status: 'active', stats: { likeCount: 100 }, createdAt: '2026-01-01' } },
    { id: 'b', data: { status: 'inactive', stats: { likeCount: 200 }, media: [asset('b')] } },
    { id: 'd', data: { status: 'active', stats: { likeCount: 10 }, createdAt: '2026-02-01', media: [asset('d')] } },
    { id: 'c', data: { status: 'active', stats: { likeCount: 10 }, createdAt: '2026-02-01', media: [asset('c')] } },
  ]);
  assert.equal(image.source.recommendationId, 'c');
  assert.equal(image.source.assetId, 'c');
});

test('Unsplash search uses the exact relevance and safety parameters', async () => {
  let requestedUrl;
  const result = await searchUnsplash({
    query: 'Paris France',
    accessKey: 'key',
    fetchImpl: async (url) => {
      requestedUrl = new URL(url);
      return {
        ok: true,
        headers: { get: () => '49' },
        json: async () => ({ results: [] }),
      };
    },
  });
  assert.equal(requestedUrl.searchParams.get('query'), 'Paris France');
  assert.equal(requestedUrl.searchParams.get('order_by'), 'relevant');
  assert.equal(requestedUrl.searchParams.get('orientation'), 'landscape');
  assert.equal(requestedUrl.searchParams.get('content_filter'), 'high');
  assert.equal(requestedUrl.searchParams.get('per_page'), '1');
  assert.equal(result.image, null);
});
