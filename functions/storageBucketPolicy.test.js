const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const functionsRoot = __dirname;

test('runtime Admin SDK always names the EU media bucket', () => {
  const indexSource = fs.readFileSync(path.join(functionsRoot, 'index.js'), 'utf8');
  assert.match(indexSource, /admin\.initializeApp\(\{\s*storageBucket:\s*['"]planli-f0b12-media-eu['"]\s*\}\)/);
});

test('production source never resolves the implicit Admin SDK bucket', () => {
  const sourceFiles = fs.readdirSync(functionsRoot)
    .filter((name) => name.endsWith('.js') && !name.endsWith('.test.js'));
  for (const file of sourceFiles) {
    const source = fs.readFileSync(path.join(functionsRoot, file), 'utf8');
    assert.doesNotMatch(source, /\.bucket\(\s*\)/, `${file} uses an unnamed Storage bucket`);
  }
});

test('retired US rollback bucket denies every client read and write', () => {
  const rulesSource = fs.readFileSync(
    path.join(functionsRoot, '..', 'storage.us-readonly.rules'),
    'utf8'
  );

  assert.match(rulesSource, /allow\s+read\s*,\s*write\s*:\s*if\s+false\s*;/);
  assert.doesNotMatch(rulesSource, /allow\s+(?:get|list|read)\s*:\s*if\s+true\s*;/);
});
