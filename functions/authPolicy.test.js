const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  ACCESS_LEVELS,
  AUTH_REASONS,
  authorizeRequest,
} = require('./authPolicy');

const activeUser = {
  displayName: 'Dana Cohen',
  onboarding: { profileDetailsVersion: 1, profileDetailsCompletedAt: 'timestamp' },
  legal: {
    termsVersion: '2026-08-14-draft',
    privacyVersion: '2026-08-14-draft',
    acceptedAt: 'timestamp',
  },
  smartProfile: { setupRequired: false, completedAt: 'timestamp' },
};

function adminWithUser(userDocument) {
  return {
    firestore: () => ({
      doc: () => ({
        get: async () => ({ exists: Boolean(userDocument), data: () => userDocument }),
      }),
    }),
  };
}

const passwordAuth = (verified = true) => ({
  uid: 'user-1',
  token: {
    email_verified: verified,
    firebase: { sign_in_provider: 'password' },
  },
});

test('public and signed-in access do not require an active profile', async () => {
  await assert.doesNotReject(authorizeRequest({
    admin: adminWithUser(null), auth: null, access: ACCESS_LEVELS.PUBLIC,
  }));
  await assert.doesNotReject(authorizeRequest({
    admin: adminWithUser(null), auth: passwordAuth(false), access: ACCESS_LEVELS.SIGNED_IN,
  }));
});

test('active access returns structured reasons for every incomplete state', async () => {
  const cases = [
    [null, passwordAuth(), AUTH_REASONS.ACCOUNT_SETUP_REQUIRED],
    [{ ...activeUser, onboarding: {} }, passwordAuth(), AUTH_REASONS.ACCOUNT_SETUP_REQUIRED],
    [{ ...activeUser, legal: {} }, passwordAuth(), AUTH_REASONS.LEGAL_CONSENT_REQUIRED],
    [{ ...activeUser, smartProfile: { setupRequired: true } }, passwordAuth(), AUTH_REASONS.PREFERENCES_REQUIRED],
    [{ ...activeUser, smartProfile: { completedAt: 'timestamp' } }, passwordAuth(), AUTH_REASONS.PREFERENCES_REQUIRED],
    [activeUser, passwordAuth(false), AUTH_REASONS.EMAIL_VERIFICATION_REQUIRED],
  ];
  for (const [userDocument, auth, reason] of cases) {
    await assert.rejects(
      authorizeRequest({ admin: adminWithUser(userDocument), auth, access: ACCESS_LEVELS.ACTIVE }),
      (error) => error?.details?.reason === reason
    );
  }
});

test('active access accepts password and social accounts only after all gates', async () => {
  await assert.doesNotReject(authorizeRequest({
    admin: adminWithUser(activeUser), auth: passwordAuth(true), access: ACCESS_LEVELS.ACTIVE,
  }));
  await assert.doesNotReject(authorizeRequest({
    admin: adminWithUser(activeUser),
    auth: { uid: 'user-1', token: { firebase: { sign_in_provider: 'google.com' } } },
    access: ACCESS_LEVELS.ACTIVE,
  }));
});

test('every exported callable declares its access level', () => {
  const source = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
  const starts = [...source.matchAll(/exports\.(\w+)\s*=\s*callable\(/g)];
  assert.ok(starts.length > 0);
  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index].index;
    const end = starts[index + 1]?.index || source.indexOf('exports.syncCountryMetadataScheduled');
    const block = source.slice(start, end);
    assert.match(block, /access:\s*'(public|signedIn|active)'/, `${starts[index][1]} is missing access`);
  }
});
