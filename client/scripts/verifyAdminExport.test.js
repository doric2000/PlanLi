const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  CI_PR_RECAPTCHA_SITE_KEY,
  resolveRecaptchaSiteKey,
} = require('./exportAdminWeb');
const { verifyAdminExport } = require('./verifyAdminExport');

function fixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'planli-admin-export-'));
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  return root;
}

test('admin export rejects map files and sourceMappingURL directives', () => {
  const mapRoot = fixture({ 'index.html': '<script src="app.js"></script>', 'app.js': 'console.log(1)', 'app.js.map': '{}' });
  try {
    assert.throws(() => verifyAdminExport(mapRoot), /source-map artifacts/);
  } finally {
    fs.rmSync(mapRoot, { recursive: true, force: true });
  }
  const directiveRoot = fixture({ 'index.html': '<script src="app.js"></script>', 'app.js': '//# sourceMappingURL=app.js.map' });
  try {
    assert.throws(() => verifyAdminExport(directiveRoot), /source-map artifacts/);
  } finally {
    fs.rmSync(directiveRoot, { recursive: true, force: true });
  }
});

test('admin export accepts a complete build without source-map artifacts', () => {
  const root = fixture({ 'index.html': '<script src="app.js"></script>', 'app.js': 'console.log(1)' });
  try {
    assert.deepEqual(verifyAdminExport(root), { checked: 1 });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('admin export rejects missing TOTP controls and native-only media imports', () => {
  const missingTotpRoot = fixture({
    'index.html': '<script src="/admin/_expo/static/js/web/index.js"></script>',
    '_expo/static/js/web/index.js': 'console.log("admin")',
  });
  try {
    assert.throws(() => verifyAdminExport(missingTotpRoot), /missing required security marker/);
  } finally {
    fs.rmSync(missingTotpRoot, { recursive: true, force: true });
  }

  const nativeMediaRoot = fixture({
    'index.html': '<script src="/admin/_expo/static/js/web/index.js"></script>',
    '_expo/static/js/web/index.js': 'admin-totp-enrollment-required admin-totp-signin-required ExpoMediaLibraryNext',
  });
  try {
    assert.throws(() => verifyAdminExport(nativeMediaRoot), /native-only ExpoMediaLibraryNext/);
  } finally {
    fs.rmSync(nativeMediaRoot, { recursive: true, force: true });
  }
});

test('admin export verifies that the configured App Check site key was embedded', () => {
  const root = fixture({
    'index.html': '<script src="/admin/_expo/static/js/web/index.js"></script>',
    '_expo/static/js/web/index.js': 'admin-totp-enrollment-required admin-totp-signin-required configured-site-key',
  });
  try {
    assert.deepEqual(
      verifyAdminExport(root, { expectedRecaptchaSiteKey: 'configured-site-key' }),
      { checked: 1 },
    );
    assert.throws(
      () => verifyAdminExport(root, { expectedRecaptchaSiteKey: 'different-site-key' }),
      /does not contain the configured reCAPTCHA Enterprise site key/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('admin export permits a placeholder key only in unprivileged pull request validation', () => {
  assert.equal(
    resolveRecaptchaSiteKey({ EXPO_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY: ' configured-site-key ' }),
    'configured-site-key',
  );
  assert.equal(
    resolveRecaptchaSiteKey({ GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'pull_request' }),
    CI_PR_RECAPTCHA_SITE_KEY,
  );
  assert.throws(
    () => resolveRecaptchaSiteKey({ GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'push' }),
    /requires EXPO_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY/,
  );
  assert.throws(
    () => resolveRecaptchaSiteKey({ GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'pull_request_target' }),
    /requires EXPO_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY/,
  );
  assert.throws(
    () => resolveRecaptchaSiteKey({}),
    /requires EXPO_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY/,
  );
});
