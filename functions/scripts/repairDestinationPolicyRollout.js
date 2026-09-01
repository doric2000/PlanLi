/* eslint-disable no-console */
const crypto = require('node:crypto');
const admin = require('firebase-admin');

const { audit } = require('../adminService');
const {
  clearRegistryCache,
  canonicalDestinationId,
  derivedRadiusKm,
  REGISTRY_PATH,
  REGISTRY_VERSION,
  validateRegistryEntry,
} = require('../canonicalDestinationRegistry');
const {
  approvedRegistryId,
  buildVerifiedIlLocalityApproval,
  canUpgradeVerifiedIlLocality,
  verifiedIlRegistryEntryMatches,
} = require('../destinationApprovalPolicy');
const {
  destinationCoordinates,
  destinationReviewStatus,
  evaluateAndPersistDestination,
  heldForPendingDestination,
  qualityIssues,
  releaseDestinationPendingContent,
} = require('../destinationAdminService');
const { syncDestinationCatalog } = require('../destinationCatalogService');
const { resolveIsraelPolicy } = require('../countryGeography');
const { discoveryRegionForCountry } = require('../discoveryRegions');
const {
  jobRef: reassignmentJobRef,
  previewDestinationReassignment,
  processDestinationReassignmentJob,
  startDestinationReassignment,
} = require('../destinationReassignmentService');
const { provisionalRegistryId } = require('../destinationResolutionPolicy');
const { destinationClaimId } = require('../destinationV3Service');
const { destinationAcceptsNewReferences } = require('../destinationReferencePolicy');
const { initializeAdmin } = require('./localCredentials');

const PROJECT_ID = 'planli-f0b12';
const DESTINATION_PATH = /^countries\/([^/]+)\/destinations\/([^/]+)$/u;
const CONTENT_COLLECTIONS = ['recommendations', 'routes', 'trips'];

function fail(message) {
  throw new Error(message);
}

function valueAfter(argv, name) {
  const inline = argv.find((argument) => argument.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1).trim();
  const index = argv.indexOf(name);
  return index >= 0 ? String(argv[index + 1] || '').trim() : '';
}

function parseOptions(argv = process.argv.slice(2)) {
  const known = new Set([
    '--apply', '--confirm-project', '--fingerprint', '--requested-by', '--reason',
  ]);
  argv.forEach((argument, index) => {
    if (!argument.startsWith('--')) return;
    const name = argument.split('=')[0];
    if (!known.has(name)) fail(`Unknown argument: ${argument}`);
    if (name !== '--apply' && !argument.includes('=') && !argv[index + 1]) {
      fail(`${name} requires a value.`);
    }
  });
  const options = {
    apply: argv.includes('--apply'),
    confirmProject: valueAfter(argv, '--confirm-project'),
    fingerprint: valueAfter(argv, '--fingerprint'),
    requestedBy: valueAfter(argv, '--requested-by'),
    reason: valueAfter(argv, '--reason') || 'Destination policy rollout repair',
  };
  if (options.reason.length < 3 || options.reason.length > 500) fail('--reason is invalid.');
  return options;
}

