/* eslint-disable no-console */
const path = require('path');

const PROJECT_ID = 'planli-f0b12';
const PROJECT_NUMBER = '633543026638';
const MEDIA_BUCKET = 'planli-f0b12-media-eu';
const CORE_ACCOUNT_ID = 'planli-core-functions';
const MEDIA_ACCOUNT_ID = 'planli-media-functions';
const CORE_EMAIL = `${CORE_ACCOUNT_ID}@${PROJECT_ID}.iam.gserviceaccount.com`;
const MEDIA_EMAIL = `${MEDIA_ACCOUNT_ID}@${PROJECT_ID}.iam.gserviceaccount.com`;

function addMember(policy, role, member) {
  const next = JSON.parse(JSON.stringify(policy || { version: 1, bindings: [] }));
  next.bindings ||= [];
  let binding = next.bindings.find((entry) => entry.role === role && !entry.condition);
  if (!binding) {
    binding = { role, members: [] };
    next.bindings.push(binding);
  }
  binding.members ||= [];
  if (!binding.members.includes(member)) binding.members.push(member);
  binding.members.sort();
  return next;
}

async function firebaseCliAccessToken() {
  if (!process.env.APPDATA) throw new Error('APPDATA is unavailable. Sign in with Firebase CLI.');
  const firebaseToolsRoot = path.join(
    process.env.APPDATA,
    'npm',
    'node_modules',
    'firebase-tools',
    'lib'
  );
  // This intentionally reuses the short-lived OAuth session already managed
  // by Firebase CLI. No refresh token or access token is printed or persisted.
  // eslint-disable-next-line import/no-dynamic-require, global-require
  const auth = require(path.join(firebaseToolsRoot, 'auth.js'));
  const account = auth.getGlobalDefaultAccount();
  if (!account?.tokens?.refresh_token) {
    throw new Error('Run `firebase login` before applying IAM configuration.');
  }
  const token = await auth.getAccessToken(account.tokens.refresh_token, [
    'https://www.googleapis.com/auth/cloud-platform',
  ]);
  return token.access_token;
}

async function request(token, url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let body = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text.slice(0, 160).replace(/\s+/g, ' ') };
    }
  }
  if (!response.ok) {
    const error = new Error(
      `${options.method || 'GET'} ${url}: ${response.status} ` +
      `${body?.error?.message || body.raw || 'Unknown response'}`
    );
    error.status = response.status;
    throw error;
  }
  return body;
}

async function ensureServiceAccount(token, accountId, displayName, description) {
  const url = `https://iam.googleapis.com/v1/projects/${PROJECT_ID}/serviceAccounts`;
  try {
    await request(token, url, {
      method: 'POST',
      body: JSON.stringify({ accountId, serviceAccount: { displayName, description } }),
    });
    return 'created';
  } catch (error) {
    if (error.status === 409) return 'existing';
    throw error;
  }
}

async function updateProjectPolicy(token, additions) {
  const base = `https://cloudresourcemanager.googleapis.com/v1/projects/${PROJECT_ID}`;
  let policy = await request(token, `${base}:getIamPolicy`, {
    method: 'POST',
    body: JSON.stringify({ options: { requestedPolicyVersion: 3 } }),
  });
  for (const { role, member } of additions) policy = addMember(policy, role, member);
  return request(token, `${base}:setIamPolicy`, {
    method: 'POST',
    body: JSON.stringify({ policy }),
  });
}

async function updateBucketPolicy(token, additions) {
  const bucket = encodeURIComponent(MEDIA_BUCKET);
  const url = `https://storage.googleapis.com/storage/v1/b/${bucket}/iam`;
  let policy = await request(token, url);
  for (const { role, member } of additions) policy = addMember(policy, role, member);
  return request(token, url, { method: 'PUT', body: JSON.stringify(policy) });
}

async function updateSecretPolicy(token, secretId, member) {
  const base = `https://secretmanager.googleapis.com/v1/projects/${PROJECT_ID}/secrets/${secretId}`;
  let policy = await request(token, `${base}:getIamPolicy`);
  policy = addMember(policy, 'roles/secretmanager.secretAccessor', member);
  return request(token, `${base}:setIamPolicy`, {
    method: 'POST',
    body: JSON.stringify({ policy }),
  });
}

function plan() {
  const core = `serviceAccount:${CORE_EMAIL}`;
  const media = `serviceAccount:${MEDIA_EMAIL}`;
  const commonRoles = [
    'roles/datastore.user',
    'roles/eventarc.eventReceiver',
    'roles/logging.logWriter',
    // Gen2 Firestore/Storage events are delivered to Cloud Run services.
    // Their Eventarc delivery identities must be allowed to invoke targets.
    'roles/run.invoker',
  ];
  return {
    projectId: PROJECT_ID,
    projectNumber: PROJECT_NUMBER,
    accounts: { core: CORE_EMAIL, media: MEDIA_EMAIL },
    projectBindings: [
      ...commonRoles.map((role) => ({ role, member: core })),
      ...commonRoles.map((role) => ({ role, member: media })),
      { role: 'roles/firebaseauth.admin', member: media },
    ],
    bucketBindings: [
      { role: 'roles/storage.objectViewer', member: core },
      { role: 'roles/storage.objectAdmin', member: media },
    ],
    secretBindings: [
      { secretId: 'GOOGLE_MAPS_KEY', member: core },
      { secretId: 'GOOGLE_PLACES_NEW_KEY', member: core },
      { secretId: 'REST_COUNTRIES_KEY', member: core },
      { secretId: 'OPENWEATHER_API_KEY', member: core },
      { secretId: 'UNSPLASH_ACCESS_KEY', member: core },
      { secretId: 'PUBLIC_RATE_LIMIT_KEY', member: core },
    ],
  };
}

async function run({ apply = false } = {}) {
  const changes = plan();
  if (!apply) {
    console.log(JSON.stringify({ mode: 'dry-run', ...changes }, null, 2));
    return changes;
  }
  const token = await firebaseCliAccessToken();
  const accountResults = {
    core: await ensureServiceAccount(
      token,
      CORE_ACCOUNT_ID,
      'PlanLi core Functions',
      'Least-privilege runtime for PlanLi Firestore and destination operations.'
    ),
    media: await ensureServiceAccount(
      token,
      MEDIA_ACCOUNT_ID,
      'PlanLi media Functions',
      'Least-privilege runtime for PlanLi media and account lifecycle operations.'
    ),
  };
  console.log('Service accounts are present.');
  await updateProjectPolicy(token, changes.projectBindings);
  console.log('Project-level runtime roles are configured.');
  await updateBucketPolicy(token, changes.bucketBindings);
  console.log('European bucket roles are configured.');
  for (const binding of changes.secretBindings) {
    await updateSecretPolicy(token, binding.secretId, binding.member);
  }
  console.log(JSON.stringify({ mode: 'apply', accountResults, ...changes }, null, 2));
  return changes;
}

if (require.main === module) {
  run({ apply: process.argv.includes('--apply') }).catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}

module.exports = {
  CORE_EMAIL,
  MEDIA_EMAIL,
  addMember,
  plan,
  run,
};
