const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildApprovedCanonicalPolicy,
  buildDestinationPolicyRegistryPlan,
  canonicalApprovalBindingIssues,
  destinationPolicyRegistryBindingIssue,
  destinationApprovalHasConflictingFence,
  destinationCanEnterAdminApproval,
  qualityIssues,
  holdDestinationContentDocuments,
  releaseDestinationPendingContent,
  listDestinationReviews,
  notifyAdminsOfDestination,
  publicationFenceReadyForRecovery,
  quarantineDestinationPublicationFenceForManualRecovery,
  destinationCoordinates,
  selectAirportByIataCode,
  selectDestinationPolicyRegistryBinding,
  syncDestinationAirport,
} = require('./destinationAdminService');
const { nearestScheduledAirports } = require('./airportFacts');
const { validateRegistryEntry } = require('./canonicalDestinationRegistry');

function validDestination() {
  return {
    status: 'active',
    canonicalPolicy: {
      approved: true, registryId: 'il-tel-aviv', kind: 'city_hub', groupingPolicy: 'self',
      registryVersion: 3, approvalRevision: 1,
      registryAttestation: {
        approved: true, registryId: 'il-tel-aviv', registryVersion: 3,
        approvalRevision: 1, countryId: 'IL',
      },
    },
    providerRefs: { googlePlaceId: 'place-1' },
    googleCache: {
      names: { he: 'תל אביב', en: 'Tel Aviv' },
      countryCode: 'IL',
      coordinates: { lat: 32.08, lng: 34.78 },
      expiresAt: new Date('2030-01-01T00:00:00Z'),
    },
    identity: { countryCode: 'IL' },
    destinationImage: {
      source: { type: 'unsplash' },
      urls: { large: 'https://example.com/l', feed: 'https://example.com/f', thumb: 'https://example.com/t' },
      attribution: { providerName: 'Unsplash' },
      selection: { validation: { version: 1 } },
    },
    travelFacts: { closestAirport: { iataCode: 'TLV' } },
  };
}

test('legacy approved destinations can enter admin approval only before an attestation exists', () => {
  const legacy = validDestination();
  delete legacy.canonicalPolicy.reviewState;
  delete legacy.canonicalPolicy.approvalRevision;
  delete legacy.canonicalPolicy.registryAttestation;
  assert.equal(destinationCanEnterAdminApproval(legacy), true);

  legacy.canonicalPolicy.reviewState = 'pending';
  assert.equal(destinationCanEnterAdminApproval(legacy), false);
  legacy.canonicalPolicy.reviewState = '';
  legacy.canonicalPolicy.registryAttestation = { approved: false };
  assert.equal(destinationCanEnterAdminApproval(legacy), false);
});

test('admin approval cannot overwrite an in-progress destination publication fence', () => {
  assert.equal(destinationApprovalHasConflictingFence({
    publicationFence: { state: 'draining', operationId: 'deactivate-1' },
  }), true);
  assert.equal(destinationApprovalHasConflictingFence({
    publicationFence: { state: 'awaiting_admin_finalize', operationId: 'deactivate-1' },
  }), true);
  assert.equal(destinationApprovalHasConflictingFence({
    publicationFence: { state: 'manual_review_required', operationId: 'deactivate-1' },
  }), true);
  assert.equal(destinationApprovalHasConflictingFence({
    publicationFence: { state: 'complete', operationId: 'policy-1' },
  }), false);
  assert.equal(destinationApprovalHasConflictingFence({
    publicationFence: { state: 'approved' },
  }), false);
});

test('publication recovery ignores a live operation and only quarantines stale fences', () => {
  const now = Date.parse('2026-08-30T12:00:00Z');
  assert.equal(publicationFenceReadyForRecovery({
    fencedAt: new Date(now - 9 * 60 * 1000),
  }, now), false);
  assert.equal(publicationFenceReadyForRecovery({
    fencedAt: { toMillis: () => now - 10 * 60 * 1000 },
  }, now), true);
  assert.equal(publicationFenceReadyForRecovery({}, now), true);
});

test('destination approval release refuses a destination while its publication fence drains', async () => {
  const destination = validDestination();
  destination.publicationFence = { state: 'draining', reason: 'destination_inactive' };
  const db = {
    doc(path) {
      return {
        path,
        get: async () => path === 'countries/IL'
          ? { exists: true, data: () => ({ status: 'active' }) }
          : { exists: true, data: () => destination },
      };
    },
  };
  await assert.rejects(
    releaseDestinationPendingContent({ admin: { firestore: () => db }, countryId: 'IL', cityId: 'haifa' }),
    (error) => error?.details?.reason === 'destination_not_public'
  );
});

