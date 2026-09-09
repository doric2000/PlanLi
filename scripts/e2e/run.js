'use strict';
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn, spawnSync } = require('node:child_process');
const { ROOT, PROJECT, DIRECTORY, localEnvironment } = require('./environment');
const LOGS = path.join(ROOT, '.codex_tmp/validation/android');
const children = new Set();
const cleanupActions = new Set();
function registerCleanup(action) { cleanupActions.add(action); return () => cleanupActions.delete(action); }
const env = { ...localEnvironment(), MAESTRO_CLI_NO_ANALYTICS: '1', GOOGLE_MAPS_ANDROID_KEY: '', GOOGLE_MAPS_IOS_KEY: '' };
for (const key of ['FIREBASE_TOKEN', 'GCLOUD_ACCESS_TOKEN', 'CLOUDSDK_AUTH_ACCESS_TOKEN', 'GOOGLE_OAUTH_ACCESS_TOKEN', 'NODE_OPTIONS']) delete env[key];

function start(label, command, args, cwd = ROOT) {
  fs.mkdirSync(LOGS, { recursive: true });
  const log = path.join(LOGS, `${label}.log`);
  const fd = fs.openSync(log, 'w');
  // Bound the demo JVMs on the 16 GB validation host without constraining Gradle.
  const javaHeap = label === 'firebase' ? 512 : label.startsWith('maestro-') ? 768 : null;
  const childEnv = javaHeap ? { ...env,
    JAVA_TOOL_OPTIONS: `${env.JAVA_TOOL_OPTIONS || ''} -Xms32m -Xmx${javaHeap}m -XX:ActiveProcessorCount=2`.trim(),
  } : env;
  const child = spawn(command, args, { cwd, env: childEnv, windowsHide: true, stdio: ['ignore', fd, fd] });
  fs.closeSync(fd);
  children.add(child);
  fs.writeFileSync(path.join(LOGS, `${label}.pid`), String(child.pid || ''));
  child.on('error', (error) => { child.launchError = error; });
  child.on('exit', () => children.delete(child));
  return { child, log, label };
}
function stopChild(child) {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    const result = spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore', timeout: 5000 });
    if (result.error || result.status !== 0) child.kill('SIGKILL');
  }
  else child.kill('SIGTERM');
}
async function run(label, command, args, cwd, { timeoutMs = label.startsWith('maestro-') ? 900000 : 0 } = {}) {
  const job = start(label, command, args, cwd);
  const started = Date.now();
  let timedOut = false;
  const code = await new Promise((resolve) => {
    const timer = timeoutMs > 0 ? setTimeout(() => {
      timedOut = true;
      stopChild(job.child);
      finish(-1);
    }, timeoutMs) : null;
    function finish(status) { if (timer) clearTimeout(timer); resolve(status); }
    job.child.once('error', () => finish(-1));
    job.child.once('exit', finish);
  });
  if (code !== 0) {
    const tail = fs.readFileSync(job.log, 'utf8').split(/\r?\n/).slice(-35).join('\n');
    const reason = timedOut ? `timed out after ${timeoutMs}ms` : `failed (${code})`;
    throw new Error(`${label} ${reason}: ${job.child.launchError?.message || ''}\n${tail}\nLog: ${job.log}`);
  }
  console.log(`PASS ${label} (${Date.now() - started}ms)`);
  return fs.readFileSync(job.log, 'utf8');
}
function cleanup() {
  for (const action of cleanupActions) { try { action(); } catch (error) { console.error('Local cleanup failed: ' + error.message); } }
  cleanupActions.clear();
  for (const child of [...children]) stopChild(child);
  children.clear();
}
async function portAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
  });
}
async function waitFor(label, predicate, job, timeout = 180000) {
  const deadline = Date.now() + timeout;
  let lastNotice = Date.now();
  while (Date.now() < deadline) {
    if (job?.child.launchError || (job && job.child.exitCode !== null)) throw new Error(`${label} exited; inspect ${job.log}`);
    try { if (await predicate()) return; } catch (error) { if (error.fatal) throw error; }
    if (Date.now() - lastNotice > 20000) { console.log(`Waiting for ${label}...`); lastNotice = Date.now(); }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`${label} did not become ready; inspect ${job?.log || LOGS}`);
}
async function main(args = process.argv.slice(2)) {
  if (args.some((arg) => !['--backend-only', '--build', '--keep-running', '--negative', '--services-only'].includes(arg) && !arg.startsWith('--flows='))) throw new Error('Unknown E2E option');
  let runtimeFlows;
  if (!args.includes('--backend-only') && !args.includes('--services-only')) {
    const files = require('../validationPlan').changedFilesFromGit({ base: 'main', head: 'HEAD', includeWorktree: true }, ROOT);
    const requested = args.find((arg) => arg.startsWith('--flows='));
    const flows = require('./flowPlan').parseFlows(requested?.slice(8), files);
    if (!flows.length) { console.log('No Android flow is affected; no emulator or build is needed.'); return; }
    runtimeFlows = flows;
    args = [...args.filter((arg) => !arg.startsWith('--flows=')), '--flows=' + flows.join(',')];
  }
  for (const port of [4400, 4500, 9099, 8080, 9199, 5001, 9230]) {
    if (!await portAvailable(port)) throw new Error(`Port ${port} is occupied. Stop that local service before starting the isolated demo suite.`);
  }
  // Bind the source before Functions load it, not after device/Metro startup.
  const inputSignature = runtimeFlows && require('./native').runtimeInputSignature(runtimeFlows, env);
  await run('prepare', process.execPath, ['scripts/e2e/prepare.js']);
  const firebase = process.env.PLANLI_FIREBASE_CLI || path.join(path.dirname(process.execPath), 'node_modules/firebase-tools/lib/bin/firebase.js');
  if (!fs.existsSync(firebase)) throw new Error('Firebase CLI not found; set PLANLI_FIREBASE_CLI to its lib/bin/firebase.js.');
  const emulators = start('firebase', process.execPath, [firebase, 'emulators:start', '--project', PROJECT,
    '--config', path.join(DIRECTORY, 'firebase.e2e.json'), '--only', 'auth,firestore,storage,functions', '--inspect-functions=9230', '--non-interactive']);
  await waitFor('Firebase Emulator Suite', async () => {
    const log = fs.readFileSync(emulators.log, 'utf8');
    if (/Failed to load function definition/.test(log)) throw Object.assign(new Error('Functions could not load; inspect the Firebase log'), { fatal: true });
    const response = await fetch('http://127.0.0.1:4400/emulators', { signal: AbortSignal.timeout(2000) });
    const inventory = await response.json();
    return ['auth', 'firestore', 'storage', 'functions'].every((name) => inventory[name])
      && log.includes('All emulators ready');
  }, emulators, 600000);
  if (args.includes('--services-only')) {
    console.log('Demo services ready for local debugging; no test result is claimed. Stop this process to clean them up.');
    await new Promise(() => {});
  }
  await run('seed', process.execPath, ['scripts/e2e/seed.js']);
  await run('backend-smoke', process.execPath, ['scripts/e2e/backendSmoke.js']);
  if (!args.includes('--backend-only')) {
    const { nativeSmoke } = require('./native');
    await nativeSmoke({ args, env, start, run, waitFor, LOGS, inputSignature });
  }
  if (args.includes('--keep-running')) {
    console.log('Local demo services remain running for inspection. Stop this process to clean them up.');
    await new Promise(() => {});
  }
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { cleanup(); process.exit(130); });
if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(cleanup);
module.exports = { main, run, start, waitFor, cleanup, portAvailable, env, registerCleanup };
