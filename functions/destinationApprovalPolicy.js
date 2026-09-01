const crypto = require('node:crypto');

const VERIFIED_IL_LOCALITY_POLICY_ID = 'verified-il-locality-v1';
const VERIFIED_IL_LOCALITY_ISSUER = 'system:verified-il-locality-policy';

const VERIFIED_LOCALITY_TYPES = new Set([
  'locality',
  'postal_town',
  'neighborhood',
  'sublocality',
  'sublocality_level_1',
  'administrative_area_level_3',
]);

function clean(value) {
  return String(value || '').trim();
}

function approvedRegistryId(entry) {
  const current = clean(entry?.id).toLowerCase();
  if (/^[a-z0-9]+(?:-[a-z0-9]+)+$/u.test(current)) return current;
  const digest = crypto.createHash('sha256')
    .update(clean(entry?.providerRefs?.googlePlaceId))
    .digest('hex')
    .slice(0, 20);
  return `il-verified-${digest}`;
}

function hasCoordinates(value) {
  const lat = Number(value?.lat);
  const lng = Number(value?.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function hasGeometry(entry) {
  const viewport = entry?.viewport;
  const viewportValues = [
    viewport?.southwest?.lat,
    viewport?.southwest?.lng,
    viewport?.northeast?.lat,
    viewport?.northeast?.lng,
  ].map(Number);
  return viewportValues.every(Number.isFinite) ||
    (hasCoordinates(entry?.center) && Number.isFinite(Number(entry?.radiusKm)) && Number(entry.radiusKm) > 0);
}

function isVerifiedIlLocalityEntry(entry) {
  const types = new Set(Array.isArray(entry?.googleTypes) ? entry.googleTypes : []);
  return clean(entry?.countryCode).toUpperCase() === 'IL' &&
    entry?.kind === 'city_hub' &&
    entry?.groupingPolicy === 'self' &&
    !entry?.parentId &&
    Boolean(clean(entry?.providerRefs?.googlePlaceId)) &&
    /[\u0590-\u05ff]/u.test(clean(entry?.names?.he)) &&
    Boolean(clean(entry?.names?.en)) &&
    hasCoordinates(entry?.center) &&
    hasGeometry(entry) &&
    [...types].some((type) => VERIFIED_LOCALITY_TYPES.has(type)) &&
    !types.has('natural_feature') &&
    !types.has('national_park') &&
    !types.has('park');
}

function hasVerifiedIlLocalityApproval(entry) {
  return entry?.approval?.approvedByPolicy === true &&
    entry.approval.policyId === VERIFIED_IL_LOCALITY_POLICY_ID &&
    isVerifiedIlLocalityEntry(entry) &&
    entry?.geometryPolicy?.autoMatchEligible === false &&
    entry?.geometryPolicy?.aliasAutoMatchEligible === false;
}

function buildVerifiedIlLocalityApproval({
  entry,
  countryId,
  destinationPath,
  approvalRevision,
  registryVersion,
  now = new Date(),
}) {
  if (!isVerifiedIlLocalityEntry(entry)) return null;
  const revision = Math.max(1, Math.trunc(Number(approvalRevision) || 1));
  const version = Math.max(1, Math.trunc(Number(registryVersion) || 1));
  const aliases = Array.from(new Set([
    entry.names.he,
    entry.names.en,
    ...(Array.isArray(entry.aliases) ? entry.aliases : []),
  ].map(clean).filter(Boolean)));
  const registryId = approvedRegistryId(entry);
  const registryEntry = {
    ...entry,
    id: registryId,
    countryCode: 'IL',
    aliases,
    kind: 'city_hub',
    parentId: null,
    groupingPolicy: 'self',
    registryVersion: version,
    destinationPath,
    status: 'active',
    geometryPolicy: {
      autoMatchEligible: false,
      aliasAutoMatchEligible: false,
      source: VERIFIED_IL_LOCALITY_POLICY_ID,
      version: 3,
    },
    approval: {
      approvedByAdmin: false,
      approvedByPolicy: true,
      policyId: VERIFIED_IL_LOCALITY_POLICY_ID,
      approvedBy: VERIFIED_IL_LOCALITY_ISSUER,
      approvedAt: now,
    },
    approvalRevision: revision,
  };
  const canonicalPolicy = {
    approved: true,
    registryId,
    ...(registryId !== entry.id ? { provisionalRegistryId: entry.id } : {}),
    kind: 'city_hub',
    parentId: null,
    groupingPolicy: 'self',
    aliases,
    provisional: false,
    reviewState: 'approved',
    registryVersion: version,
    approvalRevision: revision,
    registryAttestation: {
      approved: true,
      registryId,
      registryVersion: version,
      approvalRevision: revision,
      countryId,
      countryCode: 'IL',
      approvalMode: 'policy',
      policyId: VERIFIED_IL_LOCALITY_POLICY_ID,
      issuedBy: VERIFIED_IL_LOCALITY_ISSUER,
      issuedAt: now,
    },
    approvedBy: VERIFIED_IL_LOCALITY_ISSUER,
    approvedAt: now,
  };
  return { registryEntry, canonicalPolicy };
}

function destinationUsesVerifiedIlLocalityPolicy(destination) {
  const policy = destination?.canonicalPolicy || {};
  return policy.approved === true &&
    policy.registryAttestation?.approved === true &&
    policy.registryAttestation?.approvalMode === 'policy' &&
    policy.registryAttestation?.policyId === VERIFIED_IL_LOCALITY_POLICY_ID;
}

function canUpgradeVerifiedIlLocality(current, resolved, countryId = '') {
  return current?.status === 'active' &&
    current?.canonicalPolicy?.approved !== true &&
    current?.canonicalPolicy?.provisional === true &&
    (current.canonicalPolicy.registryId === resolved?.canonicalPolicy?.registryId ||
      current.canonicalPolicy.registryId === resolved?.canonicalPolicy?.provisionalRegistryId) &&
    clean(current?.providerRefs?.googlePlaceId) === clean(resolved?.providerRefs?.googlePlaceId) &&
    clean(countryId).toUpperCase() === 'IL' &&
    destinationUsesVerifiedIlLocalityPolicy(resolved);
}

function verifiedIlRegistryEntryMatches(current, planned) {
  if (!current || !planned) return false;
  return clean(current.countryCode).toUpperCase() === 'IL' &&
    clean(current.id) === clean(planned.id) &&
    clean(current.destinationPath) === clean(planned.destinationPath) &&
    clean(current.providerRefs?.googlePlaceId) === clean(planned.providerRefs?.googlePlaceId) &&
    clean(current.kind) === 'city_hub' &&
    clean(current.groupingPolicy) === 'self' &&
    hasVerifiedIlLocalityApproval(current);
}

module.exports = {
  VERIFIED_IL_LOCALITY_ISSUER,
  VERIFIED_IL_LOCALITY_POLICY_ID,
  VERIFIED_LOCALITY_TYPES,
  approvedRegistryId,
  buildVerifiedIlLocalityApproval,
  canUpgradeVerifiedIlLocality,
  destinationUsesVerifiedIlLocalityPolicy,
  hasVerifiedIlLocalityApproval,
  isVerifiedIlLocalityEntry,
  verifiedIlRegistryEntryMatches,
};
