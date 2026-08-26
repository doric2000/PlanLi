function destinationReassignmentState(destination) {
  return String(destination?.reassignment?.state || '').trim();
}

function isDestinationReassigning(destination) {
  return destinationReassignmentState(destination) === 'reassigning';
}

function destinationAcceptsNewReferences(destination) {
  return destination?.status === 'active' && !isDestinationReassigning(destination);
}

module.exports = {
  destinationAcceptsNewReferences,
  destinationReassignmentState,
  isDestinationReassigning,
};
