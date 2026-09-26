'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { platforms, storeDestination, preparationKey } = require('./easReleasePlan');
const { submissionOnlyChange } = require('./nativeReleaseInputs');
const eas = require('../client/eas.json');

test('production store submission is production and internal testing is explicitly named', () => {
  assert.equal(storeDestination(eas), 'production');
  assert.equal(storeDestination(eas, 'internal-testing'), 'internal');
  assert.throws(() => storeDestination({ submit: { production: { android: { track: 'internal' } } } }), /production track/);
  assert.throws(() => storeDestination({ submit: { test: { android: { track: 'production' } } } }, 'test'), /testing/);
  assert.deepEqual(platforms(), ['android', 'ios']);
});

test('only store submission changes can bypass native source triage', () => {
  const before = { build: { production: { channel: 'production' } }, cli: { version: '22.6.0' }, submit: { production: { android: { track: 'internal' } } } };
  const after = { ...before, submit: eas.submit };
  assert.equal(submissionOnlyChange(JSON.stringify(before), JSON.stringify(after)), true);
  assert.equal(submissionOnlyChange(JSON.stringify(before), JSON.stringify({ ...after, build: {} })), false);
  assert.equal(submissionOnlyChange(JSON.stringify(before), 'broken'), false);
});

test('preparation is shared only for identical file bytes and dependency layout', () => {
  const a = { platform: 'ios', dependencyLayout: 'local-copy', metadataCrlfSha1: { 'client/eas.json': 'hash' } };
  assert.equal(preparationKey(a), preparationKey({ ...a, platform: 'android', fingerprint: 'different' }));
  assert.notEqual(preparationKey(a), preparationKey({ ...a, dependencyLayout: 'junction' }));
  assert.notEqual(preparationKey(a), preparationKey({ ...a, metadataLfSha1: { file: 'hash' } }));
});
