const test = require('node:test');
const assert = require('node:assert/strict');

const {
  destinationAcceptsNewReferences,
  destinationIsOperational,
  destinationIsPublicAndReferenceable,
  destinationReassignmentState,
  isDestinationReassigning,
} = require('./destinationReferencePolicy');

const approvedPolicy = {
  approved: true,
  registryId: 'fr-paris',
  kind: 'city_hub',
  groupingPolicy: 'self',
  registryVersion: 3,
  approvalRevision: 1,
  registryAttestation: {
    approved: true, registryId: 'fr-paris', registryVersion: 3,
    approvalRevision: 1, countryId: 'FR',
  },
};

test('only active canonically approved destinations accept public references', () => {
  assert.equal(destinationAcceptsNewReferences({ status: 'active' }), false);
  assert.equal(destinationIsPublicAndReferenceable({
    status: 'active', canonicalPolicy: approvedPolicy,
  }), true);
  assert.equal(destinationAcceptsNewReferences({
    status: 'active', canonicalPolicy: approvedPolicy,
    reassignment: { state: 'receiving', jobId: 'job-1' },
  }), true);
  assert.equal(destinationAcceptsNewReferences({
    status: 'active', canonicalPolicy: approvedPolicy,
    reassignment: { state: 'reassigning', jobId: 'job-1' },
  }), false);
  assert.equal(destinationAcceptsNewReferences({ status: 'inactive' }), false);
  assert.equal(destinationIsPublicAndReferenceable({
    status: 'active',
    canonicalPolicy: { ...approvedPolicy, kind: 'natural_feature' },
  }), true);
  assert.equal(destinationIsOperational({
    status: 'active', canonicalPolicy: { ...approvedPolicy, approved: false },
  }), true);
  assert.equal(destinationAcceptsNewReferences({
    status: 'active', canonicalPolicy: { ...approvedPolicy, registryId: 'invalid/path' },
  }), false);
});

test('a publication drain blocks new writes without prematurely deapproving existing data', () => {
  const destination = {
    status: 'active',
    canonicalPolicy: approvedPolicy,
    publicationFence: { state: 'draining', reason: 'destination_inactive' },
  };
  assert.equal(destinationIsPublicAndReferenceable(destination, 'FR'), true);
  assert.equal(destinationAcceptsNewReferences(destination, 'FR'), false);
});

test('a failed publication drain remains closed until an administrator recovers it', () => {
  const destination = {
    status: 'active',
    canonicalPolicy: approvedPolicy,
    publicationFence: { state: 'manual_review_required' },
  };
  assert.equal(destinationAcceptsNewReferences(destination, 'FR'), false);
});

test('reassignment state parsing is explicit and does not treat unknown metadata as a lock', () => {
  assert.equal(destinationReassignmentState({ reassignment: { state: ' reassigning ' } }), 'reassigning');
  assert.equal(isDestinationReassigning({ reassignment: { state: 'reassigning' } }), true);
  assert.equal(isDestinationReassigning({ reassignment: { state: 'failed' } }), false);
});