test('stale destination quarantine deapproves the source and deletes its public catalog atomically', async () => {
  const updates = [];
  const deletes = [];
  const destinationRef = { path: 'countries/IL/destinations/haifa' };
  const destination = {
    status: 'active',
    canonicalPolicy: { approved: true, reviewState: 'approved' },
    publicationFence: {
      state: 'draining',
      reason: 'destination_inactive',
      operationId: 'deactivate-1',
      approvalRevision: 3,
    },
  };
  const db = {
    doc: (path) => ({ path }),
    runTransaction: async (callback) => callback({
      get: async (ref) => {
        assert.equal(ref.path, destinationRef.path);
        return { exists: true, data: () => destination };
      },
      update: (ref, patch) => updates.push({ path: ref.path, patch }),
      delete: (ref) => deletes.push(ref.path),
    }),
  };
  const firestore = () => db;
  firestore.FieldValue = { serverTimestamp: () => 'server-time' };

  const result = await quarantineDestinationPublicationFenceForManualRecovery({
    admin: { firestore },
    countryId: 'IL',
    cityId: 'haifa',
    destinationRef,
    expectedFence: destination.publicationFence,
    held: { recommendations: 2, trips: 0, routes: 1 },
  });

  assert.equal(result, true);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].patch.canonicalPolicy.approved, false);
  assert.equal(updates[0].patch.publicationFence.state, 'manual_review_required');
  assert.deepEqual(deletes, ['destinationCatalog/IL_haifa']);

  await assert.rejects(
    quarantineDestinationPublicationFenceForManualRecovery({
      admin: { firestore },
      countryId: 'FR',
      cityId: 'paris',
      destinationRef,
      expectedFence: destination.publicationFence,
      held: {},
    }),
    (error) => error?.details?.reason === 'destination_reference_mismatch'
  );
  assert.deepEqual(deletes, ['destinationCatalog/IL_haifa']);
});

test('admin approval fails closed when a legacy destination and registry bind different identities', () => {
  const destination = validDestination();
  const registry = {
    id: 'il-tel-aviv',
    kind: 'city_hub',
    groupingPolicy: 'self',
    parentId: null,
    providerRefs: { googlePlaceId: 'place-1' },
  };
  assert.deepEqual(canonicalApprovalBindingIssues(destination, registry), []);
  assert.deepEqual(
    canonicalApprovalBindingIssues(destination, {
      ...registry,
      providerRefs: { googlePlaceId: 'other-place' },
    }),
    ['destination_registry_provider_mismatch']
  );
  assert.deepEqual(
    canonicalApprovalBindingIssues(destination, { ...registry, kind: 'province' }),
    ['destination_registry_kind_mismatch']
  );
});

test('admin approval upgrades a matching legacy policy to an explicit registry attestation', () => {
  const approved = buildApprovedCanonicalPolicy({
    currentPolicy: {
      approved: true,
      registryId: 'il-tel-aviv',
      kind: 'city_hub',
      groupingPolicy: 'self',
      registryVersion: 1,
    },
    registryEntry: {
      id: 'il-tel-aviv',
      countryCode: 'IL',
      kind: 'city_hub',
      groupingPolicy: 'self',
      parentId: null,
      aliases: ['Tel Aviv'],
      registryVersion: 3,
    },
    approvalRevision: 1,
    countryId: 'IL',
    actorUid: 'admin-1',
    timestamp: 'server-time',
  });
  assert.equal(approved.registryVersion, 3);
  assert.equal(approved.reviewState, 'approved');
  assert.equal(approved.registryAttestation.approved, true);
  assert.equal(approved.registryAttestation.issuedBy, 'admin-1');
  assert.equal(approved.registryAttestation.countryId, 'IL');
  assert.deepEqual(approved.aliases, ['Tel Aviv']);
});

function policyBindingFixture(overrides = {}) {
  const currentCity = {
    providerRefs: { googlePlaceId: 'place-1' },
    googleCache: {
      placeId: 'place-1',
      names: { he: 'רחובות', en: 'Rehovot' },
      coordinates: { lat: 31.89, lng: 34.81 },
      viewport: {
        southwest: { lat: 31.8, lng: 34.7 },
        northeast: { lat: 32, lng: 34.9 },
      },
      types: ['locality', 'political'],
    },
    canonicalPolicy: { registryId: 'il-provisional-old' },
    ...overrides.currentCity,
  };
  return {
    currentCity,
    countryCode: overrides.countryCode || 'IL',
    destinationPath: overrides.destinationPath || 'countries/IL/destinations/rehovot',
    fallbackRegistryId: overrides.fallbackRegistryId || 'il-rehovot-fallback',
    registryEntries: overrides.registryEntries || [],
  };
}

