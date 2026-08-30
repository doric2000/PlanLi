const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

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
