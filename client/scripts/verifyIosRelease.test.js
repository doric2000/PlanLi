const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');
const { sharedTripLinking } = require('../src/navigation/sharedTripLinking');

const script = require.resolve('./verifyIosRelease');
const clientRoot = path.resolve(__dirname, '..');
const appPath = path.join(clientRoot, 'App.js');
const source = fs.readFileSync(script, 'utf8');
const appSource = fs.readFileSync(appPath, 'utf8');
const scriptRequire = createRequire(script);
// Generate the real native configuration once, then exercise the gate without
// rebuilding or modifying source files between adversarial cases.
const introspection = execFileSync(process.execPath,
  [require.resolve('expo/bin/cli'), 'config', '--type', 'introspect', '--json'],
  { cwd: clientRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024 });

function runGate({ app = appSource, linking = sharedTripLinking } = {}) {
  const errors = [];
  const localProcess = { argv: ['node', script, '--config-only'], env: process.env,
    versions: process.versions, execPath: process.execPath, exitCode: 0 };
  const localRequire = (id) => {
    if (id === 'fs') return { ...fs, readFileSync: (file, ...args) =>
      file === appPath ? app : fs.readFileSync(file, ...args) };
    if (id === 'child_process') return { execFileSync: () => introspection };
    if (id === path.join(clientRoot, 'src/navigation/sharedTripLinking.js')) return { sharedTripLinking: linking };
    return scriptRequire(id);
  };
  localRequire.resolve = scriptRequire.resolve;
  vm.runInNewContext(source, { require: localRequire, __dirname, Buffer,
    process: localProcess, console: { log() {}, error: (value) => errors.push(String(value)) } }, { filename: script });
  return { code: localProcess.exitCode, errors: errors.join('\n') };
}

test('release gate accepts the reviewed bounded shared-trip configuration', () => {
  const result = runGate();
  assert.equal(result.code, 0, result.errors);
});

test('release gate rejects navigation that bypasses the reviewed parser', () => {
  const result = runGate({ app: appSource.replace('linking={sharedTripLinking}', 'linking={unsafeLinking}') });
  assert.equal(result.code, 1);
  assert.match(result.errors, /reviewed bounded shared-trip URL parser/);
});

test('release gate rejects a parser that accepts malformed query input', () => {
  const result = runGate({ linking: { ...sharedTripLinking, getStateFromPath: (value) =>
    sharedTripLinking.getStateFromPath(value.split('?')[0]) } });
  assert.equal(result.code, 1);
  assert.match(result.errors, /accepted an unbounded or unsupported path/);
});