function researchedRegistryEntry(overrides = {}) {
  return {
    id: 'il-rehovot',
    countryCode: 'IL',
    names: { he: 'רחובות', en: 'Rehovot' },
    aliases: ['Rehovot'],
    kind: 'city_hub',
    groupingPolicy: 'self',
    providerRefs: { googlePlaceId: 'place-1', googlePlaceIds: ['legacy-place'] },
    providerDisplayName: 'Rehovot, Israel',
    providerAddress: 'Rehovot, Israel',
    center: { lat: 31.89, lng: 34.81 },
    radiusKm: 18,
    googleTypes: ['locality', 'political'],
    providerIdentity: { reviewedOverride: false, source: 'seed-review' },
    geometryPolicy: { autoMatchEligible: true, source: 'planli_reviewed', version: 3 },
    researchSources: [{ url: 'https://example.test/source-1' }, { url: 'https://example.test/source-2' }],
    status: 'active',
    registryVersion: 3,
    ...overrides,
  };
}

test('destination policy adopts one exact unbound provider owner and preserves researched metadata', () => {
  const owner = researchedRegistryEntry();
  const binding = selectDestinationPolicyRegistryBinding(policyBindingFixture({ registryEntries: [owner] }));
  assert.equal(binding.issue, undefined);
  assert.equal(binding.registryId, 'il-rehovot');
  assert.equal(binding.adoptedExistingProvider, true);

  const plan = buildDestinationPolicyRegistryPlan({
    binding,
    currentCity: policyBindingFixture().currentCity,
    countryCode: 'IL',
    cityId: 'rehovot',
    aliases: ['Rehovot'],
    kind: 'city_hub',
    parentId: null,
    groupingPolicy: 'self',
    reason: 'reviewed destination policy',
    actorUid: 'admin-1',
  });
  assert.deepEqual(plan.validationEntry.providerRefs, owner.providerRefs);
  assert.deepEqual(plan.validationEntry.providerIdentity, owner.providerIdentity);
  assert.deepEqual(plan.validationEntry.researchSources, owner.researchSources);
  assert.equal(Object.hasOwn(plan.writeData, 'providerRefs'), false);
  assert.equal(Object.hasOwn(plan.writeData, 'providerIdentity'), false);
  assert.equal(Object.hasOwn(plan.writeData, 'researchSources'), false);
  assert.equal(plan.writeData.status, 'pending_review');
});

test('destination policy accepts an exact owner already bound to the same destination', () => {
  const owner = researchedRegistryEntry({ destinationPath: 'countries/IL/destinations/rehovot' });
  const fixture = policyBindingFixture({
    registryEntries: [owner],
    currentCity: { canonicalPolicy: { registryId: owner.id } },
  });
  const binding = selectDestinationPolicyRegistryBinding(fixture);
  assert.equal(binding.issue, undefined);
  assert.equal(binding.registryId, owner.id);
  const plan = buildDestinationPolicyRegistryPlan({
    binding,
    currentCity: fixture.currentCity,
    countryCode: 'IL',
    cityId: 'rehovot',
    aliases: ['Rehovot'],
    kind: 'city_hub',
    parentId: null,
    groupingPolicy: 'self',
    reason: 'reviewed destination policy',
    actorUid: 'admin-1',
  });
  assert.deepEqual(plan.validationEntry.providerRefs, owner.providerRefs);
  assert.deepEqual(plan.validationEntry.geometryPolicy, owner.geometryPolicy);
  assert.equal(Object.hasOwn(plan.writeData, 'providerRefs'), false);
  assert.equal(Object.hasOwn(plan.writeData, 'geometryPolicy'), false);
});

test('destination policy fails closed for ambiguous, cross-country, conflicting, or alias-only owners', () => {
  const owner = researchedRegistryEntry();
  const scenarios = [
    {
      entries: [owner, researchedRegistryEntry({ id: 'il-rehovot-copy' })],
      reason: 'duplicate_google_place_id',
    },
    {
      entries: [researchedRegistryEntry({ countryCode: 'US' })],
      reason: 'destination_country_mismatch',
    },
    {
      entries: [researchedRegistryEntry({ destinationPath: 'countries/IL/destinations/other' })],
      reason: 'destination_registry_path_mismatch',
    },
    {
      entries: [researchedRegistryEntry({
        providerRefs: { googlePlaceId: 'primary-place', googlePlaceIds: ['place-1'] },
      })],
      reason: 'destination_registry_provider_mismatch',
    },
  ];
  scenarios.forEach(({ entries, reason }) => {
    const binding = selectDestinationPolicyRegistryBinding(policyBindingFixture({ registryEntries: entries }));
    assert.equal(binding.issue, reason);
  });
});

