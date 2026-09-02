const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const indexesPath = path.join(__dirname, '..', 'firestore.indexes.json');

function fieldSignature(index) {
  return index.fields.map((field) => (
    `${field.fieldPath}:${field.order || field.arrayConfig}`
  )).join('|');
}

test('destinations.status has a collection-group ascending index', () => {
  const config = JSON.parse(fs.readFileSync(indexesPath, 'utf8'));
  const override = config.fieldOverrides.find((entry) => (
    entry.collectionGroup === 'destinations' && entry.fieldPath === 'status'
  ));

  assert.ok(override, 'Missing field override for destinations.status');
  assert.ok(
    override.indexes.some((index) => (
      index.order === 'ASCENDING' && index.queryScope === 'COLLECTION_GROUP'
    )),
    'destinations.status must support ascending collection-group queries'
  );
});

test('destination image jobs have a state index', () => {
  const config = JSON.parse(fs.readFileSync(indexesPath, 'utf8'));
  const override = config.fieldOverrides.find((entry) => (
    entry.collectionGroup === 'destinationJobs' && entry.fieldPath === 'imageSync.state'
  ));
  assert.ok(override?.indexes.some((index) => (
    index.order === 'ASCENDING' && index.queryScope === 'COLLECTION'
  )));
});

test('destination catalog indexes match every popular search query and stable ID tie-breaker', () => {
  const config = JSON.parse(fs.readFileSync(indexesPath, 'utf8'));
  const catalogIndexes = config.indexes
    .filter((entry) => entry.collectionGroup === 'destinationCatalog')
    .map(fieldSignature);

  for (const signature of [
    'status:ASCENDING|recommendationCount:DESCENDING|__name__:ASCENDING',
    'status:ASCENDING|search.prefixes:CONTAINS|recommendationCount:DESCENDING|__name__:ASCENDING',
    'countryId:ASCENDING|status:ASCENDING|recommendationCount:DESCENDING|__name__:ASCENDING',
    'countryId:ASCENDING|status:ASCENDING|search.prefixes:CONTAINS|recommendationCount:DESCENDING|__name__:ASCENDING',
    'countryId:ASCENDING|status:ASCENDING|destinationClass:ASCENDING',
  ]) assert.ok(catalogIndexes.includes(signature), `Missing destination catalog index: ${signature}`);
});

test('destination search indexes include canonical approval guard and every scope', () => {
  const config = JSON.parse(fs.readFileSync(indexesPath, 'utf8'));
  const catalogIndexes = config.indexes
    .filter((entry) => entry.collectionGroup === 'destinationCatalog')
    .map(fieldSignature);

  for (const signature of [
    'status:ASCENDING|canonicalApproved:ASCENDING|recommendationCount:DESCENDING|__name__:ASCENDING',
    'status:ASCENDING|canonicalApproved:ASCENDING|search.prefixes:CONTAINS|recommendationCount:DESCENDING|__name__:ASCENDING',
    'countryId:ASCENDING|status:ASCENDING|canonicalApproved:ASCENDING|recommendationCount:DESCENDING|__name__:ASCENDING',
    'countryId:ASCENDING|status:ASCENDING|canonicalApproved:ASCENDING|search.prefixes:CONTAINS|recommendationCount:DESCENDING|__name__:ASCENDING',
    'status:ASCENDING|canonicalApproved:ASCENDING|names.he:ASCENDING|__name__:ASCENDING',
    'countryId:ASCENDING|status:ASCENDING|canonicalApproved:ASCENDING|names.he:ASCENDING|__name__:ASCENDING',
    'discoveryRegionId:ASCENDING|status:ASCENDING|canonicalApproved:ASCENDING|recommendationCount:DESCENDING|__name__:ASCENDING',
    'discoveryRegionId:ASCENDING|status:ASCENDING|canonicalApproved:ASCENDING|search.prefixes:CONTAINS|recommendationCount:DESCENDING|__name__:ASCENDING',
    'discoveryRegionId:ASCENDING|status:ASCENDING|canonicalApproved:ASCENDING|names.he:ASCENDING|__name__:ASCENDING',
  ]) assert.ok(catalogIndexes.includes(signature), `Missing approved destination search index: ${signature}`);
});

test('pending trip content has a stable owner/status/time index', () => {
  const config = JSON.parse(fs.readFileSync(indexesPath, 'utf8'));
  const tripIndexes = config.indexes
    .filter((entry) => entry.collectionGroup === 'trips')
    .map(fieldSignature);
  assert.ok(tripIndexes.includes(
    'ownerId:ASCENDING|status:ASCENDING|createdAt:DESCENDING'
  ));
});

