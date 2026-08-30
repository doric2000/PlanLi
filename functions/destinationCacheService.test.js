const test = require('node:test');
const assert = require('node:assert/strict');

const { hasUsableDestinationCache } = require('./destinationCacheService');

test('legacy destinations remain readable without Google cache metadata', () => {
  assert.equal(hasUsableDestinationCache({ schemaVersion: 2 }), true);
});

test('v3 destinations remain usable after the historical Google cache expiry', () => {
  assert.equal(hasUsableDestinationCache({
    schemaVersion: 3,
    googleCache: {
      names: { he: 'פריז', en: 'Paris' },
      expiresAt: new Date('2020-01-01T00:00:00.000Z'),
    },
  }), true);
});

test('v3 destinations still require complete bilingual display names', () => {
  assert.equal(hasUsableDestinationCache({
    schemaVersion: 3,
    googleCache: { names: { he: 'פריז' } },
  }), false);
  assert.equal(hasUsableDestinationCache({
    schemaVersion: 3,
    googleCache: { names: { he: 'Vlore', en: 'Vlorë' } },
  }), false);
});