test('destination policy keeps new provider behavior when no canonical owner exists', () => {
  const fixture = policyBindingFixture({
    countryCode: 'US',
    destinationPath: 'countries/US/destinations/miami',
    fallbackRegistryId: 'us-miami',
    currentCity: {
      canonicalPolicy: {},
      providerRefs: { googlePlaceId: 'new-place' },
      googleCache: {
        placeId: 'new-place',
        names: { he: 'מיאמי', en: 'Miami' },
        coordinates: { lat: 25.76, lng: -80.19 },
        viewport: {
          southwest: { lat: 25.6, lng: -80.4 },
          northeast: { lat: 25.9, lng: -80 },
        },
        types: ['locality', 'political'],
      },
    },
  });
  const binding = selectDestinationPolicyRegistryBinding(fixture);
  assert.equal(binding.issue, undefined);
  assert.equal(binding.registryId, 'us-miami');
  assert.equal(binding.existingEntry, null);
  const plan = buildDestinationPolicyRegistryPlan({
    binding,
    currentCity: fixture.currentCity,
    countryCode: 'US',
    cityId: 'miami',
    aliases: ['Miami'],
    kind: 'city_hub',
    parentId: null,
    groupingPolicy: 'self',
    reason: 'reviewed destination policy',
    actorUid: 'admin-1',
  });
  assert.equal(plan.writeData.providerRefs.googlePlaceId, 'new-place');
  assert.deepEqual(plan.writeData.googleTypes, ['locality', 'political']);
});

test('destination policy aborts when an adopted provider owner disappears during the hold window', () => {
  const owner = researchedRegistryEntry();
  const fixture = policyBindingFixture({ registryEntries: [owner] });
  const first = selectDestinationPolicyRegistryBinding(fixture);
  const expected = {
    registryId: first.registryId,
    expectedExistingOwner: true,
    fingerprint: first.fingerprint,
  };
  const second = selectDestinationPolicyRegistryBinding({
    ...fixture,
    registryEntries: [],
  });
  assert.equal(destinationPolicyRegistryBindingIssue(expected, second), 'destination_registry_changed');
});

test('destination policy aborts when provider identity changes under the same registry ID', () => {
  const firstOwner = researchedRegistryEntry();
  const firstFixture = policyBindingFixture({
    registryEntries: [firstOwner],
    currentCity: { canonicalPolicy: { registryId: firstOwner.id } },
  });
  const first = selectDestinationPolicyRegistryBinding(firstFixture);
  const expected = {
    registryId: first.registryId,
    expectedExistingOwner: true,
    fingerprint: first.fingerprint,
  };
  const secondOwner = researchedRegistryEntry({
    providerRefs: { googlePlaceId: 'place-2' },
  });
  const second = selectDestinationPolicyRegistryBinding({
    ...firstFixture,
    currentCity: {
      ...firstFixture.currentCity,
      providerRefs: { googlePlaceId: 'place-2' },
      googleCache: { ...firstFixture.currentCity.googleCache, placeId: 'place-2' },
    },
    registryEntries: [secondOwner],
  });
  assert.equal(second.registryId, first.registryId);
  assert.equal(destinationPolicyRegistryBindingIssue(expected, second), 'destination_registry_changed');
});

test('destination policy preserves compatible natural identity and does not invent an override', () => {
  const owner = researchedRegistryEntry({
    id: 'pe-humantay-lake',
    countryCode: 'PE',
    names: { he: 'אגם הומאנטאי', en: 'Humantay Lake' },
    aliases: ['Humantay Lake'],
    kind: 'natural_feature',
    providerRefs: { googlePlaceId: 'place-1' },
    googleTypes: ['natural_feature'],
    providerIdentity: { source: 'seed-review' },
  });
  const binding = selectDestinationPolicyRegistryBinding(policyBindingFixture({
    countryCode: 'PE',
    destinationPath: 'countries/PE/destinations/humantay-lake',
    registryEntries: [owner],
    currentCity: { canonicalPolicy: { registryId: 'pe-provisional-old' } },
  }));
  const plan = buildDestinationPolicyRegistryPlan({
    binding,
    currentCity: policyBindingFixture().currentCity,
    countryCode: 'PE',
    cityId: 'humantay-lake',
    aliases: ['Humantay Lake'],
    kind: 'natural_feature',
    parentId: null,
    groupingPolicy: 'self',
    reason: 'reviewed natural destination policy',
    actorUid: 'admin-1',
  });
  assert.equal(plan.validationEntry.providerIdentity.reviewedOverride, undefined);
  assert.equal(validateRegistryEntry(plan.validationEntry, { requireResearchSources: false }).valid, true);

  const incompatible = {
    ...plan.validationEntry,
    googleTypes: ['locality', 'political'],
  };
  assert.deepEqual(
    validateRegistryEntry(incompatible, { requireResearchSources: false }).errors,
    ['incompatible_google_place_type']
  );
});

