const PUBLICATION_STATUS_ACTIVE = 'active';
const PUBLICATION_STATUS_HELD = 'moderation_hold';

function normalizePublicationStatus(status) {
  return status === PUBLICATION_STATUS_ACTIVE
    ? PUBLICATION_STATUS_ACTIVE
    : PUBLICATION_STATUS_HELD;
}

function publicationOutcome(status) {
  const publicationStatus = normalizePublicationStatus(status);
  return {
    publicationStatus,
    publiclyVisible: publicationStatus === PUBLICATION_STATUS_ACTIVE,
  };
}

module.exports = {
  PUBLICATION_STATUS_ACTIVE,
  PUBLICATION_STATUS_HELD,
  normalizePublicationStatus,
  publicationOutcome,
};
