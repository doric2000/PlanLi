const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { binarySignature, withOfflineDevice, runtimeInputSignature, verifyRuntimeInputs } = require('./native');

test('runtime evidence rejects source edits during service startup or flow execution', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'planli-runtime-inputs-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '--quiet'], { cwd: root });
  fs.mkdirSync(path.join(root, 'functions'));
  const handler = path.join(root, 'functions/handler.js');
  fs.writeFileSync(handler, 'loaded source');
  const flows = ['publish'];
  const initial = runtimeInputSignature(flows, {}, root);
  assert.doesNotThrow(() => verifyRuntimeInputs(initial, flows, {}, root));
  fs.writeFileSync(handler, 'edited while services start');
  assert.throws(() => verifyRuntimeInputs(initial, flows, {}, root), /inputs changed/);
  fs.writeFileSync(handler, 'edited while device flows run');
  assert.throws(() => verifyRuntimeInputs(initial, flows, {}, root), /inputs changed/);
  assert.throws(() => verifyRuntimeInputs(undefined, flows, {}, root), /requires services started/);
});
test('native evidence survives JavaScript and runner edits but not native config, dependencies or JDK changes', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'planli-native-inputs-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '--quiet'], { cwd: root });
  const write = (file, content) => { const full = path.join(root, file); fs.mkdirSync(path.dirname(full), { recursive: true }); fs.writeFileSync(full, content); };
  write('client/app.json', '{}'); write('client/src/screen.js', 'one');
  write('client/package.json', JSON.stringify({ dependencies: { expo: '57' }, scripts: { start: 'one' } }));
  write('jdk/release', 'JAVA_VERSION=21'); write('generated/google-services.json', '{"project":"demo-planli-e2e"}');
  const options = { root, directory: path.join(root, 'generated'), env: { JAVA_HOME: path.join(root, 'jdk'), GCLOUD_PROJECT: 'demo-planli-e2e', GOOGLE_MAPS_ANDROID_KEY: '', GOOGLE_MAPS_IOS_KEY: '' } };
  const initial = binarySignature(options);
  write('client/src/screen.js', 'two'); write('scripts/setupAndroid.ps1', 'different runner');
  write('client/package.json', JSON.stringify({ dependencies: { expo: '57' }, scripts: { start: 'two' } }));
  assert.equal(binarySignature(options), initial);
  write('client/app.json', '{"native":"changed"}'); assert.notEqual(binarySignature(options), initial);
  write('client/app.json', '{}'); write('jdk/release', 'JAVA_VERSION=22'); assert.notEqual(binarySignature(options), initial);
  write('jdk/release', 'JAVA_VERSION=21'); write('client/package.json', '{"dependencies":{"expo":"58"}}'); assert.notEqual(binarySignature(options), initial);
});

test('offline control verifies loss of connectivity and restores both network paths after failure', async () => {
  const calls = [];
  let online = true;
  const controls = {
    output: (args) => ({ stdout: args.at(-1) === 'airplane_mode_on' ? '0' : '1' }),
    adbRun: async (label, args) => { calls.push(args.join(' ')); if (label === 'network-wifi-off') online = false; if (label === 'network-restore-2') online = true; },
    deviceNetworkReady: () => online,
    waitFor: async (label, check) => { assert.equal(await check(), true, label); },
  };
  await assert.rejects(withOfflineDevice(controls, async () => { assert.equal(online, false); throw new Error('screen assertion failed'); }), /screen assertion failed/);
  assert.equal(online, true);
  assert.deepEqual(calls.slice(-3), ['shell cmd connectivity airplane-mode disable', 'shell svc data enable', 'shell svc wifi enable']);
});

test('offline flow cannot proceed if an emulator network path still works', async () => {
  let exercised = false;
  const controls = {
    output: (args) => ({ stdout: args.at(-1) === 'airplane_mode_on' ? '0' : '1' }),
    adbRun: async () => {},
    deviceNetworkReady: () => true,
    waitFor: async (label, check) => { if (!await check()) throw new Error(label); },
  };
  await assert.rejects(withOfflineDevice(controls, async () => { exercised = true; }), /network disconnected/);
  assert.equal(exercised, false);
});
