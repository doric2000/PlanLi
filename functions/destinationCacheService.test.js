const test = require('node:test');
const assert = require('node:assert/strict');

const { cachedProviderLoad, hasUsableDestinationCache, millis } = require('./destinationCacheService');

test('v3 destinations require complete bilingual Google data before expiry', () => {
  const now = Date.parse('2026-08-12T00:00:00Z');
  assert.equal(hasUsableDestinationCache({
    schemaVersion: 3,
    googleCache: {
      names: { he: 'פריז', en: 'Paris' },
      expiresAt: new Date(now + 1),
    },
  }, now), true);
  assert.equal(hasUsableDestinationCache({
    schemaVersion: 3,
    googleCache: { names: { he: 'פריז' }, expiresAt: new Date(now + 1) },
  }, now), false);
  assert.equal(hasUsableDestinationCache({
    schemaVersion: 3,
    googleCache: {
      names: { he: 'פריז', en: 'Paris' },
      expiresAt: new Date(now),
    },
  }, now), false);
});

test('cache timestamp conversion supports Firestore timestamps and dates', () => {
  assert.equal(millis({ toMillis: () => 123 }), 123);
  assert.equal(millis({ toDate: () => new Date(456) }), 456);
  assert.equal(millis(new Date(789)), 789);
});

test('one refresh run deduplicates provider work by Google Place ID', async () => {
  const cache = new Map();
  let calls = 0;
  const loader = async () => {
    calls += 1;
    return { placeId: 'shared-place' };
  };

  const [first, second] = await Promise.all([
    cachedProviderLoad(cache, 'shared-place', loader),
    cachedProviderLoad(cache, 'shared-place', loader),
  ]);

  assert.equal(calls, 1);
  assert.equal(first, second);
});
