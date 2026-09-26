const crypto = require('node:crypto');
const { releasePlatform } = require('./easNativeCompatibility');

const EXPECTED_RUNTIME = '1.4.0';
const REQUIRED_PRODUCTION_MARKERS = [
  'planli-f0b12',
  '633543026638',
  '1:633543026638:web:b63d2a622f3d685646ad9f',
  'planli.cc',
  '633543026638-8ra96ltgtultpe0ja1ecpdm02et9529d.apps.googleusercontent.com',
];
const FORBIDDEN_PLACEHOLDERS = [
  'AIzaSyDummyKey',
  'planli-dummy',
  'planli-dummy.appspot.com',
  'planli-dummy.firebaseapp.com',
  '1:123456789:web:dummy',
];

function fail(message) {
  const error = new Error(message);
  error.code = 'EAS_UPDATE_ARTIFACT_INVALID';
  throw error;
}

function parseMultipartJsonPart(source, name) {
  const marker = `name="${name}"`;
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) fail(`EAS manifest is missing the ${name} part.`);
  const windowsHeaderEnd = source.indexOf('\r\n\r\n', markerIndex);
  const unixHeaderEnd = source.indexOf('\n\n', markerIndex);
  const headerEnd = windowsHeaderEnd >= 0 ? windowsHeaderEnd + 4 : unixHeaderEnd + 2;
  if (headerEnd < 2) fail(`EAS manifest ${name} part has invalid headers.`);
  const nextWindowsBoundary = source.indexOf('\r\n--', headerEnd);
  const nextUnixBoundary = source.indexOf('\n--', headerEnd);
  const boundaryIndex = nextWindowsBoundary >= 0 ? nextWindowsBoundary : nextUnixBoundary;
  if (boundaryIndex < 0) fail(`EAS manifest ${name} part has no closing boundary.`);
  try {
    return JSON.parse(source.slice(headerEnd, boundaryIndex).trim());
  } catch {
    fail(`EAS manifest ${name} part is not valid JSON.`);
  }
}

function validateProductionBundle(bundle) {
  const bytes = Buffer.isBuffer(bundle) ? bundle : Buffer.from(bundle);
  const source = bytes.toString('latin1');
  const placeholders = FORBIDDEN_PLACEHOLDERS.filter((marker) => source.includes(marker));
  if (placeholders.length) {
    fail(`OTA bundle contains forbidden Firebase placeholders: ${placeholders.join(', ')}.`);
  }
  const missing = REQUIRED_PRODUCTION_MARKERS.filter((marker) => !source.includes(marker));
  if (missing.length) {
    fail(`OTA bundle is missing production markers: ${missing.join(', ')}.`);
  }
  if (!/AIza[0-9A-Za-z_-]{35}/u.test(source)) {
    fail('OTA bundle does not contain a Firebase API key-shaped public value.');
  }
  return {
    bytes: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase(),
  };
}

function validateCandidateUpdates(value, groupId, platform = 'ios', runtime = EXPECTED_RUNTIME) {
  releasePlatform(platform);
  const updates = Array.isArray(value) ? value : value?.updates;
  if (!Array.isArray(updates) || updates.length !== 1) {
    fail(`Candidate group ${groupId} must contain exactly one ${platform} update.`);
  }
  const [update] = updates;
  if (update.platform !== platform || update.group !== groupId) {
    fail(`Candidate group ${groupId} does not identify one matching ${platform} artifact.`);
  }
  if ((update.runtimeVersion || update.runtime?.version) !== runtime || update.isRollBackToEmbedded === true) {
    fail(`Candidate group ${groupId} must be a normal runtime ${runtime} update.`);
  }
  if (!update.manifestPermalink || !update.id) {
    fail(`Candidate group ${groupId} is missing immutable update metadata.`);
  }
  return update;
}

async function verifyProductionUpdateArtifact(value, groupId, fetchImpl = globalThis.fetch, platform = 'ios', runtime = EXPECTED_RUNTIME) {
  const update = validateCandidateUpdates(value, groupId, platform, runtime);
  const manifestResponse = await fetchImpl(update.manifestPermalink, {
    headers: {
      accept: 'multipart/mixed',
      'expo-platform': platform,
      'expo-protocol-version': '1',
      'expo-runtime-version': runtime,
    },
  });
  if (!manifestResponse.ok) fail(`EAS manifest returned HTTP ${manifestResponse.status}.`);
  const multipart = await manifestResponse.text();
  const manifest = parseMultipartJsonPart(multipart, 'manifest');
  const extensions = parseMultipartJsonPart(multipart, 'extensions');
  if (
    manifest.id !== update.id
    || manifest.runtimeVersion !== runtime
    || manifest.metadata?.updateGroup !== groupId
  ) {
    fail('Immutable EAS manifest does not match the selected candidate update.');
  }
  const launchAsset = manifest.launchAsset;
  const authorization = extensions.assetRequestHeaders?.[launchAsset?.key]?.authorization;
  if (!launchAsset?.url || !launchAsset?.hash || !authorization) {
    fail('Immutable EAS manifest does not expose an authenticated launch asset.');
  }
  const assetResponse = await fetchImpl(launchAsset.url, { headers: { authorization } });
  if (!assetResponse.ok) fail(`EAS launch asset returned HTTP ${assetResponse.status}.`);
  const bundle = Buffer.from(await assetResponse.arrayBuffer());
  const actualHash = crypto.createHash('sha256').update(bundle).digest('base64url');
  if (actualHash !== launchAsset.hash) fail('EAS launch asset hash does not match its immutable manifest.');
  return {
    ...validateProductionBundle(bundle),
    groupId,
    updateId: update.id,
    launchAssetHash: actualHash,
  };
}

// Promotion reuses immutable assets. Verify what devices are served rather than
// downloading and inspecting the same bytes for a second time.
async function verifyPublicUpdate({ projectId, platform, runtime, update, artifact }, fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(`https://u.expo.dev/${projectId}`, { headers: {
    accept: 'multipart/mixed', 'expo-platform': platform, 'expo-protocol-version': '1',
    'expo-runtime-version': runtime, 'expo-channel-name': 'production',
  } });
  if (!response.ok) fail(`Public update endpoint returned HTTP ${response.status}.`);
  const manifest = parseMultipartJsonPart(await response.text(), 'manifest');
  const expectedHash = Buffer.from(artifact.sha256, 'hex').toString('base64url');
  if (manifest.id !== update.id || manifest.runtimeVersion !== runtime
    || manifest.metadata?.updateGroup !== update.group || manifest.launchAsset?.hash !== expectedHash) {
    fail(`Public ${platform} update does not match the verified candidate.`);
  }
  return { platform, runtime, groupId: update.group, updateId: update.id,
    launchAssetHash: expectedHash, verifiedAt: new Date().toISOString() };
}

module.exports = {
  FORBIDDEN_PLACEHOLDERS,
  REQUIRED_PRODUCTION_MARKERS,
  parseMultipartJsonPart,
  validateCandidateUpdates,
  validateProductionBundle,
  verifyProductionUpdateArtifact,
  verifyPublicUpdate,
};
