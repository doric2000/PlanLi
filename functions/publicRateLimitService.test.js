const test = require('node:test');
const assert = require('node:assert/strict');

const {
  SESSION_TTL_MS,
  consumePublicReadBudget,
  createGuestSessionToken,
  issueGuestSession,
  normalizedNetworkAddress,
  parseAndVerifyGuestSessionToken,
  withoutPublicSecurityEnvelope,
} = require('./publicRateLimitService');

const KEY = 'test-key-that-is-long-enough-for-hmac-security';

function snapshot(data) {
  return { exists: data != null, data: () => data };
}

function firestoreHarness(initial = {}) {
  const documents = new Map(Object.entries(initial));
  const admin = {
    firestore() {
      return {
        doc(path) { return { path }; },
        async runTransaction(callback) {
          const pending = [];
          const transaction = {
            async get(ref) { return snapshot(documents.get(ref.path)); },
            set(ref, data) { pending.push(['set', ref.path, data]); },
            create(ref, data) {
              if (documents.has(ref.path)) throw Object.assign(new Error('already exists'), { code: 6 });
              pending.push(['create', ref.path, data]);
            },
          };
          const result = await callback(transaction);
          for (const [, path, data] of pending) documents.set(path, data);
          return result;
        },
      };
    },
  };
  admin.firestore.FieldValue = { serverTimestamp: () => 'server-time' };
  return { admin, documents };
}

function requestFor(appId, data = {}) {
  return {
    app: { appId },
    data,
    rawRequest: {
      ip: '198.51.100.77',
      headers: { 'x-forwarded-for': '203.0.113.42' },
      socket: { remoteAddress: '10.20.30.40' },
    },
  };
}

test('guest token is signed for one App ID and contains no network or user data', () => {
  const token = createGuestSessionToken({
    appId: 'app-one',
    key: KEY,
    randomBytes: () => Buffer.alloc(24, 7),
  });
  const parsed = parseAndVerifyGuestSessionToken({ token, appId: 'app-one', key: KEY });
  assert.match(parsed.documentId, /^g_[A-Za-z0-9_-]{43}$/);
  assert.doesNotMatch(token, /10\.20|198\.51|203\.0|user/i);
  assert.throws(
    () => parseAndVerifyGuestSessionToken({ token, appId: 'app-two', key: KEY }),
    (error) => error.details?.reason === 'GUEST_SESSION_INVALID'
  );
});

test('guest session issuance requires fresh App Check and enforces an exact empty input', async () => {
  const { admin } = firestoreHarness();
  await assert.rejects(
    issueGuestSession({ admin, request: { data: {} }, key: KEY }),
    (error) => error.details?.reason === 'APP_CHECK_REQUIRED'
  );
  await assert.rejects(
    issueGuestSession({ admin, request: { app: { appId: 'app-one', alreadyConsumed: true }, data: {} }, key: KEY }),
    (error) => error.details?.reason === 'APP_CHECK_REPLAYED'
  );
  await assert.rejects(
    issueGuestSession({ admin, request: requestFor('app-one', { unexpected: true }), key: KEY }),
    (error) => error.details?.reason === 'INVALID_GUEST_SESSION_REQUEST'
  );
});

test('issued sessions are opaque, App-ID-bound and expire after 24 hours', async () => {
  const { admin, documents } = firestoreHarness();
  const now = Date.UTC(2026, 7, 28, 12);
  const result = await issueGuestSession({
    admin,
    request: requestFor('app-one'),
    key: KEY,
    now,
    randomBytes: () => Buffer.alloc(24, 9),
  });
  assert.equal(Date.parse(result.expiresAt), now + SESSION_TTL_MS);
  const parsed = parseAndVerifyGuestSessionToken({ token: result.guestSessionToken, appId: 'app-one', key: KEY });
  const stored = documents.get(`system/runtime/guestSessions/${parsed.documentId}`);
  assert.equal(stored.appId, 'app-one');
  assert.equal(stored.tokenDigest, parsed.tokenDigest);
  assert.equal(stored.expiresAtMs, now + SESSION_TTL_MS);
});

test('forwarded headers never affect network telemetry identity', () => {
  const first = requestFor('app-one');
  const second = requestFor('app-one');
  second.rawRequest.headers['x-forwarded-for'] = '192.0.2.44';
  second.rawRequest.ip = '192.0.2.99';
  assert.equal(normalizedNetworkAddress(first), normalizedNetworkAddress(second));
  assert.equal(normalizedNetworkAddress(first), '10.20.30');
});

test('authenticated public reads are UID-bound and do not require a guest envelope', async () => {
  const { admin, documents } = firestoreHarness();
  const result = await consumePublicReadBudget({
    admin,
    auth: { uid: 'user-one' },
    request: { data: { sort: 'popular' } },
    action: 'discovery',
    key: KEY,
    now: 1000,
  });
  assert.equal(result.principalId, 'u_user-one');
  assert.deepEqual(result.data, { sort: 'popular' });
  assert.equal(documents.get('system/runtime/publicRateLimits/u_user-one').used, 3);
});

test('anonymous public reads require the issued token, matching App ID, expiry and a fresh nonce', async () => {
  const { admin } = firestoreHarness();
  const now = 10_000;
  const issued = await issueGuestSession({ admin, request: requestFor('app-one'), key: KEY, now });
  const request = requestFor('app-one', {
    sort: 'popular',
    _security: { guestSessionToken: issued.guestSessionToken, nonce: 'abcdefghijklmnopqrstuv' },
  });
  const result = await consumePublicReadBudget({ admin, request, action: 'discovery', key: KEY, now: now + 1 });
  assert.deepEqual(result.data, { sort: 'popular' });
  await assert.rejects(
    consumePublicReadBudget({ admin, request, action: 'discovery', key: KEY, now: now + 2 }),
    (error) => error.details?.reason === 'GUEST_SESSION_REPLAY'
  );
  await assert.rejects(
    consumePublicReadBudget({
      admin,
      request: requestFor('app-two', {
        _security: { guestSessionToken: issued.guestSessionToken, nonce: 'abcdefghijklmnopqrstuw' },
      }),
      action: 'discovery',
      key: KEY,
      now: now + 2,
    }),
    (error) => error.details?.reason === 'GUEST_SESSION_INVALID'
  );
  await assert.rejects(
    consumePublicReadBudget({
      admin,
      request: requestFor('app-one', {
        _security: { guestSessionToken: issued.guestSessionToken, nonce: 'abcdefghijklmnopqrstux' },
      }),
      action: 'discovery',
      key: KEY,
      now: now + SESSION_TTL_MS,
    }),
    (error) => error.details?.reason === 'GUEST_SESSION_EXPIRED'
  );
});

test('security envelope rejects prototype fields and is removed before business validation', async () => {
  assert.deepEqual(withoutPublicSecurityEnvelope({ query: 'ירושלים', _security: { token: 'secret' } }), { query: 'ירושלים' });
  const token = createGuestSessionToken({ appId: 'app-one', key: KEY });
  const data = JSON.parse(`{"_security":{"guestSessionToken":"${token}","nonce":"abcdefghijklmnopqrstuv","__proto__":{}}}`);
  const { admin } = firestoreHarness();
  await assert.rejects(
    consumePublicReadBudget({ admin, request: requestFor('app-one', data), action: 'discovery', key: KEY }),
    (error) => error.details?.reason === 'INVALID_SECURITY_ENVELOPE'
  );
});
