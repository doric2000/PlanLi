const test = require('node:test');
const assert = require('node:assert/strict');

const {
  destinationAcceptsNewReferences,
  destinationReassignmentState,
  isDestinationReassigning,
} = require('./destinationReferencePolicy');

test('active destinations accept references unless they are source-locked for reassignment', () => {
  assert.equal(destinationAcceptsNewReferences({ status: 'active' }), true);
  assert.equal(destinationAcceptsNewReferences({
    status: 'active', reassignment: { state: 'receiving', jobId: 'job-1' },
  }), true);
  assert.equal(destinationAcceptsNewReferences({
    status: 'active', reassignment: { state: 'reassigning', jobId: 'job-1' },
  }), false);
  assert.equal(destinationAcceptsNewReferences({ status: 'inactive' }), false);
});

test('reassignment state parsing is explicit and does not treat unknown metadata as a lock', () => {
  assert.equal(destinationReassignmentState({ reassignment: { state: ' reassigning ' } }), 'reassigning');
  assert.equal(isDestinationReassigning({ reassignment: { state: 'reassigning' } }), true);
  assert.equal(isDestinationReassigning({ reassignment: { state: 'failed' } }), false);
});
