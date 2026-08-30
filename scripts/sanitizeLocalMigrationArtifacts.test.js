const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { buildManifest, run, sanitizeText } = require('./sanitizeLocalMigrationArtifacts');

function fakeGcpKey() {
  return ['AI', 'za', 'A'.repeat(35)].join('');
}

test('redacts credential values while reporting only kind and count', () => {
  const secret = fakeGcpKey();
  const result = sanitizeText(`{"imageUrl":"https://example.test/photo?key=${secret}"}`);
  assert.deepEqual(result.findings, [{ kind: 'gcp-api-key', count: 1 }]);
  assert.equal(result.output.includes(secret), false);
  assert.equal(JSON.stringify(result.findings).includes(secret), false);
});

test('apply requires the reviewed manifest hash and sanitizes only approved artifact roots', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'planli-artifact-sanitize-'));
  try {
    const targetDirectory = path.join(root, 'functions', '.database-canonical-migration');
    fs.mkdirSync(targetDirectory, { recursive: true });
    const target = path.join(targetDirectory, 'backup.json');
    const secret = fakeGcpKey();
    fs.writeFileSync(target, `{"imageUrl":"https://example.test/photo?key=${secret}"}\n`);
    const outside = path.join(root, 'outside.json');
    fs.writeFileSync(outside, `{"key":"${secret}"}\n`);

    const manifest = buildManifest(root);
    assert.equal(manifest.files.length, 1);
    assert.throws(() => run({ apply: true, repoRoot: root }), /manifest-hash/);
    const applied = run({
      apply: true,
      expectedManifestHash: manifest.manifestSha256,
      repoRoot: root,
    });
    assert.equal(applied.files.length, 1);
    assert.equal(fs.readFileSync(target, 'utf8').includes(secret), false);
    assert.equal(fs.readFileSync(outside, 'utf8').includes(secret), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
