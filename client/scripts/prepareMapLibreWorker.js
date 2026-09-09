const fs = require('node:fs');
const path = require('node:path');

const MAPLIBRE_VERSION = '6.4.1';
const WORKER_FILES = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'];

function prepareMapLibreWorker({
  packageRoot = path.dirname(require.resolve('maplibre-gl/package.json')),
  publicRoot = path.resolve(__dirname, '../public'),
} = {}) {
  const version = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8')).version;
  if (version !== MAPLIBRE_VERSION) throw new Error('Review the MapLibre worker URL when changing its version.');
  const output = path.join(publicRoot, 'maplibre', version);
  fs.mkdirSync(output, { recursive: true });
  // Metro bundles the main module. MapLibre's ESM worker and shared module must
  // remain adjacent, served from our origin, rather than inferred from the bundle URL.
  for (const file of WORKER_FILES) {
    const source = fs.readFileSync(path.join(packageRoot, 'dist', file), 'utf8');
    fs.writeFileSync(path.join(output, file), source.replace(/^\/\/# sourceMappingURL=.*$/gm, ''));
  }
  fs.copyFileSync(path.join(packageRoot, 'LICENSE.txt'), path.join(output, 'LICENSE.txt'));
  return output;
}

if (require.main === module) prepareMapLibreWorker();
module.exports = { MAPLIBRE_VERSION, WORKER_FILES, prepareMapLibreWorker };
