const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { MAPLIBRE_VERSION, WORKER_FILES, prepareMapLibreWorker } = require('./prepareMapLibreWorker');

test('MapLibre worker distribution preserves relative imports and removes absent source map references', () => {
  const root = path.resolve(__dirname, '../../.codex_tmp/validation/maplibre-worker-fixture');
  const packageRoot = path.join(root, 'package');
  fs.mkdirSync(path.join(packageRoot, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify({ version: MAPLIBRE_VERSION }));
  fs.writeFileSync(path.join(packageRoot, 'LICENSE.txt'), 'BSD license fixture');
  for (const file of WORKER_FILES) fs.writeFileSync(path.join(packageRoot, 'dist', file), "import './maplibre-gl-shared.mjs';\n//# sourceMappingURL=absent.map\n");
  const output = prepareMapLibreWorker({ packageRoot, publicRoot: path.join(root, 'public') });
  for (const file of WORKER_FILES) {
    const source = fs.readFileSync(path.join(output, file), 'utf8');
    assert(source.includes("import './maplibre-gl-shared.mjs'"));
    assert(!source.includes('sourceMappingURL'));
  }
  assert.equal(fs.readFileSync(path.join(output, 'LICENSE.txt'), 'utf8'), 'BSD license fixture');
  const picker = fs.readFileSync(path.resolve(__dirname, '../src/features/community/components/ManualMapPinPicker.web.js'), 'utf8');
  assert(picker.includes(`/maplibre/${MAPLIBRE_VERSION}/maplibre-gl-worker.mjs`));
  fs.writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify({ version: '0.0.0' }));
  assert.throws(() => prepareMapLibreWorker({ packageRoot, publicRoot: path.join(root, 'public') }), /Review the MapLibre/);
});