test('destination quality accepts complete reviewed data', () => {
  assert.deepEqual(qualityIssues(validDestination(), {}, { approvedAt: new Date() }, Date.parse('2029-01-01')), []);
});

test('destination quality reports identity, image, airport and job problems', () => {
  const issues = qualityIssues({ googleCache: { names: { he: 'עיר' }, countryCode: 'IL' }, identity: { countryCode: 'US' } }, {
    imageSync: { state: 'failed' }, identitySync: { state: 'needs_review' },
  }, {});
  const codes = new Set(issues.map((issue) => issue.code));
  for (const code of ['missing_english_name', 'missing_google_place', 'country_conflict', 'missing_coordinates', 'missing_image', 'image_job_failed', 'identity_job_failed', 'unapproved_canonical_destination', 'new_destination']) {
    assert.ok(codes.has(code), `missing issue ${code}`);
  }
});

test('destination quality rejects Latin-only Hebrew names and flags transliteration for review', () => {
  const latin = validDestination();
  latin.googleCache.names.he = 'Vlore';
  assert.ok(qualityIssues(latin).some((issue) => issue.code === 'missing_hebrew_name'));

  const fallback = validDestination();
  fallback.googleCache.nameSources = { he: 'transliteration_fallback', en: 'google' };
  const issue = qualityIssues(fallback).find((entry) => entry.code === 'fallback_hebrew_name');
  assert.equal(issue?.severity, 'warning');
});

test('destinationCoordinates reads multiple coordinate shapes', () => {
  assert.deepEqual(destinationCoordinates({
    coords: { latitude: 32.08, longitude: 34.78 },
  }), { lat: 32.08, lng: 34.78 });
  assert.deepEqual(destinationCoordinates({
    mapLocation: { geometry: { coordinates: [-80.1918, 25.7617] } },
  }), { lat: 25.7617, lng: -80.1918 });
  assert.deepEqual(destinationCoordinates({
    location: { lat: 48.8566, lng: 2.3522 },
  }), { lat: 48.8566, lng: 2.3522 });
  assert.deepEqual(destinationCoordinates({
    googleCache: { geometry: { location: { lat: 31.7767, lng: 35.2345 } } },
  }), { lat: 31.7767, lng: 35.2345 });
  assert.deepEqual(destinationCoordinates({
    identity: { geometry: { location: { lat: 33.66, lng: -95.5555 } } },
  }), { lat: 33.66, lng: -95.5555 });
  assert.equal(destinationCoordinates({ place: {} }), null);
});

test('destination discovery retries use the same durable notification generation', async () => {
  const calls = [];
  const destination = {
    notificationVersion: 1,
    names: { he: '×—×™×¤×”' },
    image: { urls: { thumb: 'https://example.com/haifa.jpg' } },
  };
  const fanout = async (input) => { calls.push(input); return { delivered: 1 }; };

  await notifyAdminsOfDestination({
    admin: {}, countryId: 'il', cityId: 'haifa', destination, fanout,
  });
  await notifyAdminsOfDestination({
    admin: {}, countryId: 'il', cityId: 'haifa', destination, fanout,
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].notificationId, calls[1].notificationId);
  assert.equal(calls[0].activityVersion, 1);
  assert.equal(calls[1].activityVersion, 1);
  assert.equal(calls[0].createOnly, true);
});

