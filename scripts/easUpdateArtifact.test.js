const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const {
  REQUIRED_PRODUCTION_MARKERS,
  parseMultipartJsonPart,
  validateProductionBundle,
  verifyProductionUpdateArtifact,
} = require('./easUpdateArtifact');

const groupId = '11111111-2222-4333-8444-555555555555';
const updateId = '01a05f00-0000-7000-8000-000000000000';

function productionBundle(extra = '') {
  return Buffer.from([
    ...REQUIRED_PRODUCTION_MARKERS,
    ['AI', 'za', 'S'.repeat(35)].join(''),
    extra,
  ].join('|'));
}

function multipart(manifest, extensions) {
  return [
    '--boundary',
    'Content-Disposition: form-data; name="manifest"',
    'Content-Type: application/json',
    '',
    JSON.stringify(manifest),
    '--boundary',
    'Content-Disposition: form-data; name="extensions"',
    'Content-Type: application/json',
    '',
    JSON.stringify(extensions),
    '--boundary--',
  ].join('\r\n');
}

test('rejects dummy or incomplete Firebase bundles and accepts production markers', () => {
  assert.throws(() => validateProductionBundle(productionBundle('planli-dummy.firebaseapp.com')), /placeholders/);
  assert.throws(
    () => validateProductionBundle(Buffer.from(['AI', 'za', 'S'.repeat(35)].join(''))),
    /missing production markers/
  );
  const result = validateProductionBundle(productionBundle());
  assert.equal(result.bytes, productionBundle().length);
  assert.match(result.sha256, /^[0-9A-F]{64}$/u);
});

test('parses named JSON parts from an Expo multipart manifest', () => {
  const source = multipart({ id: updateId }, { assetRequestHeaders: {} });
  assert.deepEqual(parseMultipartJsonPart(source, 'manifest'), { id: updateId });
  assert.deepEqual(parseMultipartJsonPart(source, 'extensions'), { assetRequestHeaders: {} });
});

test('downloads, hashes, and validates the immutable iOS launch asset', async () => {
  const bundle = productionBundle();
  const launchHash = crypto.createHash('sha256').update(bundle).digest('base64url');
  const manifest = {
    id: updateId,
    runtimeVersion: '1.2.0',
    metadata: { updateGroup: groupId },
    launchAsset: {
      hash: launchHash,
      key: 'launch-key',
      url: 'https://assets.example/launch',
    },
  };
  const extensions = {
    assetRequestHeaders: { 'launch-key': { authorization: 'redacted-test-header' } },
  };
  const responses = [
    { ok: true, text: async () => multipart(manifest, extensions) },
    { ok: true, arrayBuffer: async () => bundle },
  ];
  const fetchImpl = async () => responses.shift();
  const result = await verifyProductionUpdateArtifact([{
    id: updateId,
    group: groupId,
    platform: 'ios',
    runtimeVersion: '1.2.0',
    manifestPermalink: 'https://u.expo.dev/update/test',
    isRollBackToEmbedded: false,
  }], groupId, fetchImpl);
  assert.equal(result.groupId, groupId);
  assert.equal(result.updateId, updateId);
  assert.equal(result.sha256, crypto.createHash('sha256').update(bundle).digest('hex').toUpperCase());
});
