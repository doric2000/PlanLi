const test = require('node:test');
const assert = require('node:assert/strict');

const {
  BULK_OPERATIONS,
  CONSOLE_CONTRACT_VERSION,
  SUSPENSION_HOURS,
  publicModerationPolicy,
} = require('./moderationPolicy');

test('moderation policy exposes Hebrew reasons and only safe bulk operations', () => {
  const policy = publicModerationPolicy();
  assert.equal(policy.consoleContractVersion, CONSOLE_CONTRACT_VERSION);
  assert.ok(policy.reasons.every((reason) => reason.id && reason.label && reason.userMessage));
  assert.deepEqual(SUSPENSION_HOURS, [24, 168, 720]);
  assert.deepEqual(BULK_OPERATIONS, ['claim', 'unclaim', 'set_priority', 'dismiss']);
  assert.equal(BULK_OPERATIONS.includes('delete'), false);
  assert.equal(BULK_OPERATIONS.includes('suspend'), false);
});