test('holding destination content writes the status, notification, and unread counter atomically', async () => {
  const content = {
    ownerId: 'owner-1',
    status: 'active',
    title: 'A recommendation',
    media: [{ url: 'https://example.com/photo.jpg' }],
  };
  const contentRef = {
    id: 'post-1',
    path: 'recommendations/post-1',
    parent: { id: 'recommendations' },
  };
  const entry = { id: 'post-1', ref: contentRef };
  const writes = [];
  const db = {
    doc: (path) => ({ path }),
    runTransaction: async (callback) => {
      let writeStarted = false;
      const transaction = {
        get: async (ref) => {
          assert.equal(writeStarted, false, 'all transaction reads must precede writes');
          if (ref.path === contentRef.path) return { exists: true, data: () => ({ ...content }) };
          if (ref.path === 'users/owner-1') return { exists: true, data: () => ({}) };
          return { exists: false, data: () => undefined };
        },
        update: (ref, patch) => {
          writeStarted = true;
          Object.assign(content, patch);
          writes.push({ operation: 'update', path: ref.path, patch });
        },
        set: (ref, value, options) => {
          writeStarted = true;
          writes.push({ operation: 'set', path: ref.path, value, options });
        },
      };
      return callback(transaction);
    },
  };
  const firestore = () => db;
  firestore.FieldValue = {
    increment: (value) => ({ increment: value }),
    serverTimestamp: () => 'server-time',
  };
  const patch = { status: 'moderation_hold', updatedAt: 'server-time' };

  await holdDestinationContentDocuments({
    admin: { firestore },
    documents: [entry],
    patch,
  });

  assert.equal(content.status, 'moderation_hold');
  assert.equal(writes.filter((write) => write.operation === 'update').length, 1);
  const notificationWrite = writes.find((write) => write.path.startsWith('users/owner-1/notifications/'));
  assert.equal(notificationWrite.value.schemaVersion, 2);
  assert.equal(notificationWrite.value.subtype, 'content_held');
  assert.equal(notificationWrite.value.target.id, 'post-1');
  assert.deepEqual(notificationWrite.value.target.thumbUrls, ['https://example.com/photo.jpg']);
  const stateWrite = writes.find((write) => write.path === 'users/owner-1/notificationState/state');
  assert.deepEqual(stateWrite.value.personalUnread, { increment: 1 });

  const writeCount = writes.length;
  await holdDestinationContentDocuments({
    admin: { firestore },
    documents: [entry],
    patch,
  });
  assert.equal(writes.length, writeCount, 'retry must skip content already placed on hold');
});

