const crypto = require('node:crypto');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  APPLE_REVOKE_URL,
  APPLE_TOKEN_URL,
  createAppleClientSecret,
  revokeAppleAuthorization,
} = require('./appleAuthService');

function createConfig() {
  const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  return {
    teamId: 'TEAM123',
    keyId: 'KEY123',
    clientId: 'com.planli.planlitravels',
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  };
}

function identityToken(claims) {
  return [
    Buffer.from(JSON.stringify({ alg: 'ES256' })).toString('base64url'),
    Buffer.from(JSON.stringify(claims)).toString('base64url'),
    'signature',
  ].join('.');
}

function response(body, { ok = true } = {}) {
  return { ok, text: async () => body ? JSON.stringify(body) : '' };
}

test('Apple client secret contains the expected short-lived claims', () => {
  const secret = createAppleClientSecret(createConfig(), 1000);
  const [header, payload, signature] = secret.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(header, 'base64url')), { alg: 'ES256', kid: 'KEY123' });
  assert.deepEqual(JSON.parse(Buffer.from(payload, 'base64url')), {
    iss: 'TEAM123',
    iat: 1000,
    exp: 1300,
    aud: 'https://appleid.apple.com',
    sub: 'com.planli.planlitravels',
  });
  assert.ok(signature);
});

test('Apple authorization is exchanged, matched to the Firebase provider, and revoked', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, params: new URLSearchParams(options.body) });
    if (url === APPLE_TOKEN_URL) {
      return response({
        id_token: identityToken({
          iss: 'https://appleid.apple.com',
          aud: 'com.planli.planlitravels',
          sub: 'apple-user-1',
          exp: 2000,
        }),
        refresh_token: 'refresh-token',
        access_token: 'access-token',
      });
    }
    return response(null);
  };

  const result = await revokeAppleAuthorization({
    authorizationCode: 'fresh-code',
    expectedSubject: 'apple-user-1',
    config: createConfig(),
    fetchImpl,
    nowSeconds: 1000,
  });

  assert.deepEqual(result, { revoked: true });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, APPLE_TOKEN_URL);
  assert.equal(calls[0].params.get('code'), 'fresh-code');
  assert.equal(calls[1].url, APPLE_REVOKE_URL);
  assert.equal(calls[1].params.get('token'), 'refresh-token');
  assert.equal(calls[1].params.get('token_type_hint'), 'refresh_token');
});

test('Apple authorization for a different provider subject is rejected before revocation', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return response({
      id_token: identityToken({
        iss: 'https://appleid.apple.com',
        aud: 'com.planli.planlitravels',
        sub: 'different-user',
        exp: 2000,
      }),
      refresh_token: 'refresh-token',
    });
  };

  await assert.rejects(
    revokeAppleAuthorization({
      authorizationCode: 'fresh-code',
      expectedSubject: 'apple-user-1',
      config: createConfig(),
      fetchImpl,
      nowSeconds: 1000,
    }),
    (error) => error.code === 'permission-denied'
  );
  assert.deepEqual(calls, [APPLE_TOKEN_URL]);
});

test('Apple deletion requires a fresh code and complete secret configuration', async () => {
  await assert.rejects(
    revokeAppleAuthorization({
      authorizationCode: '',
      expectedSubject: 'apple-user-1',
      config: createConfig(),
    }),
    (error) => error.code === 'invalid-argument'
  );
  await assert.rejects(
    revokeAppleAuthorization({
      authorizationCode: 'fresh-code',
      expectedSubject: 'apple-user-1',
      config: { teamId: '', keyId: '', clientId: '', privateKey: '' },
    }),
    (error) => error.code === 'failed-precondition'
  );
});
