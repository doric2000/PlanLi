const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  ACCESS_LEVELS,
  AUTH_REASONS,
  assertAccountSetupComplete,
  authorizeRequest,
} = require('./authPolicy');

const activeUser = {
  displayName: 'Dana Cohen',
  onboarding: { profileDetailsVersion: 1, profileDetailsCompletedAt: 'timestamp' },
  legal: {
    termsVersion: '2026-08-15-community-safety',
    privacyVersion: '2026-08-16-diagnostics',
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

test('public access does not require sign-in or an active profile', async () => {
  await assert.doesNotReject(authorizeRequest({
    admin: adminWithUser(null), auth: null, access: ACCESS_LEVELS.PUBLIC,
  }));
});

test('authenticated access is open to every signed-in account', async () => {
  await assert.doesNotReject(authorizeRequest({
    admin: adminWithUser(null), auth: passwordAuth(false), access: ACCESS_LEVELS.SIGNED_IN,
  }));
  await assert.rejects(authorizeRequest({
    admin: adminWithUser(null),
    auth: null,
    access: ACCESS_LEVELS.SIGNED_IN,
  }), (error) => error?.details?.reason === AUTH_REASONS.SIGN_IN_REQUIRED);
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

test('suspended accounts are rejected centrally before signed-in and active handlers', async () => {
  const suspended = { ...activeUser, moderation: { status: 'suspended' } };
  for (const access of [ACCESS_LEVELS.SIGNED_IN, ACCESS_LEVELS.ACTIVE]) {
    await assert.rejects(
      authorizeRequest({ admin: adminWithUser(suspended), auth: passwordAuth(true), access }),
      (error) => error?.details?.reason === AUTH_REASONS.ACCOUNT_SUSPENDED
    );
  }
});

test('a suspended account may reach only an explicitly exempted signed-in handler', async () => {
  const suspended = { ...activeUser, moderation: { status: 'suspended' } };
  await assert.doesNotReject(authorizeRequest({
    admin: adminWithUser(suspended),
    auth: passwordAuth(true),
    access: ACCESS_LEVELS.SIGNED_IN,
    allowSuspended: true,
  }));
});

test('account setup gate requires verification and legal consent but not preferences', () => {
  const setupOnlyUser = {
    ...activeUser,
    smartProfile: { setupRequired: true },
  };
  assert.doesNotThrow(() => assertAccountSetupComplete(passwordAuth(true), setupOnlyUser));
  assert.throws(
    () => assertAccountSetupComplete(passwordAuth(false), setupOnlyUser),
    (error) => error?.details?.reason === AUTH_REASONS.EMAIL_VERIFICATION_REQUIRED
  );
  assert.throws(
    () => assertAccountSetupComplete(passwordAuth(true), { ...setupOnlyUser, legal: {} }),
    (error) => error?.details?.reason === AUTH_REASONS.LEGAL_CONSENT_REQUIRED
  );
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

test('every public callable uses the bounded beta scaling policy', () => {
  const source = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
  const starts = [...source.matchAll(/exports\.(\w+)\s*=\s*callable\(/g)];
  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index].index;
    const end = starts[index + 1]?.index || source.indexOf('exports.syncCountryMetadataScheduled');
    const block = source.slice(start, end);
    if (/access:\s*'public'/.test(block)) {
      assert.match(block, /\.\.\.PUBLIC_READ_OPTIONS/, `${starts[index][1]} is not scale-bounded`);
    }
  }
});
