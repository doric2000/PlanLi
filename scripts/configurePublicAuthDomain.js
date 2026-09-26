// Read-only by default. Production changes require an explicitly reviewed apply command.
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { gcloudAccessToken } = require('../functions/scripts/localCredentials');
const links = require('../functions/publicLinks');

const PROJECT = 'planli-f0b12';
const ACCOUNT = 'doric9@gmail.com';
const ENDPOINT = `https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT}/config`;
const CONFIRMATION = 'APPLY PLANLI AUTH DOMAIN';
const TEMPLATE_NAMES = ['resetPasswordTemplate', 'verifyEmailTemplate', 'changeEmailTemplate', 'revertSecondFactorAdditionTemplate'];

function parseArgs(argv) {
  const options = { apply: false, supportReady: false, project: '', expectedState: '', confirm: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') options.apply = true;
    else if (arg === '--support-ready') options.supportReady = true;
    else if (['--project', '--expected-state', '--confirm'].includes(arg)) {
      options[arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = argv[++i] || '';
    } else throw new Error('Unknown argument: ' + arg);
  }
  if (options.project !== PROJECT) throw new Error(`Pass --project ${PROJECT} explicitly.`);
  if (options.apply && (options.confirm !== CONFIRMATION || !/^[a-f0-9]{64}$/.test(options.expectedState))) {
    throw new Error('Apply requires the dry-run state hash and explicit confirmation.');
  }
  return options;
}

function summarize(config) {
  if (![`projects/${PROJECT}/config`, 'projects/633543026638/config'].includes(config.name)) {
    throw new Error('Auth configuration belongs to a different project.');
  }
  if (!config.authorizedDomains?.includes('planli.cc')) throw new Error('Custom Auth domain is not authorized.');
  const email = config.notification?.sendEmail || {};
  return { callbackUri: email.callbackUri || '', replyTo: Object.fromEntries(
    TEMPLATE_NAMES.filter(name => email[name]).map(name => [name, email[name].replyTo || ''])
  ) };
}

function stateHash(state) {
  return crypto.createHash('sha256').update(JSON.stringify(state)).digest('hex');
}

function plan(config, { supportReady = false } = {}) {
  const before = summarize(config);
  const desired = { callbackUri: `${links.origin}/__/auth/action`, replyTo: { ...before.replyTo } };
  const sendEmail = {};
  const updateMask = [];
  if (before.callbackUri !== desired.callbackUri) {
    sendEmail.callbackUri = desired.callbackUri;
    updateMask.push('notification.sendEmail.callbackUri');
  }
  if (supportReady) for (const name of Object.keys(before.replyTo)) {
    desired.replyTo[name] = links.supportEmail;
    if (before.replyTo[name] !== links.supportEmail) {
      sendEmail[name] = { replyTo: links.supportEmail };
      updateMask.push(`notification.sendEmail.${name}.replyTo`);
    }
  }
  return { before, desired, stateHash: stateHash(before), updateMask,
    body: { notification: { sendEmail } } };
}

function verifyAccount() {
  const result = spawnSync(process.platform === 'win32' ? 'gcloud.cmd' : 'gcloud',
    ['auth', 'list', '--filter=status:ACTIVE', '--format=value(account)'],
    { encoding: 'utf8', windowsHide: true, shell: process.platform === 'win32', timeout: 30000 });
  if (result.status !== 0 || String(result.stdout).trim() !== ACCOUNT) {
    throw new Error(`The active gcloud account must be ${ACCOUNT}.`);
  }
}

async function run(options, dependencies = {}) {
  if (options.project !== PROJECT) throw new Error('Unexpected Auth project.');
  (dependencies.verifyAccount || verifyAccount)();
  const token = (dependencies.tokenProvider || gcloudAccessToken)().access_token;
  const fetchImpl = dependencies.fetchImpl || fetch;
  async function request(method = 'GET', change) {
    const suffix = change ? '?updateMask=' + encodeURIComponent(change.updateMask.join(',')) : '';
    const response = await fetchImpl(ENDPOINT + suffix, {
      method, headers: { Authorization: 'Bearer ' + token, 'x-goog-user-project': PROJECT,
        'Content-Type': 'application/json' },
      ...(change ? { body: JSON.stringify(change.body) } : {}),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(`Auth configuration ${method} failed (HTTP ${response.status}).`);
    return response.json();
  }
  const change = plan(await request(), options);
  if (!options.apply) return { mode: 'dry-run', project: PROJECT, ...change };
  if (options.confirm !== CONFIRMATION || change.stateHash !== options.expectedState) {
    throw new Error('Apply confirmation or reviewed state is stale. Run dry-run again.');
  }
  // Read once more immediately before mutation; never blindly retry a PATCH.
  if (stateHash(summarize(await request())) !== change.stateHash) throw new Error('Auth state changed during review.');
  if (change.updateMask.length) await request('PATCH', change);
  const after = summarize(await request());
  if (JSON.stringify(after) !== JSON.stringify(change.desired)) throw new Error('Auth read-back differs from the requested state.');
  return { mode: 'applied', project: PROJECT, changedFields: change.updateMask, after };
}

if (require.main === module) {
  Promise.resolve().then(() => run(parseArgs(process.argv.slice(2))))
    .then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { parseArgs, summarize, stateHash, plan, run, CONFIRMATION };