test('destination approval release is idempotent and fails closed while another route destination is pending', async () => {
  const DELETE = Symbol('delete');
  const documents = new Map(Object.entries({
    'countries/IL': { status: 'active', code: 'IL' },
    'countries/IL/destinations/new-city': {
      status: 'active',
      canonicalPolicy: {
        approved: true, registryId: 'il-new-city', kind: 'city_hub',
        groupingPolicy: 'self', registryVersion: 3, reviewState: 'approved', approvalRevision: 1,
        registryAttestation: {
          approved: true, registryId: 'il-new-city', registryVersion: 3,
          approvalRevision: 1, countryId: 'IL',
        },
      },
      stats: { recommendationCount: 0 },
    },
    'countries/IL/destinations/pending-city': {
      status: 'active',
      canonicalPolicy: {
        approved: false, registryId: 'il-pending-city', kind: 'city_hub',
        groupingPolicy: 'self', registryVersion: 3, reviewState: 'pending',
      },
    },
    'recommendations/rec-release': {
      ownerId: 'owner', status: 'moderation_hold', destination: { countryId: 'IL', cityId: 'new-city' },
      moderation: {
        holdReason: 'destination_pending_approval', systemGate: 'destination_pending_approval',
        destination: { countryId: 'IL', cityId: 'new-city' },
      },
    },
    'recommendations/rec-text-hold': {
      ownerId: 'owner', status: 'moderation_hold', destination: { countryId: 'IL', cityId: 'new-city' },
      moderation: { holdReason: 'unsafe_text' },
    },
    'routes/route-still-pending': {
      ownerId: 'owner', status: 'moderation_hold',
      destinations: [
        { countryId: 'IL', cityId: 'new-city' },
        { countryId: 'IL', cityId: 'pending-city' },
      ],
      destinationKeys: ['IL:new-city', 'IL:pending-city'],
      moderation: {
        holdReason: 'destination_pending_approval', systemGate: 'destination_pending_approval',
        pendingDestinationKeys: ['IL:new-city', 'IL:pending-city'],
      },
    },
  }));
  const reference = (path) => {
    const segments = path.split('/');
    return {
      id: segments.at(-1),
      path,
      parent: { id: segments.at(-2) },
      get: async () => snapshot(path),
      set: async (value, options) => applySet(path, value, options),
    };
  };
  const snapshot = (path) => ({
    id: path.split('/').at(-1),
    exists: documents.has(path),
    data: () => documents.get(path),
    ref: reference(path),
  });
  const applyPatch = (path, patch) => {
    const current = { ...(documents.get(path) || {}) };
    for (const [key, value] of Object.entries(patch)) {
      if (value === DELETE) delete current[key];
      else if (value?.increment != null) {
        const segments = key.split('.');
        if (segments.length === 2) {
          current[segments[0]] = { ...(current[segments[0]] || {}) };
          current[segments[0]][segments[1]] = Number(current[segments[0]][segments[1]] || 0) + value.increment;
        }
      } else current[key] = value;
    }
    documents.set(path, current);
  };
  const applySet = (path, value, options) => {
    documents.set(path, options?.merge ? { ...(documents.get(path) || {}), ...value } : { ...value });
  };
  const collection = (name) => {
    const filters = [];
    const query = {
      where: (field, operation, expected) => {
        filters.push([field, operation, expected]);
        return query;
      },
      get: async () => ({
        docs: [...documents.entries()]
          .filter(([path]) => path.startsWith(`${name}/`) && path.split('/').length === 2)
          .filter(([, value]) => filters.every(([field, operation, expected]) => {
            const actual = field.split('.').reduce((current, part) => current?.[part], value);
            return operation === 'array-contains' ? actual?.includes(expected) : actual === expected;
          }))
          .map(([path]) => snapshot(path)),
      }),
    };
    return query;
  };
  const db = {
    doc: reference,
    collection,
    runTransaction: async (callback) => callback({
      get: async (ref) => snapshot(ref.path),
      update: (ref, patch) => applyPatch(ref.path, patch),
      set: (ref, value, options) => applySet(ref.path, value, options),
    }),
  };
  const firestore = () => db;
  firestore.FieldValue = {
    delete: () => DELETE,
    increment: (value) => ({ increment: value }),
    serverTimestamp: () => 'server-time',
  };
  const admin = { firestore };

  const first = await releaseDestinationPendingContent({ admin, countryId: 'IL', cityId: 'new-city' });
  assert.deepEqual(first.released, { recommendations: 1, trips: 0, routes: 0 });
  assert.equal(documents.get('recommendations/rec-release').status, 'active');
  assert.deepEqual(documents.get('recommendations/rec-release').publicationGate, {
    destinationApprovalVerified: true,
  });
  assert.equal(Object.hasOwn(documents.get('recommendations/rec-release'), 'moderation'), false);
  assert.equal(documents.get('recommendations/rec-text-hold').status, 'moderation_hold');
  assert.equal(documents.get('routes/route-still-pending').status, 'moderation_hold');
  assert.equal(documents.get('countries/IL/destinations/new-city').stats.recommendationCount, 1);

  const second = await releaseDestinationPendingContent({ admin, countryId: 'IL', cityId: 'new-city' });
  assert.equal(second.replay, true);
  assert.equal(documents.get('countries/IL/destinations/new-city').stats.recommendationCount, 1);
});

test('airport candidates are bounded, sorted and distance annotated', () => {
  const result = nearestScheduledAirports({ lat: 0, lng: 0 }, [
    { ident: 'B', iataCode: 'BBB', coordinates: { lat: 1, lng: 0 } },
    { ident: 'A', iataCode: 'AAA', coordinates: { lat: 0.1, lng: 0 } },
    { ident: 'C', iataCode: 'CCC', coordinates: { lat: 20, lng: 20 } },
  ], { limit: 2, maxDistanceKm: 300 });
  assert.deepEqual(result.map((entry) => entry.iataCode), ['AAA', 'BBB']);
  assert.ok(result[0].distanceKm < result[1].distanceKm);
});

test('selectAirportByIataCode is stable against spacing, casing and list limit artifacts', () => {
  const airports = [
    { ident: 'A', iataCode: 'AAA', coordinates: { lat: 0.1, lng: 0 } },
    { ident: 'B', iataCode: 'BBB', coordinates: { lat: 0.2, lng: 0 } },
    { ident: 'C', iataCode: 'CCC', coordinates: { lat: 3, lng: 3 } },
  ];
  const coordinates = { lat: 0, lng: 0 };
  const result = selectAirportByIataCode(coordinates, airports, ' bbb ', { limit: 1 });
  assert.equal(result.iataCode, 'BBB');
  assert.equal(result.ident, 'B');
});

test('selectAirportByIataCode can skip nearby limit when admin sets override', () => {
  const airports = [
    { ident: 'MIA', iataCode: 'MIA', coordinates: { lat: 40.0, lng: 40.0 } },
  ];
  assert.equal(
    selectAirportByIataCode({ lat: 0, lng: 0 }, airports, 'MIA', { limit: 1, enforceMaxDistance: false }).iataCode,
    'MIA'
  );
});

