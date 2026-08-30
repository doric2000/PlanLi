const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_MEDIA_BUCKET,
  gcloudAccessToken,
  googleAuthOptions,
  initializeAdmin,
} = require('./localCredentials');

test('local maintenance uses ADC directly without copying Firebase refresh tokens', () => {
  let configuration;
  const applicationDefaultCredential = {
    getAccessToken: async () => ({ access_token: 'adc-token', expires_in: 3000 }),
  };
  const admin = {
    apps: [],
    credential: { applicationDefault: () => applicationDefaultCredential },
    initializeApp: (value) => {
      configuration = value;
      return { name: 'app' };
    },
  };

  assert.deepEqual(initializeAdmin(admin), { name: 'app' });
  assert.deepEqual(configuration, {
    projectId: 'planli-f0b12',
    storageBucket: DEFAULT_MEDIA_BUCKET,
    credential: applicationDefaultCredential,
  });
  assert.equal(JSON.stringify(configuration).includes('refresh_token'), false);
  assert.deepEqual(googleAuthOptions(), { projectId: 'planli-f0b12' });
});

test('gcloud token provider validates output and never exposes stderr', () => {
  const runner = () => ({ status: 0, stdout: `${'t'.repeat(80)}\n`, stderr: 'ignored' });
  assert.deepEqual(gcloudAccessToken({ runner }), {
    access_token: 't'.repeat(80), expires_in: 3000,
  });
  assert.throws(() => gcloudAccessToken({
    runner: () => ({ status: 1, stdout: '', stderr: 'sensitive diagnostic' }),
  }), /fallback failed/);
});

test('local maintenance permits explicit project, bucket and pre-initialized app selection', () => {
  const existing = { name: 'existing' };
  const admin = { apps: [existing], app: () => existing };
  assert.equal(initializeAdmin(admin, {
    projectId: 'planli-staging',
    storageBucket: 'planli-staging-media',
  }), existing);
  assert.deepEqual(googleAuthOptions({ projectId: 'planli-staging' }), {
    projectId: 'planli-staging',
  });
});