test('personalized recommendation candidate queries have global and destination indexes', () => {
  const config = JSON.parse(fs.readFileSync(indexesPath, 'utf8'));
  const recommendationIndexes = config.indexes
    .filter((entry) => entry.collectionGroup === 'recommendations')
    .map(fieldSignature);

  assert.ok(recommendationIndexes.includes(
    'status:ASCENDING|facets.interests:CONTAINS|createdAt:DESCENDING'
  ));
  assert.ok(recommendationIndexes.includes(
    'destination.countryId:ASCENDING|destination.cityId:ASCENDING|status:ASCENDING|stats.likeCount:DESCENDING'
  ));
  assert.ok(recommendationIndexes.includes(
    'destination.countryId:ASCENDING|destination.cityId:ASCENDING|status:ASCENDING|facets.interests:CONTAINS|createdAt:DESCENDING'
  ));
  assert.ok(recommendationIndexes.includes(
    'status:ASCENDING|search.prefixes:CONTAINS'
  ));
  assert.ok(recommendationIndexes.includes(
    'status:ASCENDING|mapLocation.geohash:ASCENDING'
  ));
  assert.ok(recommendationIndexes.includes(
    'publicationGate.destinationApprovalVerified:ASCENDING|status:ASCENDING|stats.likeCount:DESCENDING'
  ));
  assert.ok(recommendationIndexes.includes(
    'publicationGate.destinationApprovalVerified:ASCENDING|status:ASCENDING|createdAt:DESCENDING'
  ));
  assert.ok(recommendationIndexes.includes(
    'destination.countryId:ASCENDING|destination.cityId:ASCENDING|status:ASCENDING|search.prefixes:CONTAINS'
  ));
});

test('route discovery candidate queries have search, facet, quality and destination indexes', () => {
  const config = JSON.parse(fs.readFileSync(indexesPath, 'utf8'));
  const routeIndexes = config.indexes
    .filter((entry) => entry.collectionGroup === 'routes')
    .map(fieldSignature);

  for (const signature of [
    'status:ASCENDING|stats.likeCount:DESCENDING',
    'publicationGate.destinationApprovalVerified:ASCENDING|status:ASCENDING|stats.likeCount:DESCENDING',
    'publicationGate.destinationApprovalVerified:ASCENDING|status:ASCENDING|createdAt:DESCENDING',
    'status:ASCENDING|search.prefixes:CONTAINS',
    'status:ASCENDING|facets.interests:CONTAINS',
    'status:ASCENDING|destinationKeys:CONTAINS|createdAt:DESCENDING',
    'status:ASCENDING|destinationKeys:CONTAINS|stats.likeCount:DESCENDING',
  ]) assert.ok(routeIndexes.includes(signature), `Missing route index: ${signature}`);
});

test('moderation queues and reporter cleanup have their required indexes', () => {
  const config = JSON.parse(fs.readFileSync(indexesPath, 'utf8'));
  const caseIndexes = config.indexes
    .filter((entry) => entry.collectionGroup === 'cases')
    .map(fieldSignature);
  assert.ok(caseIndexes.includes('status:ASCENDING|updatedAt:DESCENDING'));
  assert.ok(caseIndexes.includes('priority:ASCENDING|status:ASCENDING'));
  assert.ok(caseIndexes.includes('status:ASCENDING|dueAtMs:ASCENDING'));
  assert.ok(caseIndexes.includes('status:ASCENDING|reportCount:DESCENDING'));
  assert.ok(caseIndexes.includes('status:ASCENDING|assignmentUid:ASCENDING|updatedAt:DESCENDING'));
  assert.ok(caseIndexes.includes('status:ASCENDING|priority:ASCENDING|dueAtMs:ASCENDING'));
  const searchIndexes = config.indexes
    .filter((entry) => entry.collectionGroup === 'search')
    .map(fieldSignature);
  assert.ok(searchIndexes.includes('search.prefixes:CONTAINS|updatedAt:DESCENDING'));
  const enforcementIndexes = config.indexes
    .filter((entry) => entry.collectionGroup === 'enforcements')
    .map(fieldSignature);
  assert.ok(enforcementIndexes.includes('type:ASCENDING|status:ASCENDING|endsAt:ASCENDING'));
  const reporterOverride = config.fieldOverrides.find((entry) => (
    entry.collectionGroup === 'reports' && entry.fieldPath === 'reporterId'
  ));
  assert.ok(reporterOverride?.indexes.some((index) => (
    index.order === 'ASCENDING' && index.queryScope === 'COLLECTION_GROUP'
  )));
  const destinationReviewIndexes = config.indexes
    .filter((entry) => entry.collectionGroup === 'destinationReviews')
    .map(fieldSignature);
  assert.ok(destinationReviewIndexes.includes('status:ASCENDING|updatedAt:DESCENDING'));
  const candidateExpiry = config.fieldOverrides.find((entry) => (
    entry.collectionGroup === 'imageCandidates' && entry.fieldPath === 'expireAt'
  ));
  assert.ok(candidateExpiry?.indexes.some((index) => (
    index.order === 'ASCENDING' && index.queryScope === 'COLLECTION_GROUP'
  )));
});

