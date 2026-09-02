const crypto = require('node:crypto');

const VERIFIED_IL_LOCALITY_POLICY_ID = 'verified-il-locality-v1';
const VERIFIED_IL_LOCALITY_ISSUER = 'system:verified-il-locality-policy';
const VERIFIED_PROVIDER_DESTINATION_POLICY_ID = 'verified-provider-destination-v1';
const VERIFIED_PROVIDER_DESTINATION_ISSUER = 'system:verified-provider-destination-policy';

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
  const countryCode = clean(entry?.countryCode).toLowerCase();
  const prefix = /^[a-z]{2}$/u.test(countryCode) ? countryCode : 'xx';
  const digest = crypto.createHash('sha256')
    .update(clean(entry?.providerRefs?.googlePlaceId))
    .digest('hex')
    .slice(0, 20);
  return `${prefix}-verified-${digest}`;
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

function kindMatchesProviderTypes(kind, googleTypes = []) {
  const types = new Set(Array.isArray(googleTypes) ? googleTypes : []);
  if (kind === 'city_hub') {
    return ['locality', 'postal_town', 'neighborhood', 'sublocality',
      'sublocality_level_1', 'administrative_area_level_3']
      .some((type) => types.has(type));
  }
  if (kind === 'island') return types.has('island') || types.has('archipelago');
  if (kind === 'province') {
    return types.has('administrative_area_level_1') ||
      types.has('administrative_area_level_2');
  }
  if (kind === 'natural_feature') {
    return types.has('natural_feature') || types.has('national_park') || types.has('park');
  }
  return kind === 'tourism_region' && types.has('colloquial_area');
}

function isVerifiedProviderDestinationEntry(entry) {
  return /^[A-Z]{2}$/u.test(clean(entry?.countryCode).toUpperCase()) &&
    ['city_hub', 'island', 'natural_feature', 'tourism_region', 'province'].includes(entry?.kind) &&
    entry?.groupingPolicy === 'self' &&
    !entry?.parentId &&
    Boolean(clean(entry?.providerRefs?.googlePlaceId)) &&
    /[\u0590-\u05ff]/u.test(clean(entry?.names?.he)) &&
    Boolean(clean(entry?.names?.en)) &&
    hasCoordinates(entry?.center) &&
    hasGeometry(entry) &&
    kindMatchesProviderTypes(entry.kind, entry.googleTypes);
}

function hasVerifiedProviderDestinationApproval(entry) {
  if (hasVerifiedIlLocalityApproval(entry)) return true;
  return entry?.approval?.approvedByPolicy === true &&
    entry.approval.policyId === VERIFIED_PROVIDER_DESTINATION_POLICY_ID &&
    isVerifiedProviderDestinationEntry(entry) &&
    entry?.geometryPolicy?.autoMatchEligible === false &&
    entry?.geometryPolicy?.aliasAutoMatchEligible === false;
}

function buildVerifiedProviderDestinationApproval({
  entry,
  countryId,
  destinationPath,
  approvalRevision,
  registryVersion,
  now = new Date(),
}) {
  if (!isVerifiedProviderDestinationEntry(entry)) return null;
  const revision = Math.max(1, Math.trunc(Number(approvalRevision) || 1));
  const version = Math.max(1, Math.trunc(Number(registryVersion) || 1));
  const countryCode = clean(entry.countryCode).toUpperCase();
  const aliases = Array.from(new Set([
    entry.names.he,
    entry.names.en,
    ...(Array.isArray(entry.aliases) ? entry.aliases : []),
  ].map(clean).filter(Boolean)));
  const registryId = approvedRegistryId(entry);
  const registryEntry = {
    ...entry,
    id: registryId,
    countryCode,
    aliases,
    parentId: null,
    groupingPolicy: 'self',
    registryVersion: version,
    destinationPath,
    status: 'active',
    geometryPolicy: {
      autoMatchEligible: false,
      aliasAutoMatchEligible: false,
      source: VERIFIED_PROVIDER_DESTINATION_POLICY_ID,
      version: 3,
    },
    approval: {
      approvedByAdmin: false,
      approvedByPolicy: true,
      policyId: VERIFIED_PROVIDER_DESTINATION_POLICY_ID,
      approvedBy: VERIFIED_PROVIDER_DESTINATION_ISSUER,
      approvedAt: now,
    },
    approvalRevision: revision,
  };
  const canonicalPolicy = {
    approved: true,
    registryId,
    ...(registryId !== entry.id ? { provisionalRegistryId: entry.id } : {}),
    kind: entry.kind,
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
      countryCode,
      approvalMode: 'policy',
      policyId: VERIFIED_PROVIDER_DESTINATION_POLICY_ID,
      issuedBy: VERIFIED_PROVIDER_DESTINATION_ISSUER,
      issuedAt: now,
    },
    approvedBy: VERIFIED_PROVIDER_DESTINATION_ISSUER,
    approvedAt: now,
  };
  return { registryEntry, canonicalPolicy };
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

