const assert = require('node:assert/strict');
const test = require('node:test');

const {
  assertApplyAllowed,
  buildManifest,
  manifestFingerprint,
  parseOptions,
} = require('./repairDestinationApprovalRelease');

function fakeSnapshot(path, data, version = 10) {
  return {
    exists: data != null,
    ref: { path },
    data: () => data,
    updateTime: { toMillis: () => version },
  };
}

test('destination approval repair requires an exact content path and defaults to dry-run', () => {
  assert.deepEqual(parseOptions([
    '--country=IL',
    '--city', 'new-city',
    '--expected-content', 'recommendations/rec-1',
  ]), {
    apply: false,
    countryId: 'IL',
    cityId: 'new-city',
    expectedContentPath: 'recommendations/rec-1',
    fingerprint: '',
    confirmProject: '',
  });
  assert.throws(
    () => parseOptions(['--country', 'IL', '--city', 'new-city', '--expected-content', 'users/owner/notifications/row']),
    /expected-content/u
  );
});

test('destination approval apply is bound to the reviewed candidate manifest', () => {
  const options = parseOptions([
    '--country', 'IL',
    '--city', 'new-city',
    '--expected-content', 'recommendations/rec-1',
  ]);
  const manifest = buildManifest({
    options,
    countrySnapshot: fakeSnapshot('countries/IL', { status: 'active' }),
    destinationSnapshot: fakeSnapshot('countries/IL/destinations/new-city', {
      status: 'active',
      canonicalPolicy: { approved: true, approvalRevision: 2 },
    }),
    candidates: [fakeSnapshot('recommendations/rec-1', {
      status: 'moderation_hold',
      moderation: {
        holdReason: 'destination_policy_review',
        systemGate: 'destination_pending_approval',
      },
    }, 20)],
  });
  const fingerprint = manifestFingerprint(manifest);

  assert.doesNotThrow(() => assertApplyAllowed({
    options: { ...options, apply: true, confirmProject: 'planli-f0b12', fingerprint },
    manifest,
    fingerprint,
  }));
  assert.throws(() => assertApplyAllowed({
    options: { ...options, apply: true, confirmProject: 'planli-f0b12', fingerprint: '0'.repeat(64) },
    manifest,
    fingerprint,
  }), /fingerprint/u);
});
