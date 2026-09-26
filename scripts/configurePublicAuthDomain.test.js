const test = require('node:test');
const assert = require('node:assert/strict');
const { parseArgs, plan, run, CONFIRMATION } = require('./configurePublicAuthDomain');
const fixture = () => ({ name: 'projects/633543026638/config', authorizedDomains: ['planli.cc'],
  notification: { sendEmail: { callbackUri: 'https://planli-f0b12.firebaseapp.com/__/auth/action',
    verifyEmailTemplate: { replyTo: 'noreply', body: 'Keep original body', senderDisplayName: 'PlanLi Team' },
    resetPasswordTemplate: { replyTo: 'noreply', subject: 'Keep original subject' } } } });

test('requires the exact project and defaults to a read-only plan', () => {
  assert.throws(() => parseArgs([]), /project/);
  assert.throws(() => parseArgs(['--project', 'other']), /project/);
  assert.throws(() => parseArgs(['--project', 'planli-f0b12', '--apply']), /confirmation/);
  assert.equal(parseArgs(['--project', 'planli-f0b12']).apply, false);
  assert.throws(() => plan({ ...fixture(), name: 'projects/other/config' }), /different project/);
});

test('patches only reviewed leaf fields and gates support Reply-To separately', () => {
  const original = fixture();
  const change = plan(original);
  assert.deepEqual(change.updateMask, ['notification.sendEmail.callbackUri']);
  assert.equal(change.desired.replyTo.verifyEmailTemplate, 'noreply');
  const ready = plan(original, { supportReady: true });
  assert.equal(ready.desired.replyTo.verifyEmailTemplate, 'support@planli.cc');
  assert.equal(ready.body.notification.sendEmail.verifyEmailTemplate.replyTo, 'support@planli.cc');
  assert.equal(ready.body.notification.sendEmail.verifyEmailTemplate.body, undefined);
  assert.equal(original.notification.sendEmail.verifyEmailTemplate.body, 'Keep original body');
});

function dependencies(configs) {
  const calls = [];
  return { calls, verifyAccount() {}, tokenProvider: () => ({ access_token: 'test-only' }),
    async fetchImpl(url, options) {
      calls.push({ url, method: options.method, body: options.body });
      const config = configs.shift();
      return { ok: true, json: async () => config };
    } };
}

test('dry-run makes no mutations and never returns credentials', async () => {
  const deps = dependencies([fixture()]);
  const result = await run(parseArgs(['--project', 'planli-f0b12']), deps);
  assert.deepEqual(deps.calls.map(c => c.method), ['GET']);
  assert.equal(JSON.stringify(result).includes('test-only'), false);
});

test('apply rejects stale state and verifies the independent read-back', async () => {
  const original = fixture();
  const options = { ...parseArgs(['--project', 'planli-f0b12']), apply: true,
    expectedState: plan(original).stateHash, confirm: CONFIRMATION };
  const after = fixture();
  after.notification.sendEmail.callbackUri = 'https://planli.cc/__/auth/action';
  const deps = dependencies([original, original, after, after]);
  const result = await run(options, deps);
  assert.equal(result.mode, 'applied');
  assert.deepEqual(deps.calls.map(c => c.method), ['GET', 'GET', 'PATCH', 'GET']);
  const stale = dependencies([after]);
  await assert.rejects(run(options, stale), /stale/);
  assert.deepEqual(stale.calls.map(c => c.method), ['GET']);
  const concurrent = dependencies([original, after]);
  await assert.rejects(run(options, concurrent), /changed during review/);
  const mismatch = dependencies([original, original, after, original]);
  await assert.rejects(run(options, mismatch), /read-back/);
});
