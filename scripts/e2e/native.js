'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { ROOT, DIRECTORY } = require('./environment');
const { inputFiles, signature, writeReceipt } = require('../validationReceipt');
const { changedFilesFromGit } = require('../validationPlan');
const { parseFlows } = require('./flowPlan');
const SERIAL = 'emulator-5580';

function runtimeInputSignature(flows, env, root = ROOT) {
  return signature({ root, scope: 'all', command: 'android-e2e', args: flows, env });
}
function verifyRuntimeInputs(expected, flows, env, root = ROOT) {
  if (!expected) throw new Error('Runtime evidence requires services started by scripts/e2e/run.js.');
  if (runtimeInputSignature(flows, env, root) !== expected) {
    throw new Error('Runtime inputs changed after service startup; this result cannot validate the changed source. Restart the affected flow when editing has finished.');
  }
}

function binarySignature({ root = ROOT, directory = DIRECTORY, env = require('./run').env } = {}) {
  const hash = crypto.createHash('sha256');
  for (const file of inputFiles(root, 'client').filter((name) =>
    /^client\/(?:app\.|package|plugins\/|modules\/|patches\/|assets\/)/.test(name))) {
    hash.update(file);
    if (file === 'client/package.json') {
      const manifest = JSON.parse(fs.readFileSync(path.join(root, file)));
      delete manifest.scripts; delete manifest.jest;
      hash.update(JSON.stringify(manifest));
    } else hash.update(fs.existsSync(path.join(root, file)) ? fs.readFileSync(path.join(root, file)) : '<deleted>');
  }
  hash.update(JSON.stringify({ javaHome: env.JAVA_HOME, project: env.GCLOUD_PROJECT, maps: [env.GOOGLE_MAPS_ANDROID_KEY, env.GOOGLE_MAPS_IOS_KEY] }));
  hash.update(fs.readFileSync(path.join(env.JAVA_HOME, 'release')));
  hash.update(fs.readFileSync(path.join(directory, 'google-services.json')));
  hash.update('android-debug-api36-x86_64-v3');
  return hash.digest('hex');
}
async function nativeSmoke({ args, env, start, run, waitFor, LOGS, inputSignature }) {
  const client = path.join(ROOT, 'client');
  const expo = require.resolve('expo/bin/cli', { paths: [client] });
  const adb = path.join(DIRECTORY, 'sdk/platform-tools/adb.exe');
  const maestro = path.join(DIRECTORY, 'maestro/maestro/bin/maestro.bat');
  for (const tool of [adb, maestro]) if (!fs.existsSync(tool)) throw new Error('Run npm run setup:android -- -Install first.');
  const apk = path.join(client, 'android/app/build/outputs/apk/debug/app-debug.apk');
  const receipt = path.join(DIRECTORY, 'native-build.json');
  const digest = binarySignature();
  let built;
  try { built = JSON.parse(fs.readFileSync(receipt)); } catch { /* No successful build yet. */ }
  if (args.includes('--build') || !fs.existsSync(apk) || built?.signature !== digest) {
    console.log('Building the local Android development app; the binary will be reused for JavaScript changes.');
    const packagePath = path.join(client, 'package.json');
    const originalScripts = JSON.parse(fs.readFileSync(packagePath)).scripts;
    try { await run('android-prebuild', process.execPath, [expo, 'prebuild', '--platform', 'android', '--no-install'], client); }
    finally {
      const manifest = JSON.parse(fs.readFileSync(packagePath));
      for (const platform of ['android', 'ios']) {
        if (manifest.scripts[platform] === `expo run:${platform}`) manifest.scripts[platform] = originalScripts[platform];
      }
      fs.writeFileSync(packagePath, `${JSON.stringify(manifest, null, 2)}\n`);
    }
    fs.writeFileSync(path.join(client, 'android/local.properties'), `sdk.dir=${env.ANDROID_HOME.replace(/\\/g, '/')}`);
    // Gradle's worker cap does not constrain Ninja. Keep C++ compilation within
    // this validation host's memory budget without changing production builds.
    const initScript = path.join(DIRECTORY, 'limit-native-compilers.gradle');
    fs.writeFileSync(initScript, `allprojects { project ->
  ['com.android.application', 'com.android.library'].each { pluginId ->
    project.plugins.withId(pluginId) {
      project.android.defaultConfig.externalNativeBuild.cmake.arguments.addAll([
        '-DCMAKE_JOB_POOLS=planli_compile=2', '-DCMAKE_JOB_POOL_COMPILE=planli_compile', '-DCMAKE_JOB_POOL_LINK=planli_compile'
      ])
    }
  }
}
`);
    await run('android-build', 'cmd.exe', ['/d', '/s', '/c', 'gradlew.bat app:assembleDebug --init-script ../../.codex_tmp/android/limit-native-compilers.gradle -PreactNativeArchitectures=x86_64 --no-daemon --console=plain --max-workers=2 --no-parallel'], path.join(client, 'android'));
    if (binarySignature() !== digest) throw new Error('Native inputs changed during compilation; run the incremental build again.');
    fs.writeFileSync(receipt, JSON.stringify({ signature: digest, completedAt: new Date().toISOString() }));
  } else console.log('REUSE Android development binary (native inputs unchanged)');
  if (args.includes('--build-only')) return;
  const output = (params) => spawnSync(adb, ['-s', SERIAL, ...params], { env, encoding: 'utf8', windowsHide: true, timeout: 15000 });
  const device = output(['shell', 'getprop', 'ro.boot.qemu.avd_name']);
  let emulator;
  if (device.status === 0 && device.stdout.trim() !== 'PlanLi_E2E_API34') throw new Error(`${SERIAL} belongs to another virtual device.`);
  if (device.status !== 0) emulator = start('android-emulator', path.join(DIRECTORY, 'sdk/emulator/emulator.exe'),
    ['-avd', 'PlanLi_E2E_API34', '-port', '5580', '-no-window', '-no-audio', '-no-snapshot', '-no-boot-anim', '-cores', '2', '-memory', '2560', '-gpu', 'swangle', '-vsync-rate', '30']);
  await waitFor('Android boot', () => output(['shell', 'getprop', 'sys.boot_completed']).stdout?.trim() === '1', emulator, 300000);
  const adbRun = (label, params) => run(label, adb, ['-s', SERIAL, ...params]);
  await adbRun('android-screen-size', ['shell', 'wm', 'size', '540x960']);
  await adbRun('android-screen-density', ['shell', 'wm', 'density', '240']);
  // Pixel 6's fixed 128px cutout does not scale with this small test display.
  // Its status-bar touch region otherwise covers Expo's Close button.
  await adbRun('android-display-overlay', ['shell', 'cmd', 'overlay', 'disable', '--user', '0', 'com.android.internal.emulation.pixel_6']);
  await adbRun('android-systemui-overlay', ['shell', 'cmd', 'overlay', 'disable', '--user', '0', 'com.android.systemui.emulation.pixel_6']);
  await adbRun('android-install', ['install', '-r', apk]);
  await adbRun('android-fixture-photo', ['push', path.join(DIRECTORY, 'fixture.jpg'), '/sdcard/Pictures/planli-e2e.jpg']);
  await adbRun('android-index-photo', ['shell', 'am', 'broadcast', '-a', 'android.intent.action.MEDIA_SCANNER_SCAN_FILE', '-d', 'file:///sdcard/Pictures/planli-e2e.jpg']);
  if (!await require('./run').portAvailable(8081)) throw new Error('Metro port 8081 is occupied; stop that service before running the isolated app.');
  const metro = start('metro', process.execPath, [expo, 'start', '--dev-client', '--port', '8081', '--offline'], client);
  await waitFor('Metro', async () => (await fetch('http://127.0.0.1:8081/status', { signal: AbortSignal.timeout(2000) })).ok, metro, 600000);
  const deviceNetworkReady = () => /HTTP\/1\.1 200/.test(output(['shell',
    'printf "GET /status HTTP/1.1\\r\\nHost: localhost\\r\\nConnection: close\\r\\n\\r\\n" | toybox nc -q 1 -W 2 -w 2 10.0.2.2 8081']).stdout || '');
  await waitFor('Android connection to Metro', deviceNetworkReady, emulator, 60000);
  const files = changedFilesFromGit({ base: 'main', head: 'HEAD', includeWorktree: true }, ROOT);
  const flows = parseFlows(args.find((arg) => arg.startsWith('--flows='))?.slice(8), files);
  if (!flows.length) { console.log('No Android flow is affected.'); return; }
  return runDeviceFlows({ flows, args, env, run, LOGS, adbRun, output, deviceNetworkReady, waitFor, emulator, inputSignature });
}
async function runDeviceFlows({ flows, args = [], env, run, LOGS, adbRun, output, deviceNetworkReady, waitFor, emulator, inputSignature }) {
  const client = path.join(ROOT, 'client');
  require('./environment').assertLocalEnvironment(env);
  if (output(['shell', 'getprop', 'ro.boot.qemu.avd_name']).stdout?.trim() !== 'PlanLi_E2E_API34') throw new Error('Device flow requires the dedicated Android 14 AVD.');
  await waitFor('Android connection to Metro', deviceNetworkReady, emulator, 60000);
  const started = Date.now();
  const results = [];
  // Launch the pinned distribution exactly as maestro.bat does, without a shell.
  const runFlow = (flow) => run('maestro-' + flow, path.join(env.JAVA_HOME, 'bin/java.exe'),
    ['--enable-native-access=ALL-UNNAMED', '-classpath', path.join(DIRECTORY, 'maestro/maestro/lib/*'),
      'maestro.cli.AppKt', '--device', SERIAL, 'test', '--format', 'junit', '--output', path.join(LOGS, flow + '.xml'),
      '--test-output-dir', LOGS, path.join(client, '.maestro/android', flow + '.yml')], client);
  try {
    verifyRuntimeInputs(inputSignature, flows, env);
    for (const flow of flows) {
      const time = Date.now();
      if (flow === 'network') {
        await runFlow('network-start');
        await withOfflineDevice({ adbRun, output, deviceNetworkReady, waitFor, emulator }, () => runFlow('network-error'));
        await runFlow('network-recovery');
      } else await runFlow(flow);
      results.push({ flow, durationMs: Date.now() - time });
    }
    if (args.includes('--negative')) {
      let rejected = false;
      try { await runFlow('negative'); } catch (error) {
        const log = fs.readFileSync(path.join(LOGS, 'maestro-negative.log'), 'utf8');
        if (!/this-screen-must-never-exist/.test(log) || !/FAIL|Assertion.*visible/.test(log)) throw error;
        rejected = true;
      }
      if (!rejected) throw new Error('The deliberately incorrect screen assertion was not detected.');
      console.log('PASS negative control: Maestro rejected the deliberately incorrect assertion.');
    }
    verifyRuntimeInputs(inputSignature, flows, env);
    writeReceipt(path.join(DIRECTORY, 'runtime.receipt.json'), { status: 'passed', signature: inputSignature,
      logPath: path.join(LOGS, `maestro-${flows.at(-1) === 'network' ? 'network-recovery' : flows.at(-1)}.log`),
      flows, results, durationMs: Date.now() - started, completedAt: new Date().toISOString() });
  } catch (error) {
    writeReceipt(path.join(DIRECTORY, 'runtime.receipt.json'), { status: 'failed', signature: inputSignature, results, reason: error.message });
    throw error;
  }
}
async function withOfflineDevice({ adbRun, output, deviceNetworkReady, waitFor, emulator }, action) {
  const setting = (key) => output(['shell', 'settings', 'get', 'global', key]).stdout?.trim();
  if (setting('wifi_on') !== '1' || setting('airplane_mode_on') !== '0') throw new Error('Network test requires initially enabled Wi-Fi and disabled airplane mode.');
  const mobile = setting('mobile_data');
  if (!['0', '1'].includes(mobile)) throw new Error('Could not read the original emulator mobile-data state.');
  const recovery = [
    ['shell', 'cmd', 'connectivity', 'airplane-mode', 'disable'],
    ['shell', 'svc', 'data', mobile === '1' ? 'enable' : 'disable'],
    ['shell', 'svc', 'wifi', 'enable'],
  ];
  const unregister = require('./run').registerCleanup(() => recovery.forEach(output));
  try {
    await adbRun('network-airplane-on', ['shell', 'cmd', 'connectivity', 'airplane-mode', 'enable']);
    await adbRun('network-mobile-off', ['shell', 'svc', 'data', 'disable']);
    await adbRun('network-wifi-off', ['shell', 'svc', 'wifi', 'disable']);
    await waitFor('Android network disconnected', () => !deviceNetworkReady(), emulator, 30000);
    await action();
  } finally {
    for (const [index, command] of recovery.entries()) await adbRun(`network-restore-${index}`, command);
    await waitFor('Android network recovery', deviceNetworkReady, emulator, 60000);
    unregister();
  }
}
if (require.main === module) {
  const runner = require('./run');
  nativeSmoke({ ...runner, args: process.argv.slice(2), env: runner.env,
    LOGS: path.join(ROOT, '.codex_tmp/validation/android') }).catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(async () => {
    if (process.argv.includes('--keep-running')) {
      console.log('Local Android helpers remain available for debugging; the receipt retains the actual test result.');
      await new Promise(() => {});
    }
    runner.cleanup();
  });
}
module.exports = { nativeSmoke, binarySignature, runDeviceFlows, withOfflineDevice, runtimeInputSignature, verifyRuntimeInputs };