test('selectAirportByIataCode can bypass distance cap for explicit manual matches', () => {
  const airports = [
    { ident: 'NEAR', iataCode: 'AAA', coordinates: { lat: 1, lng: 1 } },
    { ident: 'MIA', iataCode: 'MIA', coordinates: { lat: 40, lng: 40 } },
    ...Array.from({ length: 18 }, (_, index) => ({
      ident: `F${String(index).padStart(2, '0')}`,
      iataCode: `F${String(index + 2).padStart(2, '0')}`,
      coordinates: { lat: 20 + index * 0.1, lng: 20 + index * 0.1 },
    })),
  ];
  const result = selectAirportByIataCode(
    { lat: 0, lng: 0 },
    airports,
    'MIA',
    { limit: 1, maxDistanceKm: 300, enforceMaxDistance: false }
  );
  assert.equal(result.iataCode, 'MIA');
});

test('syncDestinationAirport does not overwrite an existing closestAirport when forced', async () => {
  const cityData = { travelFacts: { closestAirport: { iataCode: 'TLV' } } };
  const db = {
    doc(path) {
      if (path === 'countries/c1/destinations/city-1') {
        return {
          get: async () => ({ exists: true, data: () => cityData }),
        };
      }
      if (path === 'countries/c1') return { get: async () => ({ exists: true, data: () => ({ name: 'Israel' }) }) };
      if (path === 'system/runtime/destinationJobs/c1_city-1') return { get: async () => ({ exists: false, data: () => ({}) }) };
      if (path.startsWith('system/moderation/destinationReviews/')) return { get: async () => ({ exists: false, data: () => ({}) }) };
      throw new Error(`Unexpected Firestore path: ${path}`);
    },
    FieldValue: { serverTimestamp: () => 'server-time' },
  };
  const admin = { firestore: () => db };
  const result = await syncDestinationAirport({
    admin,
    countryId: 'c1',
    cityId: 'city-1',
    applyWhenMissingOnly: true,
  });
  assert.equal(result.updated, false);
  assert.equal(result.updatedByAdmin, false);
  assert.equal(cityData.travelFacts.closestAirport.iataCode, 'TLV');
});

test('listing destination reviews is a pure read and never starts a quality scan', async () => {
  let collectionGroupCalls = 0;
  const query = {
    orderBy: () => query,
    limit: () => query,
    where: () => query,
    get: async () => ({ size: 0, docs: [] }),
  };
  const db = {
    doc(path) {
      if (path === 'system/moderation/admins/admin-1') return { get: async () => ({ exists: true, data: () => ({ active: true }) }) };
      throw new Error(`Unexpected Firestore path: ${path}`);
    },
    collection(path) {
      assert.equal(path, 'system/moderation/destinationReviews');
      return query;
    },
    collectionGroup() {
      collectionGroupCalls += 1;
      throw new Error('list must not scan destinations');
    },
  };
  const result = await listDestinationReviews({
    admin: { firestore: () => db },
    auth: { uid: 'admin-1', token: { admin: true } },
    data: {},
  });
  assert.deepEqual(result, { items: [], nextCursor: null });
  assert.equal(collectionGroupCalls, 0);
});

test('listing destination reviews puts pending cities before approved cities', async () => {
  const pendingDoc = { id: 'pending', data: () => ({ status: 'open', names: { he: 'ממתינה' } }) };
  const approvedDoc = { id: 'approved', data: () => ({ status: 'approved', names: { he: 'מאושרת' } }) };
  const responses = [[pendingDoc], [approvedDoc]];
  const whereCalls = [];
  const query = {
    where: (...args) => { whereCalls.push(args); return query; },
    orderBy: () => query,
    limit: () => query,
    get: async () => ({ docs: responses.shift() || [] }),
  };
  const db = {
    doc(path) {
      if (path === 'system/moderation/admins/admin-1') return { get: async () => ({ exists: true, data: () => ({ active: true }) }) };
      throw new Error(`Unexpected Firestore path: ${path}`);
    },
    collection(path) {
      assert.equal(path, 'system/moderation/destinationReviews');
      return query;
    },
  };
  const result = await listDestinationReviews({
    admin: { firestore: () => db },
    auth: { uid: 'admin-1', token: { admin: true } },
    data: {},
  });
  assert.deepEqual(result.items.map((item) => item.id), ['pending', 'approved']);
  assert.deepEqual(whereCalls, [
    ['status', 'in', ['blocked', 'open', 'ready']],
    ['status', 'in', ['approved', 'approved_with_warnings', 'inactive']],
  ]);
});