test('notification center filters have channel-scoped chronological indexes', () => {
  const config = JSON.parse(fs.readFileSync(indexesPath, 'utf8'));
  const notificationIndexes = config.indexes
    .filter((entry) => entry.collectionGroup === 'notifications')
    .map(fieldSignature);

  for (const signature of [
    'schemaVersion:ASCENDING|channel:ASCENDING|createdAt:DESCENDING',
    'schemaVersion:ASCENDING|channel:ASCENDING|isRead:ASCENDING|createdAt:DESCENDING',
    'schemaVersion:ASCENDING|channel:ASCENDING|type:ASCENDING|createdAt:DESCENDING',
    'schemaVersion:ASCENDING|channel:ASCENDING|subtype:ASCENDING|createdAt:DESCENDING',
    'schemaVersion:ASCENDING|channel:ASCENDING|priority:ASCENDING|createdAt:DESCENDING',
  ]) assert.ok(notificationIndexes.includes(signature), `Missing notification index: ${signature}`);
});

test('push retry and receipt workers have indexes and TTL cleanup policies', () => {
  const config = JSON.parse(fs.readFileSync(indexesPath, 'utf8'));
  const deviceIndexes = config.indexes
    .filter((entry) => entry.collectionGroup === 'notificationDevices')
    .map(fieldSignature);
  assert.ok(deviceIndexes.includes('uid:ASCENDING|enabled:ASCENDING'));
  const dispatchIndexes = config.indexes
    .filter((entry) => entry.collectionGroup === 'notificationPushDispatches')
    .map(fieldSignature);
  assert.ok(dispatchIndexes.includes('status:ASCENDING|nextAttemptAt:ASCENDING'));
  assert.ok(dispatchIndexes.includes('status:ASCENDING|leaseUntil:ASCENDING'));
  const receiptIndexes = config.indexes
    .filter((entry) => entry.collectionGroup === 'notificationPushReceipts')
    .map(fieldSignature);
  assert.ok(receiptIndexes.includes('mode:ASCENDING|checkAfter:ASCENDING'));
  for (const collectionGroup of ['notificationPushDispatches', 'notificationPushReceipts']) {
    assert.ok(config.fieldOverrides.some((entry) => (
      entry.collectionGroup === collectionGroup
      && entry.fieldPath === 'expireAt'
      && entry.ttl === true
    )), `Missing push TTL policy for ${collectionGroup}`);
  }
});

test('guest-session security state has TTL cleanup policies', () => {
  const config = JSON.parse(fs.readFileSync(indexesPath, 'utf8'));
  for (const collectionGroup of [
    'guestSessions',
    'guestSessionNonces',
    'guestSessionIssuance',
  ]) {
    assert.ok(config.fieldOverrides.some((entry) => (
      entry.collectionGroup === collectionGroup
      && entry.fieldPath === 'expireAt'
      && entry.ttl === true
    )), `Missing guest-session TTL policy for ${collectionGroup}`);
  }
});

test('blocked-like cleanup and durable notification cleanup have indexes', () => {
  const config = JSON.parse(fs.readFileSync(indexesPath, 'utf8'));
  const likeIndexes = config.indexes
    .filter((entry) => entry.collectionGroup === 'likes')
    .map(fieldSignature);
  assert.ok(likeIndexes.includes(
    'userId:ASCENDING|notificationRecipientId:ASCENDING|__name__:ASCENDING'
  ));
  const notificationIndexes = config.indexes
    .filter((entry) => entry.collectionGroup === 'notifications')
    .map(fieldSignature);
  assert.ok(notificationIndexes.includes('actorId:ASCENDING|type:ASCENDING'));
  assert.ok(config.fieldOverrides.some((entry) => (
    entry.collectionGroup === 'notificationCleanupJobs'
    && entry.fieldPath === 'expireAt'
    && entry.ttl === true
  )));
  assert.ok(config.fieldOverrides.some((entry) => (
    entry.collectionGroup === 'commentThreadDeletionJobs'
    && entry.fieldPath === 'expireAt'
    && entry.ttl === true
  )));
});

test('threaded comments have bounded root and reply indexes', () => {
  const config = JSON.parse(fs.readFileSync(indexesPath, 'utf8'));
  const indexes = config.indexes
    .filter((entry) => entry.collectionGroup === 'comments')
    .map(fieldSignature);
  assert.ok(indexes.includes('status:ASCENDING|threadType:ASCENDING|createdAt:DESCENDING'));
  assert.ok(indexes.includes(
    'status:ASCENDING|threadType:ASCENDING|threadRootId:ASCENDING|createdAt:ASCENDING'
  ));
});
