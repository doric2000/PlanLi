function destinationReassignmentState(destination) {
  return String(destination?.reassignment?.state || '').trim();
}

function isDestinationReassigning(destination) {
  return destinationReassignmentState(destination) === 'reassigning';
}

function destinationIsOperational(destination) {
  return destination?.status === 'active' && !isDestinationReassigning(destination);
}

function hasValidApprovedCanonicalPolicy(destination, expectedCountryId = '') {
  const policy = destination?.canonicalPolicy;
  const attestation = policy?.registryAttestation;
  return policy?.approved === true &&
    typeof policy.registryId === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)+$/u.test(policy.registryId) &&
    ['city_hub', 'island', 'tourism_region', 'province'].includes(policy.kind) &&
    ['self', 'parent', 'approved_children'].includes(policy.groupingPolicy) &&
    Number.isInteger(Number(policy.registryVersion)) && Number(policy.registryVersion) >= 1 &&
    Number.isInteger(Number(policy.approvalRevision)) && Number(policy.approvalRevision) >= 1 &&
    attestation?.approved === true &&
    attestation.registryId === policy.registryId &&
    Number(attestation.registryVersion) === Number(policy.registryVersion) &&
    Number(attestation.approvalRevision) === Number(policy.approvalRevision) &&
    typeof attestation.countryId === 'string' && attestation.countryId.length > 0 &&
    (!expectedCountryId || attestation.countryId === expectedCountryId);
}

function destinationIsPublicAndReferenceable(destination, expectedCountryId = '') {
  return destinationIsOperational(destination) &&
    hasValidApprovedCanonicalPolicy(destination, expectedCountryId);
}

function destinationIsPublicInCountry(destination, country, expectedCountryId = '') {
  return country?.status === 'active' &&
    destinationIsPublicAndReferenceable(destination, expectedCountryId);
}

function publicationFenceBlocksNewReferences(destination) {
  return ['draining', 'awaiting_admin_finalize', 'manual_review_required'].includes(
    String(destination?.publicationFence?.state || '').trim()
  );
}

function contentIsPubliclyVisible(content) {
  return content?.status === 'active'
    && content?.publicationGate?.destinationApprovalVerified === true;
}

function destinationAcceptsNewReferences(destination, expectedCountryId = '') {
  return destinationIsPublicAndReferenceable(destination, expectedCountryId)
    && !publicationFenceBlocksNewReferences(destination);
}

module.exports = {
  destinationAcceptsNewReferences,
  contentIsPubliclyVisible,
  destinationIsOperational,
  destinationIsPublicInCountry,
  destinationIsPublicAndReferenceable,
  destinationReassignmentState,
  hasValidApprovedCanonicalPolicy,
  isDestinationReassigning,
  publicationFenceBlocksNewReferences,
};
