const test = require('node:test');
const assert = require('node:assert/strict');

const { bucketDocumentId, normalizedIp, principal } = require('./publicRateLimitService');

test('anonymous identity ignores raw App Check headers', () => {
  const request = {
    rawRequest: {
      ip: '203.0.113.42',
      headers: { 'x-firebase-appcheck': 'attacker-controlled-token' },
    },
  };
  const changedHeader = {
    rawRequest: {
      ip: '203.0.113.42',
      headers: { 'x-firebase-appcheck': 'a-new-bucket-attempt' },
    },
  };
  assert.equal(
    principal({ request, key: 'test-key' }),
    principal({ request: changedHeader, key: 'test-key' })
  );
});

test('anonymous identity ignores client-forwarded network headers', () => {
  const first = { rawRequest: { headers: { 'x-forwarded-for': '203.0.113.10' } } };
  const second = { rawRequest: { headers: { 'x-forwarded-for': '198.51.100.20' } } };
  assert.equal(
    principal({ request: first, key: 'test-key' }),
    principal({ request: second, key: 'test-key' })
  );
});

test('verified App Check context and network principal form anonymous identity', () => {
  const base = { rawRequest: { ip: '203.0.113.42', headers: {} } };
  const first = principal({ request: { ...base, app: { appId: 'app-one' } }, key: 'test-key' });
  const second = principal({ request: { ...base, app: { appId: 'app-two' } }, key: 'test-key' });
  assert.notEqual(first, second);
  assert.equal(normalizedIp(base), '203.0.113');
});

test('authenticated identity is UID-bound', () => {
  const first = principal({ auth: { uid: 'user-one' }, request: {}, key: 'test-key' });
  const second = principal({ auth: { uid: 'user-two' }, request: {}, key: 'test-key' });
  assert.equal(first, 'u_user-one');
  assert.notEqual(first, second);
});

test('all public actions share one bucket per principal', () => {
  const identity = { auth: { uid: 'user-one' }, request: {}, key: 'test-key' };
  assert.equal(bucketDocumentId(identity), 'u_user-one');
  assert.equal(bucketDocumentId(identity), bucketDocumentId(identity));
});