function destinationUsesVerifiedProviderDestinationPolicy(destination) {
  const policy = destination?.canonicalPolicy || {};
  const policyId = policy.registryAttestation?.policyId;
  return policy.approved === true &&
    policy.registryAttestation?.approved === true &&
    policy.registryAttestation?.approvalMode === 'policy' &&
    [VERIFIED_IL_LOCALITY_POLICY_ID, VERIFIED_PROVIDER_DESTINATION_POLICY_ID].includes(policyId);
}

function canUpgradeVerifiedProviderDestination(current, resolved, countryId = '') {
  const currentRegistryId = clean(current?.canonicalPolicy?.registryId);
  const resolvedRegistryIds = new Set([
    clean(resolved?.canonicalPolicy?.registryId),
    clean(resolved?.canonicalPolicy?.provisionalRegistryId),
  ].filter(Boolean));
  const currentCountryId = clean(countryId);
  const attestedCountryId = clean(resolved?.canonicalPolicy?.registryAttestation?.countryId);
  const currentPolicy = current?.canonicalPolicy || {};
  const provisionalPolicy = currentPolicy.approved !== true && currentPolicy.provisional === true;
  const legacySeedPolicy = currentPolicy.approved === true &&
    !currentPolicy.registryAttestation &&
    !Number(currentPolicy.approvalRevision || 0);
  return current?.status === 'active' &&
    (provisionalPolicy || legacySeedPolicy) &&
    resolvedRegistryIds.has(currentRegistryId) &&
    clean(current?.providerRefs?.googlePlaceId) === clean(resolved?.providerRefs?.googlePlaceId) &&
    (!currentCountryId || currentCountryId === attestedCountryId) &&
    destinationUsesVerifiedProviderDestinationPolicy(resolved);
}

function canUpgradeVerifiedProviderRegistryEntry(current, planned) {
  if (!current || !planned || current?.approval?.approvedByAdmin === true) return false;
  return clean(current.id) === clean(planned.id) &&
    clean(current.countryCode).toUpperCase() === clean(planned.countryCode).toUpperCase() &&
    current.status !== 'inactive' &&
    (!clean(current.destinationPath) ||
      clean(current.destinationPath) === clean(planned.destinationPath)) &&
    clean(current.providerRefs?.googlePlaceId) === clean(planned.providerRefs?.googlePlaceId) &&
    clean(current.kind) === clean(planned.kind) &&
    clean(current.groupingPolicy) === clean(planned.groupingPolicy);
}

function verifiedProviderRegistryEntryMatches(current, planned) {
  if (!current || !planned) return false;
  return clean(current.countryCode).toUpperCase() === clean(planned.countryCode).toUpperCase() &&
    clean(current.id) === clean(planned.id) &&
    clean(current.destinationPath) === clean(planned.destinationPath) &&
    clean(current.providerRefs?.googlePlaceId) === clean(planned.providerRefs?.googlePlaceId) &&
    clean(current.kind) === clean(planned.kind) &&
    clean(current.groupingPolicy) === clean(planned.groupingPolicy) &&
    hasVerifiedProviderDestinationApproval(current);
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
  VERIFIED_PROVIDER_DESTINATION_ISSUER,
  VERIFIED_PROVIDER_DESTINATION_POLICY_ID,
  VERIFIED_LOCALITY_TYPES,
  approvedRegistryId,
  buildVerifiedProviderDestinationApproval,
  buildVerifiedIlLocalityApproval,
  canUpgradeVerifiedProviderRegistryEntry,
  canUpgradeVerifiedProviderDestination,
  canUpgradeVerifiedIlLocality,
  destinationUsesVerifiedProviderDestinationPolicy,
  destinationUsesVerifiedIlLocalityPolicy,
  hasVerifiedProviderDestinationApproval,
  hasVerifiedIlLocalityApproval,
  isVerifiedProviderDestinationEntry,
  isVerifiedIlLocalityEntry,
  kindMatchesProviderTypes,
  verifiedProviderRegistryEntryMatches,
  verifiedIlRegistryEntryMatches,
};
