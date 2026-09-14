const POLICY_ID = 'reviewed-catalog-v1';
const ISSUER = 'system:reviewed-catalog-policy';

function hasReviewedCatalogIdentity(identity) {
  return identity?.source === 'planli_catalog' && Boolean(identity.sourceId) &&
    identity.policyId === POLICY_ID && /^[a-f0-9]{64}$/.test(identity.catalogDigest || '') &&
    /^[A-Z]{2}$/.test(identity.countryCode || '') && /[\u05d0-\u05ea]/.test(identity.names?.he || '') &&
    Boolean(identity.names?.en) && Number.isFinite(identity.coordinates?.lat) && Math.abs(identity.coordinates.lat) <= 90 &&
    Number.isFinite(identity.coordinates?.lng) && Math.abs(identity.coordinates.lng) <= 180 &&
    Array.isArray(identity.sources) && identity.sources.length > 0 &&
    identity.sources.every(source => /^https:\/\//.test(source?.url || ''));
}

function sameReviewedCatalogIdentity(left, right) {
  return hasReviewedCatalogIdentity(left) && hasReviewedCatalogIdentity(right) &&
    left.sourceId === right.sourceId && left.countryCode === right.countryCode && left.catalogDigest === right.catalogDigest;
}

function hasReviewedCatalogApproval(entry) {
  const approval = entry?.approval;
  const identity = entry?.identity;
  return entry?.status === 'active' && approval?.approvedByPolicy === true &&
    approval.policyId === POLICY_ID && approval.approvedBy === ISSUER &&
    /^[a-f0-9]{64}$/.test(approval.catalogDigest || '') &&
    hasReviewedCatalogIdentity(identity) && identity.catalogDigest === approval.catalogDigest &&
    identity.countryCode === entry.countryCode && /^[A-Z]{2}$/.test(entry.countryCode) &&
    /^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(entry.id || '') &&
    ['city_hub', 'island', 'province', 'tourism_region', 'natural_feature'].includes(entry.kind) &&
    ['self', 'parent', 'approved_children'].includes(entry.groupingPolicy) &&
    identity.names?.he === entry.names?.he && identity.names?.en === entry.names?.en &&
    /[\u05d0-\u05ea]/.test(identity.names?.he || '') && Boolean(identity.names?.en) &&
    Number.isFinite(identity.coordinates?.lat) && Math.abs(identity.coordinates.lat) <= 90 &&
    Number.isFinite(identity.coordinates?.lng) && Math.abs(identity.coordinates.lng) <= 180 &&
    identity.coordinates.lat === entry.center?.lat && identity.coordinates.lng === entry.center?.lng &&
    Array.isArray(identity.sources) && identity.sources.length > 0 &&
    identity.sources.every(source => /^https:\/\//.test(source?.url || '')) &&
    entry.geometryPolicy?.autoMatchEligible === false;
}

function reviewedCatalogDestination(entry, countryId, cityId, now = new Date()) {
  if (!hasReviewedCatalogApproval(entry)) throw new Error('Invalid reviewed catalog identity.');
  return {
    schemaVersion: 3, countryId, identity: entry.identity,
    destinationType: { city_hub: 'city', island: 'island', province: 'region',
      tourism_region: 'region', natural_feature: 'natural_feature' }[entry.kind],
    providerRefs: entry.providerRefs || {},
    canonicalPolicy: {
      approved: true, provisional: false, reviewState: 'approved', registryId: entry.id,
      kind: entry.kind, parentId: entry.parentId || null, groupingPolicy: entry.groupingPolicy,
      aliases: entry.aliases, registryVersion: 3, approvalRevision: 1,
      approvedBy: ISSUER, approvedAt: now,
      registryAttestation: { approved: true, registryId: entry.id, registryVersion: 3,
        approvalRevision: 1, countryId, countryCode: entry.countryCode,
        approvalMode: 'policy', policyId: POLICY_ID, issuedBy: ISSUER, issuedAt: now,
        catalogDigest: entry.approval.catalogDigest },
    },
    publicationFence: { state: 'complete', reason: 'reviewed_catalog', approvalRevision: 1 },
    status: 'active', stats: { recommendationCount: 0 },
  };
}

module.exports = { POLICY_ID, ISSUER, hasReviewedCatalogIdentity, sameReviewedCatalogIdentity,
  hasReviewedCatalogApproval, reviewedCatalogDestination };