function timestampMillis(value) {
  if (typeof value?.toMillis === 'function') return value.toMillis();
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function snapshotVersion(snapshot) {
  return snapshot?.exists ? timestampMillis(snapshot.updateTime) : 0;
}

function reassignmentRef(value) {
  return {
    countryId: String(value?.countryId || '').trim(),
    cityId: String(value?.cityId || '').trim(),
  };
}

function reviewId(countryId, cityId) {
  return crypto.createHash('sha256').update(`${countryId}\n${cityId}`).digest('base64url');
}

function localityEntryFromDestination({ destination, countryCode, registryId }) {
  const coordinates = destinationCoordinates(destination);
  const names = destination.googleCache?.names || destination.identity?.names || {};
  const viewport = destination.googleCache?.viewport || destination.identity?.viewport || null;
  const entry = {
    id: registryId,
    countryCode,
    names: { he: names.he || '', en: names.en || '' },
    aliases: Array.from(new Set([
      names.he,
      names.en,
      ...(Array.isArray(destination.canonicalPolicy?.aliases)
        ? destination.canonicalPolicy.aliases : []),
    ].map((value) => String(value || '').trim()).filter(Boolean))),
    kind: 'city_hub',
    parentId: null,
    groupingPolicy: 'self',
    center: coordinates,
    ...(viewport ? { viewport } : {}),
    providerRefs: {
      googlePlaceId: destination.providerRefs?.googlePlaceId || destination.googleCache?.placeId || '',
    },
    googleTypes: destination.googleCache?.types || destination.identity?.types || [],
    registryVersion: REGISTRY_VERSION,
  };
  if (!viewport && coordinates) entry.radiusKm = derivedRadiusKm(entry);
  return entry;
}

function claimPathFor(countryId, destination) {
  const nameEn = destination?.googleCache?.names?.en || destination?.identity?.names?.en || '';
  if (!nameEn) return '';
  return `system/runtime/destinationClaims/${destinationClaimId({
    countryId,
    type: destination.destinationType || 'city',
    nameEn,
  })}`;
}

function claimConflict(claim, cityId, placeId) {
  if (!claim) return '';
  const conflicting = Object.entries(claim.entries || {}).find(([id, entry]) =>
    id !== cityId && entry?.providerPlaceId === placeId
  );
  if (conflicting) return `claim_owned_by:${conflicting[0]}`;
  if (claim.providerPlaceId === placeId && claim.destinationId && claim.destinationId !== cityId) {
    return `legacy_claim_owned_by:${claim.destinationId}`;
  }
  return '';
}

function registryCompatible(snapshot, planned) {
  if (!snapshot?.exists) return true;
  const current = { id: snapshot.id, ...(snapshot.data() || {}) };
  if (verifiedIlRegistryEntryMatches(current, planned)) return true;
  return current.id === planned.id && current.countryCode === 'IL' &&
    current.status !== 'inactive' &&
    (!current.destinationPath || current.destinationPath === planned.destinationPath) &&
    current.providerRefs?.googlePlaceId === planned.providerRefs?.googlePlaceId &&
    current.kind === 'city_hub' && current.groupingPolicy === 'self' &&
    current.approval?.approvedByAdmin !== true;
}

function destinationPlan({
  sourceSnapshot,
  sourceCountry,
  targetCountry,
  targetSnapshot,
  registrySnapshot,
  claimSnapshot,
}) {
  const source = sourceSnapshot.data() || {};
  const sourceMatch = sourceSnapshot.ref.path.match(DESTINATION_PATH);
  if (!sourceMatch || source.status !== 'active' || source.canonicalPolicy?.approved === true ||
      source.canonicalPolicy?.provisional !== true) return null;
  const [, sourceCountryId, sourceCityId] = sourceMatch;
  const sourceCountryCode = String(sourceCountry?.code || sourceCountryId).toUpperCase();
  if (sourceCountry?.status !== 'active') return null;
  const coordinates = destinationCoordinates(source);
  const policyCountry = coordinates ? resolveIsraelPolicy(coordinates) : null;
  const crossCountry = sourceCountryCode !== 'IL' && policyCountry?.countryCode === 'IL';
  if (sourceCountryCode !== 'IL' && !crossCountry) return null;
  if (!targetCountry?.id || targetCountry.status !== 'active' ||
      String(targetCountry.code || '').toUpperCase() !== 'IL') return {
    blocker: `${sourceSnapshot.ref.path}:missing_il_country`,
  };

  const placeId = source.providerRefs?.googlePlaceId || source.googleCache?.placeId || '';
  const registryId = crossCountry
    ? provisionalRegistryId('IL', placeId)
    : source.canonicalPolicy?.registryId;
  const targetCountryId = targetCountry.id;
  const targetCityId = crossCountry
    ? canonicalDestinationId(targetCountryId, registryId)
    : sourceCityId;
  const destinationPath = `countries/${targetCountryId}/destinations/${targetCityId}`;
  const entry = localityEntryFromDestination({ destination: source, countryCode: 'IL', registryId });
  const approval = buildVerifiedIlLocalityApproval({
    entry,
    countryId: targetCountryId,
    destinationPath,
    approvalRevision: Number((targetSnapshot?.data() || source).canonicalPolicy?.approvalRevision || 0) + 1,
    registryVersion: REGISTRY_VERSION,
  });
  if (!approval) return null;
  const validation = validateRegistryEntry(approval.registryEntry);
  if (!validation.valid) return { blocker: `${sourceSnapshot.ref.path}:${validation.errors[0]}` };

  const existingTarget = targetSnapshot?.exists ? targetSnapshot.data() || {} : null;
  if (crossCountry && existingTarget &&
      existingTarget.providerRefs?.googlePlaceId !== placeId) {
    return { blocker: `${destinationPath}:target_provider_conflict` };
  }
  if (!registryCompatible(registrySnapshot, approval.registryEntry)) {
    return { blocker: `${REGISTRY_PATH}/${registryId}:registry_conflict` };
  }
  const claim = claimSnapshot?.exists ? claimSnapshot.data() || {} : null;
  const claimIssue = claimConflict(claim, targetCityId, placeId);
  if (claimIssue) return { blocker: `${claimSnapshot.ref.path}:${claimIssue}` };

  const base = crossCountry ? source : (existingTarget || source);
  const observedProviderCountryCode = String(
    base.googleCache?.countryCode || base.identity?.countryCode || ''
  ).toUpperCase();
  const targetData = {
    ...base,
    countryId: targetCountryId,
    destinationType: 'city',
    discoveryRegionId: discoveryRegionForCountry('IL'),
    providerRefs: { ...(base.providerRefs || {}), googlePlaceId: placeId },
    googleCache: {
      ...(base.googleCache || {}),
      countryCode: 'IL',
      ...(observedProviderCountryCode && observedProviderCountryCode !== 'IL'
        ? { providerCountryCode: observedProviderCountryCode }
        : {}),
    },
    ...(base.identity || crossCountry ? {
      identity: {
        ...(base.identity || {}),
        countryCode: 'IL',
        ...(observedProviderCountryCode && observedProviderCountryCode !== 'IL'
          ? { providerCountryCode: observedProviderCountryCode }
          : {}),
        countryPolicy: 'israel-policy',
      },
    } : {}),
    canonicalPolicy: approval.canonicalPolicy,
    publicationFence: {
      state: 'complete',
      reason: 'verified_il_locality',
      approvalRevision: approval.canonicalPolicy.approvalRevision,
      completedAt: approval.canonicalPolicy.approvedAt,
    },
    status: 'active',
    ...(crossCountry ? { stats: { recommendationCount: 0 } } : {}),
  };
  delete targetData.reassignment;
  delete targetData.mergedInto;
  const claimPath = claimSnapshot?.ref?.path || claimPathFor(targetCountryId, targetData);
  return {
    source: { countryId: sourceCountryId, cityId: sourceCityId, path: sourceSnapshot.ref.path },
    target: { countryId: targetCountryId, cityId: targetCityId, path: destinationPath },
    crossCountry,
    placeId,
    sourceVersion: snapshotVersion(sourceSnapshot),
    targetVersion: snapshotVersion(targetSnapshot),
    registryVersion: snapshotVersion(registrySnapshot),
    claimVersion: snapshotVersion(claimSnapshot),
    registryPath: `${REGISTRY_PATH}/${approval.registryEntry.id}`,
    claimPath,
    targetData,
    registryData: approval.registryEntry,
    claimData: {
      countryId: targetCountryId,
      destinationType: targetData.destinationType,
      nameEn: targetData.googleCache?.names?.en || '',
      entries: { [targetCityId]: { providerPlaceId: placeId } },
    },
  };
}

function manifestPlan(plan) {
  return {
    source: plan.source,
    target: plan.target,
    crossCountry: plan.crossCountry,
    placeId: plan.placeId,
    registryPath: plan.registryPath,
    claimPath: plan.claimPath,
    sourceVersion: plan.sourceVersion,
    targetVersion: plan.targetVersion,
    registryVersion: plan.registryVersion,
    claimVersion: plan.claimVersion,
    approvalRevision: plan.targetData.canonicalPolicy.approvalRevision,
  };
}

function manifestFingerprint(manifest) {
  return crypto.createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
}

async function loadState(db) {
  const countriesSnapshot = await db.collection('countries').get();
  const countries = countriesSnapshot.docs.map((snapshot) => ({
    id: snapshot.id,
    snapshot,
    data: snapshot.data() || {},
  }));
  const destinationGroups = await Promise.all(countries.map((country) =>
    country.snapshot.ref.collection('destinations').get()
  ));
  const destinations = destinationGroups.flatMap((snapshot) => snapshot.docs);
  const [reviews, jobs, registries, claims, ...contentSnapshots] = await Promise.all([
    db.collection('system/moderation/destinationReviews').get(),
    db.collection('system/runtime/destinationJobs').get(),
    db.collection(REGISTRY_PATH).get(),
    db.collection('system/runtime/destinationClaims').get(),
    ...CONTENT_COLLECTIONS.map((collection) => db.collection(collection).get()),
  ]);
  return {
    countries,
    destinations,
    reviews: new Map(reviews.docs.map((snapshot) => [snapshot.ref.path, snapshot])),
    jobs: new Map(jobs.docs.map((snapshot) => [snapshot.ref.path, snapshot])),
    registries: new Map(registries.docs.map((snapshot) => [snapshot.ref.path, snapshot])),
    claims: new Map(claims.docs.map((snapshot) => [snapshot.ref.path, snapshot])),
    content: contentSnapshots.flatMap((snapshot) => snapshot.docs),
  };
}

function buildRolloutPlan(state) {
  const countryById = new Map(state.countries.map((country) => [country.id, country]));
  const ilCountry = state.countries.find((country) =>
    String(country.data.code || '').toUpperCase() === 'IL' && country.data.status === 'active'
  );
  const destinationByPath = new Map(state.destinations.map((snapshot) => [snapshot.ref.path, snapshot]));
  const provisionalPlans = [];
  const blockers = [];

  for (const sourceSnapshot of state.destinations) {
    const match = sourceSnapshot.ref.path.match(DESTINATION_PATH);
    if (!match) continue;
    const sourceCountry = countryById.get(match[1]);
    const source = sourceSnapshot.data() || {};
    const placeId = source.providerRefs?.googlePlaceId || source.googleCache?.placeId || '';
    const sourceCountryCode = String(sourceCountry?.data?.code || match[1]).toUpperCase();
    const crossCountry = sourceCountryCode !== 'IL' &&
      resolveIsraelPolicy(destinationCoordinates(source))?.countryCode === 'IL';
    const registryId = crossCountry
      ? provisionalRegistryId('IL', placeId)
      : source.canonicalPolicy?.registryId;
    const targetCityId = crossCountry && ilCountry
      ? canonicalDestinationId(ilCountry.id, registryId)
      : match[2];
    const targetPath = ilCountry
      ? `countries/${ilCountry.id}/destinations/${targetCityId}`
      : '';
    const targetSnapshot = targetPath ? destinationByPath.get(targetPath) : null;
    const provisionalEntry = registryId
      ? localityEntryFromDestination({ destination: source, countryCode: 'IL', registryId })
      : null;
    const provisionalClaimPath = ilCountry && provisionalEntry
      ? claimPathFor(ilCountry.id, {
          ...source,
          countryId: ilCountry.id,
          destinationType: 'city',
          googleCache: { ...(source.googleCache || {}), countryCode: 'IL' },
        })
      : '';
    const plan = destinationPlan({
      sourceSnapshot,
      sourceCountry: sourceCountry?.data,
      targetCountry: ilCountry ? { id: ilCountry.id, ...ilCountry.data } : null,
      targetSnapshot,
      registrySnapshot: provisionalEntry
        ? state.registries.get(`${REGISTRY_PATH}/${approvedRegistryId(provisionalEntry)}`) : null,
      claimSnapshot: provisionalClaimPath ? state.claims.get(provisionalClaimPath) : null,
    });
    if (plan?.blocker) blockers.push(plan.blocker);
    else if (plan) provisionalPlans.push(plan);
  }

  const futureApprovedPaths = new Set(provisionalPlans.map((plan) => plan.target.path));
  const approvedPaths = new Set(state.destinations.filter((snapshot) => {
    const match = snapshot.ref.path.match(DESTINATION_PATH);
    return match && destinationAcceptsNewReferences(snapshot.data() || {}, match[1]);
  }).map((snapshot) => snapshot.ref.path));
  futureApprovedPaths.forEach((path) => approvedPaths.add(path));

  const holds = [];
  for (const snapshot of state.content) {
    const content = snapshot.data() || {};
    if (content.status !== 'moderation_hold' ||
        content.moderation?.systemGate !== 'destination_pending_approval') continue;
    const matched = [...approvedPaths].find((path) => {
      const match = path.match(DESTINATION_PATH);
      return match && heldForPendingDestination(content, match[1], match[2]);
    });
    if (matched) {
      holds.push({
        path: snapshot.ref.path,
        version: snapshotVersion(snapshot),
        destinationPath: matched,
        holdReason: content.moderation?.holdReason || null,
      });
      continue;
    }
    const crossPlan = provisionalPlans.find((plan) => plan.crossCountry &&
      heldForPendingDestination(content, plan.source.countryId, plan.source.cityId));
    if (crossPlan) {
      holds.push({
        path: snapshot.ref.path,
        version: snapshotVersion(snapshot),
        destinationPath: crossPlan.target.path,
        sourceDestinationPath: crossPlan.source.path,
        holdReason: content.moderation?.holdReason || null,
      });
    }
  }

  const reviewRepairs = [];
  for (const destinationSnapshot of state.destinations) {
    const match = destinationSnapshot.ref.path.match(DESTINATION_PATH);
    if (!match) continue;
    const [, countryId, cityId] = match;
    const reviewPath = `system/moderation/destinationReviews/${reviewId(countryId, cityId)}`;
    const reviewSnapshot = state.reviews.get(reviewPath);
    const jobSnapshot = state.jobs.get(`system/runtime/destinationJobs/${countryId}_${cityId}`);
    const destination = { ...(destinationSnapshot.data() || {}), countryId };
    const issues = qualityIssues(
      destination,
      jobSnapshot?.data() || {},
      reviewSnapshot?.data() || {}
    );
    const desiredStatus = destinationReviewStatus(destination, issues);
    if (reviewSnapshot?.data()?.status !== desiredStatus) {
      reviewRepairs.push({
        destinationPath: destinationSnapshot.ref.path,
        destinationVersion: snapshotVersion(destinationSnapshot),
        reviewPath,
        reviewVersion: snapshotVersion(reviewSnapshot),
        currentStatus: reviewSnapshot?.data()?.status || null,
        desiredStatus,
        issueCodes: issues.map((issue) => issue.code),
      });
    }
  }

  const manifest = {
    version: 1,
    projectId: PROJECT_ID,
    generatedFromLiveState: true,
    provisionalUpgrades: provisionalPlans.map(manifestPlan)
      .sort((left, right) => left.source.path.localeCompare(right.source.path)),
    holds: holds.sort((left, right) => left.path.localeCompare(right.path)),
    reviewRepairs: reviewRepairs.sort((left, right) =>
      left.destinationPath.localeCompare(right.destinationPath)),
    blockers: [...new Set(blockers)].sort(),
  };
  return { manifest, provisionalPlans };
}

function assertApplyAllowed(options, manifest, fingerprint) {
  if (options.confirmProject !== PROJECT_ID) {
    fail(`Apply refused. Pass --confirm-project=${PROJECT_ID}.`);
  }
  if (!/^[0-9a-f]{64}$/u.test(options.fingerprint) || options.fingerprint !== fingerprint) {
    fail('Apply refused. The live dry-run fingerprint is missing or no longer matches.');
  }
  if (!options.requestedBy) fail('Apply refused. --requested-by is required.');
  if (manifest.blockers.length) fail(`Apply refused. Resolve blockers: ${manifest.blockers.join(', ')}`);
}

async function assertProductionAdmin(adminImpl, requestedBy) {
  const [user, registry] = await Promise.all([
    adminImpl.auth().getUser(requestedBy),
    adminImpl.firestore().doc(`system/moderation/admins/${requestedBy}`).get(),
  ]);
  if (user.customClaims?.admin !== true || registry.data()?.active !== true) {
    fail('requestedBy is not an active PlanLi administrator.');
  }
  return user;
}

async function applyDestinationPlan({ db, adminImpl, plan }) {
  const targetRef = db.doc(plan.target.path);
  const sourceRef = db.doc(plan.source.path);
  const registryRef = db.doc(plan.registryPath);
  const claimRef = db.doc(plan.claimPath);
  await db.runTransaction(async (transaction) => {
    const [sourceSnapshot, targetSnapshot, registrySnapshot, claimSnapshot] = await Promise.all([
      transaction.get(sourceRef),
      plan.source.path === plan.target.path ? transaction.get(sourceRef) : transaction.get(targetRef),
      transaction.get(registryRef),
      transaction.get(claimRef),
    ]);
    if (snapshotVersion(sourceSnapshot) !== plan.sourceVersion ||
        snapshotVersion(targetSnapshot) !== plan.targetVersion ||
        snapshotVersion(registrySnapshot) !== plan.registryVersion ||
        snapshotVersion(claimSnapshot) !== plan.claimVersion) {
      fail(`Destination plan changed after dry-run: ${plan.source.path}`);
    }
    if (!sourceSnapshot.exists || sourceSnapshot.data()?.status !== 'active') {
      fail(`Source destination is no longer active: ${plan.source.path}`);
    }
    if (plan.crossCountry && targetSnapshot.exists &&
        targetSnapshot.data()?.providerRefs?.googlePlaceId !== plan.placeId) {
      fail(`Target destination identity changed: ${plan.target.path}`);
    }
    if (!registryCompatible(registrySnapshot, plan.registryData)) {
      fail(`Registry identity changed: ${plan.registryPath}`);
    }
    const currentClaim = claimSnapshot.exists ? claimSnapshot.data() || {} : null;
    const claimIssue = claimConflict(currentClaim, plan.target.cityId, plan.placeId);
    if (claimIssue) fail(`Claim identity changed: ${plan.claimPath}:${claimIssue}`);

    const timestamp = adminImpl.firestore.FieldValue.serverTimestamp();
    if (targetSnapshot.exists) {
      const current = targetSnapshot.data() || {};
      if (!destinationAcceptsUpgrade(current, plan.targetData, plan.target.countryId)) {
        fail(`Target destination cannot be upgraded: ${plan.target.path}`);
      }
      transaction.set(targetRef, {
        countryId: plan.targetData.countryId,
        destinationType: plan.targetData.destinationType,
        discoveryRegionId: plan.targetData.discoveryRegionId,
        providerRefs: plan.targetData.providerRefs,
        googleCache: plan.targetData.googleCache,
        canonicalPolicy: plan.targetData.canonicalPolicy,
        publicationFence: plan.targetData.publicationFence,
        status: 'active',
        updatedAt: timestamp,
      }, { merge: true });
    } else {
      transaction.create(targetRef, {
        ...plan.targetData,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }
    transaction.set(registryRef, {
      ...plan.registryData,
      ...(registrySnapshot.exists ? {} : { createdAt: timestamp }),
      updatedAt: timestamp,
    }, { merge: true });
    transaction.set(claimRef, {
      ...plan.claimData,
      entries: {
        ...(currentClaim?.entries || {}),
        ...plan.claimData.entries,
      },
      ...(claimSnapshot.exists ? {} : { createdAt: timestamp }),
      updatedAt: timestamp,
    }, { merge: true });
  });
  const snapshot = await targetRef.get();
  await syncDestinationCatalog({
    admin: adminImpl,
    countryId: plan.target.countryId,
    cityId: plan.target.cityId,
    city: snapshot.data() || {},
  });
}

function destinationAcceptsUpgrade(current, planned, countryId) {
  return (current?.canonicalPolicy?.approved === true &&
      current.canonicalPolicy.registryId === planned?.canonicalPolicy?.registryId &&
      current?.providerRefs?.googlePlaceId === planned?.providerRefs?.googlePlaceId) ||
    canUpgradeVerifiedIlLocality(current, planned, countryId);
}

async function finishReassignment({ adminImpl, plan, requestedBy, reason }) {
  const db = adminImpl.firestore();
  const sourceSnapshot = await db.doc(plan.source.path).get();
  if (sourceSnapshot.data()?.status === 'inactive' &&
      sourceSnapshot.data()?.mergedInto?.countryId === plan.target.countryId &&
      sourceSnapshot.data()?.mergedInto?.cityId === plan.target.cityId) return;
  const source = reassignmentRef(plan.source);
  const target = reassignmentRef(plan.target);
  const preview = await previewDestinationReassignment({
    db,
    source,
    target,
  });
  const queued = await startDestinationReassignment({
    admin: adminImpl,
    source,
    target,
    expectedImpactHash: preview.impactHash,
    reason,
    requestedBy,
  });
  const ref = reassignmentJobRef(db, queued.jobId);
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const snapshot = await ref.get();
    if (snapshot.data()?.status === 'complete') return;
    if (snapshot.data()?.status === 'failed') fail(`Reassignment failed: ${queued.jobId}`);
    await processDestinationReassignmentJob({ admin: adminImpl, jobId: queued.jobId, pageSize: 25 });
  }
  fail(`Reassignment did not complete within the bounded repair loop: ${queued.jobId}`);
}

async function runRolloutRepair({ adminImpl = admin, options }) {
  const db = adminImpl.firestore();
  const state = await loadState(db);
  const { manifest, provisionalPlans } = buildRolloutPlan(state);
  const fingerprint = manifestFingerprint(manifest);
  const report = {
    mode: options.apply ? 'apply' : 'dry-run',
    projectId: PROJECT_ID,
    fingerprint,
    provisionalUpgrades: manifest.provisionalUpgrades.length,
    crossCountryReassignments: manifest.provisionalUpgrades.filter((entry) => entry.crossCountry).length,
    eligibleHolds: manifest.holds.length,
    reviewRepairs: manifest.reviewRepairs.length,
    blockers: manifest.blockers,
    manifest,
  };
  if (!options.apply) return report;

  assertApplyAllowed(options, manifest, fingerprint);
  const actor = await assertProductionAdmin(adminImpl, options.requestedBy);
  for (const plan of provisionalPlans) {
    await applyDestinationPlan({ db, adminImpl, plan });
  }
  clearRegistryCache();
  for (const plan of provisionalPlans.filter((entry) => entry.crossCountry)) {
    await finishReassignment({
      adminImpl,
      plan,
      requestedBy: options.requestedBy,
      reason: options.reason,
    });
  }

  const releasePaths = new Set(manifest.holds.map((entry) => entry.destinationPath));
  for (const path of releasePaths) {
    const match = path.match(DESTINATION_PATH);
    if (!match) continue;
    await releaseDestinationPendingContent({
      admin: adminImpl,
      countryId: match[1],
      cityId: match[2],
    });
  }

  const reviewPaths = new Set([
    ...manifest.reviewRepairs.map((entry) => entry.destinationPath),
    ...provisionalPlans.map((entry) => entry.target.path),
  ]);
  for (const path of reviewPaths) {
    const match = path.match(DESTINATION_PATH);
    if (!match) continue;
    await evaluateAndPersistDestination({ admin: adminImpl, countryId: match[1], cityId: match[2] });
  }

  await audit({
    admin: adminImpl,
    auth: { uid: options.requestedBy, token: { admin: true, name: actor.displayName || '' } },
    action: 'destination_policy_rollout_repaired',
    target: { type: 'system', id: 'destination-policy-rollout' },
    reason: options.reason,
    metadata: {
      fingerprint,
      provisionalUpgrades: manifest.provisionalUpgrades.length,
      crossCountryReassignments: manifest.provisionalUpgrades.filter((entry) => entry.crossCountry).length,
      eligibleHolds: manifest.holds.length,
      reviewRepairs: manifest.reviewRepairs.length,
    },
  });

  const after = buildRolloutPlan(await loadState(db)).manifest;
  if (after.holds.length || after.provisionalUpgrades.length || after.reviewRepairs.length || after.blockers.length) {
    fail(`Post-apply verification found remaining work: ${JSON.stringify({
      holds: after.holds.length,
      provisionalUpgrades: after.provisionalUpgrades.length,
      reviewRepairs: after.reviewRepairs.length,
      blockers: after.blockers,
    })}`);
  }
  return { ...report, applied: true, verified: true, after };
}

async function main() {
  const options = parseOptions();
  initializeAdmin(admin, { projectId: PROJECT_ID });
  if (admin.app().options.projectId !== PROJECT_ID) fail(`Active Firebase project must be ${PROJECT_ID}.`);
  const result = await runRolloutRepair({ adminImpl: admin, options });
  console.log(JSON.stringify(result, null, 2));
  if (!options.apply) {
    console.log(`DRY RUN ONLY. Apply requires --apply --confirm-project=${PROJECT_ID} ` +
      `--fingerprint=${result.fingerprint} --requested-by=<active-admin-uid>`);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  }).finally(() => admin.apps.length ? admin.app().delete() : undefined);
}

module.exports = {
  PROJECT_ID,
  assertApplyAllowed,
  buildRolloutPlan,
  claimConflict,
  destinationPlan,
  localityEntryFromDestination,
  manifestFingerprint,
  parseOptions,
  reassignmentRef,
  registryCompatible,
  runRolloutRepair,
};
