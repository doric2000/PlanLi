/* eslint-disable no-await-in-loop, no-console */
const crypto = require('crypto');
const admin = require('firebase-admin');

const { destinationIsOperational } = require('../destinationReferencePolicy');
const { destinationKey } = require('../discoverySearch');
const { catalogId } = require('../destinationCatalogService');
const { validateRegistryEntry } = require('../canonicalDestinationRegistry');
const { gcloudAccessToken, initializeAdmin } = require('./localCredentials');

const PRODUCTION_PROJECT_ID = 'planli-f0b12';
const MEDIA_BUCKET = 'planli-f0b12-media-eu';
const CONFIRMATION = 'APPLY_DESTINATION_PUBLICATION_GATE';

function valueAfter(argv, flag) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : null;
}

function parseArgs(argv) {
  return {
    apply: argv.includes('--apply'),
    projectId: valueAfter(argv, '--project'),
    expectedFingerprint: valueAfter(argv, '--fingerprint'),
    confirmation: valueAfter(argv, '--confirm'),
  };
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function validStoredId(value) {
  return typeof value === 'string' && value === value.trim() && value.length > 0 &&
    value.length <= 180 && !value.includes('/') && value !== '.' && value !== '..' &&
    !/[\u0000-\u001f\u007f-\u009f]/u.test(value);
}

function normalizedReference(value) {
  return validStoredId(value?.countryId) && validStoredId(value?.cityId)
    ? { countryId: value.countryId, cityId: value.cityId }
    : null;
}

function contentReferences(type, data) {
  if (type !== 'route') {
    const reference = normalizedReference(data?.destination);
    return reference ? [reference] : [];
  }
  if (!Array.isArray(data?.destinations)) return [];
  return data.destinations.map(normalizedReference).filter(Boolean);
}

function contentReferenceAssessment(type, data) {
  const raw = type === 'route' ? data?.destinations : [data?.destination];
  if (!Array.isArray(raw) || !raw.length) return { valid: false, references: [] };
  const normalized = raw.map(normalizedReference);
  return {
    valid: normalized.every(Boolean),
    references: normalized.filter(Boolean),
  };
}

function manifestFingerprint(actions) {
  return sha256(JSON.stringify(actions.map((action) => ({
    path: action.path,
    type: action.type,
    updateTime: action.updateTime || null,
    reason: action.reason || null,
    pendingDestinationKeys: action.pendingDestinationKeys || null,
    pendingDestinations: action.pendingDestinations || null,
    recommendationCount: action.recommendationCount ?? null,
    registryPath: action.registryPath || null,
    registryUpdateTime: action.registryUpdateTime || null,
    approvalRevision: action.approvalRevision ?? null,
  }))));
}

function normalizedUpdateTime(value) {
  if (!value) return null;
  const date = value?.toDate?.() || new Date(value);
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error('Firestore returned an invalid document update time.');
  }
  return date.toISOString();
}

function buildPublicationManifest({ countries, destinations, catalog, contents, registry = [] }) {
  const countryStatus = new Map(countries.map((entry) => [entry.id, entry.data?.status]));
  const registryById = new Map(registry.map((entry) => [entry.id, entry]));
  const approvedKeys = new Set();
  destinations.forEach((entry) => {
    const key = destinationKey(entry.countryId, entry.cityId);
    const policy = entry.data?.canonicalPolicy || {};
    const registryEntry = registryById.get(policy.registryId);
    const registryData = registryEntry?.data || {};
    const validation = registryEntry
      ? validateRegistryEntry({ id: registryEntry.id, ...registryData })
      : { valid: false };
    const expectedCountryCode = String(
      countries.find((country) => country.id === entry.countryId)?.data?.code || entry.countryId
    ).toUpperCase();
    const destinationPathMatches = !registryData.destinationPath || registryData.destinationPath === entry.path;
    const authoritative = countryStatus.get(entry.countryId) === 'active'
      && destinationIsOperational(entry.data || {})
      && policy.approved === true
      && validation.valid
      && registryData.status === 'active'
      && registryData.approval?.approvedByAdmin === true
      && validation.entry.countryCode === expectedCountryCode
      && Number(validation.entry.registryVersion) === Number(policy.registryVersion)
      && destinationPathMatches;
    if (!authoritative) return;
    const approvalRevision = Math.max(
      1,
      Number(policy.approvalRevision || 0),
      Number(registryData.approvalRevision || 0)
    );
    approvedKeys.add(key);
    const attestation = policy.registryAttestation || {};
    if (attestation.approved !== true || attestation.registryId !== policy.registryId ||
        Number(attestation.registryVersion) !== Number(policy.registryVersion) ||
        Number(attestation.approvalRevision) !== approvalRevision ||
        attestation.countryId !== entry.countryId ||
        registryData.destinationPath !== entry.path ||
        Number(registryData.approvalRevision) !== approvalRevision) {
      entry.registryAttestationAction = {
        type: 'attest_destination_registry',
        path: entry.path,
        updateTime: entry.updateTime || null,
        registryPath: registryEntry.path,
        registryUpdateTime: registryEntry.updateTime || null,
        registryId: policy.registryId,
        registryVersion: Number(policy.registryVersion),
        approvalRevision,
        countryId: entry.countryId,
        countryCode: validation.entry.countryCode,
        reason: 'authoritative_registry_binding',
      };
    }
  });

  const actions = [];
  const reviewRequired = [];
  destinations.forEach((entry) => {
    if (entry.registryAttestationAction) actions.push(entry.registryAttestationAction);
  });
  destinations.forEach((entry) => {
    const key = destinationKey(entry.countryId, entry.cityId);
    if (!approvedKeys.has(key)) {
      reviewRequired.push({ path: entry.path, destinationKey: key });
    }
  });
  catalog.forEach((entry) => {
    const countryId = entry.data?.countryId;
    const cityId = entry.data?.cityId;
    const key = destinationKey(countryId, cityId);
    const expectedPath = validStoredId(countryId) && validStoredId(cityId)
      ? `destinationCatalog/${catalogId(countryId, cityId)}`
      : '';
    if (!approvedKeys.has(key) || entry.path !== expectedPath) {
      actions.push({
        type: 'delete_catalog', path: entry.path,
        updateTime: entry.updateTime || null,
        reason: approvedKeys.has(key) ? 'duplicate_or_noncanonical_catalog' : 'destination_not_public',
      });
    } else if (entry.data?.status !== 'active' || entry.data?.canonicalApproved !== true) {
      actions.push({
        type: 'verify_catalog', path: entry.path,
        updateTime: entry.updateTime || null, reason: 'approved_destination_catalog',
      });
    }
  });

  const finalActiveRecommendationCounts = new Map();
  contents.forEach((entry) => {
    const assessment = contentReferenceAssessment(entry.type, entry.data);
    const references = assessment.references;
    const keys = [...new Set(references.map((reference) => destinationKey(reference.countryId, reference.cityId)))];
    const allApproved = assessment.valid && keys.length > 0 && keys.every((key) => approvedKeys.has(key));
    if (entry.data?.status === 'active' && allApproved) {
      if (entry.data?.publicationGate?.destinationApprovalVerified !== true) {
        actions.push({
          type: 'verify_content_gate', path: entry.path,
          updateTime: entry.updateTime || null, reason: 'all_destinations_approved',
        });
      }
      if (entry.type === 'recommendation') {
        const key = keys[0];
        finalActiveRecommendationCounts.set(key, Number(finalActiveRecommendationCounts.get(key) || 0) + 1);
      }
      return;
    }
    if (entry.data?.status === 'active' && !allApproved) {
      actions.push({
        type: 'hold_content', path: entry.path, updateTime: entry.updateTime || null,
        reason: assessment.valid && keys.length ? 'destination_pending_approval' : 'destination_reference_invalid',
        pendingDestinationKeys: keys.filter((key) => !approvedKeys.has(key)),
        pendingDestinations: references.filter((reference) => (
          !approvedKeys.has(destinationKey(reference.countryId, reference.cityId))
        )),
      });
      return;
    }
    if (entry.data?.status === 'moderation_hold' &&
        entry.data?.moderation?.systemGate === 'destination_pending_approval' &&
        entry.data?.publicationGate?.destinationApprovalVerified !== false) {
      actions.push({
        type: 'clear_held_content_gate', path: entry.path,
        updateTime: entry.updateTime || null, reason: 'destination_pending_approval',
      });
    }
  });

  destinations.forEach((entry) => {
    const key = destinationKey(entry.countryId, entry.cityId);
    const recommendationCount = Number(finalActiveRecommendationCounts.get(key) || 0);
    if (Number(entry.data?.stats?.recommendationCount || 0) !== recommendationCount) {
      actions.push({
        type: 'set_recommendation_count', path: entry.path,
        updateTime: entry.updateTime || null, recommendationCount,
      });
    }
  });

  actions.sort((left, right) => left.path.localeCompare(right.path) || left.type.localeCompare(right.type));
  reviewRequired.sort((left, right) => left.path.localeCompare(right.path));
  return {
    actions,
    reviewRequired,
    fingerprint: manifestFingerprint(actions),
    counts: {
      actions: actions.length,
      reviewRequired: reviewRequired.length,
      held: actions.filter((entry) => entry.type === 'hold_content').length,
      catalogRemoved: actions.filter((entry) => entry.type === 'delete_catalog').length,
      gatesVerified: actions.filter((entry) => entry.type === 'verify_content_gate').length,
    },
  };
}

function snapshotRecord(snapshot, extra = {}) {
  return {
    path: snapshot.ref.path,
    id: snapshot.id,
    data: snapshot.data() || {},
    updateTime: normalizedUpdateTime(snapshot.updateTime),
    ...extra,
  };
}

function decodeFirestoreValue(value) {
  if (!value || typeof value !== 'object') return null;
  if (Object.hasOwn(value, 'nullValue')) return null;
  if (Object.hasOwn(value, 'booleanValue')) return value.booleanValue === true;
  if (Object.hasOwn(value, 'integerValue')) return Number(value.integerValue);
  if (Object.hasOwn(value, 'doubleValue')) return Number(value.doubleValue);
  if (Object.hasOwn(value, 'timestampValue')) return value.timestampValue;
  if (Object.hasOwn(value, 'stringValue')) return value.stringValue;
  if (Object.hasOwn(value, 'bytesValue')) return value.bytesValue;
  if (Object.hasOwn(value, 'referenceValue')) return value.referenceValue;
  if (Object.hasOwn(value, 'geoPointValue')) return value.geoPointValue;
  if (Object.hasOwn(value, 'arrayValue')) {
    return (value.arrayValue?.values || []).map(decodeFirestoreValue);
  }
  if (Object.hasOwn(value, 'mapValue')) {
    return Object.fromEntries(Object.entries(value.mapValue?.fields || {})
      .map(([key, entry]) => [key, decodeFirestoreValue(entry)]));
  }
  throw new Error('Unsupported Firestore REST value in destination dry-run.');
}

function restDocumentRecord(document, extra = {}) {
  const marker = '/documents/';
  const markerIndex = String(document?.name || '').indexOf(marker);
  if (markerIndex < 0) throw new Error('Firestore REST returned a malformed document name.');
  const path = document.name.slice(markerIndex + marker.length);
  const segments = path.split('/');
  return {
    path,
    id: segments.at(-1),
    data: Object.fromEntries(Object.entries(document.fields || {})
      .map(([key, value]) => [key, decodeFirestoreValue(value)])),
    updateTime: normalizedUpdateTime(document.updateTime),
    ...extra,
  };
}

function encodedFirestorePath(path) {
  return String(path || '').split('/').filter(Boolean).map(encodeURIComponent).join('/');
}

async function firestoreRestJson(url, { accessToken, fetchImpl = fetch, method = 'GET', body } = {}) {
  const response = await fetchImpl(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new Error(`Firestore read-only inventory failed with HTTP ${response.status}.`);
  return response.json();
}

async function listCollectionRest({ projectId, parentPath = '', collectionId, accessToken, fetchImpl }) {
  const base = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}` +
    '/databases/(default)/documents';
  const prefix = encodedFirestorePath(parentPath);
  const documents = [];
  let pageToken = null;
  do {
    const url = new URL(`${base}/${prefix ? `${prefix}/` : ''}${encodeURIComponent(collectionId)}`);
    url.searchParams.set('pageSize', '300');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const payload = await firestoreRestJson(url, { accessToken, fetchImpl });
    documents.push(...(payload.documents || []));
    pageToken = payload.nextPageToken || null;
  } while (pageToken);
  return documents;
}

async function listDestinationCollectionGroupRest({ projectId, accessToken, fetchImpl }) {
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}` +
    '/databases/(default)/documents:runQuery';
  const payload = await firestoreRestJson(url, {
    accessToken,
    fetchImpl,
    method: 'POST',
    body: { structuredQuery: { from: [{ collectionId: 'destinations', allDescendants: true }] } },
  });
  return payload.map((entry) => entry.document).filter(Boolean);
}

async function loadLiveRecordsRest({ projectId, accessToken, fetchImpl = fetch }) {
  if (projectId !== PRODUCTION_PROJECT_ID) {
    throw new Error(`Read-only inventory is pinned to ${PRODUCTION_PROJECT_ID}.`);
  }
  const request = (parentPath, collectionId) => listCollectionRest({
    projectId, parentPath, collectionId, accessToken, fetchImpl,
  });
  const [countries, destinations, catalog, recommendations, routes, trips, registry] = await Promise.all([
    request('', 'countries'),
    listDestinationCollectionGroupRest({ projectId, accessToken, fetchImpl }),
    request('', 'destinationCatalog'),
    request('', 'recommendations'),
    request('', 'routes'),
    request('', 'trips'),
    request('system/destinationRegistry', 'entries'),
  ]);
  return {
    countries: countries.map(restDocumentRecord),
    destinations: destinations.map((entry) => {
      const record = restDocumentRecord(entry);
      const segments = record.path.split('/');
      return { ...record, countryId: segments.at(-3) || '', cityId: record.id };
    }),
    catalog: catalog.map(restDocumentRecord),
    registry: registry.map(restDocumentRecord),
    contents: [
      ...recommendations.map((entry) => restDocumentRecord(entry, { type: 'recommendation' })),
      ...routes.map((entry) => restDocumentRecord(entry, { type: 'route' })),
      ...trips.map((entry) => restDocumentRecord(entry, { type: 'trip' })),
    ],
  };
}

async function buildLiveManifestRest(options) {
  const records = await loadLiveRecordsRest(options);
  return {
    projectId: options.projectId,
    inventory: {
      countries: records.countries.length,
      destinations: records.destinations.length,
      catalog: records.catalog.length,
      contents: records.contents.length,
      registry: records.registry.length,
    },
    ...buildPublicationManifest(records),
  };
}

async function loadLiveRecords(adminApi) {
  const db = adminApi.firestore();
  const [countries, destinations, catalog, recommendations, routes, trips, registry] = await Promise.all([
    db.collection('countries').get(),
    db.collectionGroup('destinations').get(),
    db.collection('destinationCatalog').get(),
    db.collection('recommendations').get(),
    db.collection('routes').get(),
    db.collection('trips').get(),
    db.collection('system/destinationRegistry/entries').get(),
  ]);
  return {
    countries: countries.docs.map((entry) => snapshotRecord(entry)),
    destinations: destinations.docs.map((entry) => {
      const countryRef = entry.ref.parent.parent;
      return snapshotRecord(entry, { countryId: countryRef?.id || '', cityId: entry.id });
    }),
    catalog: catalog.docs.map((entry) => snapshotRecord(entry)),
    registry: registry.docs.map((entry) => snapshotRecord(entry)),
    contents: [
      ...recommendations.docs.map((entry) => snapshotRecord(entry, { type: 'recommendation' })),
      ...routes.docs.map((entry) => snapshotRecord(entry, { type: 'route' })),
      ...trips.docs.map((entry) => snapshotRecord(entry, { type: 'trip' })),
    ],
  };
}

async function buildLiveManifest(adminApi) {
  const records = await loadLiveRecords(adminApi);
  return {
    projectId: adminApi.app().options.projectId,
    inventory: {
      countries: records.countries.length,
      destinations: records.destinations.length,
      catalog: records.catalog.length,
      contents: records.contents.length,
      registry: records.registry.length,
    },
    ...buildPublicationManifest(records),
  };
}

async function applyAction(adminApi, action) {
  const db = adminApi.firestore();
  const ref = db.doc(action.path);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const actualUpdateTime = normalizedUpdateTime(snapshot.updateTime);
    if (!snapshot.exists || actualUpdateTime !== action.updateTime) {
      throw new Error(`Document changed after dry-run: ${action.path}`);
    }
    const timestamp = adminApi.firestore.FieldValue.serverTimestamp();
    if (action.type === 'attest_destination_registry') {
      const registryRef = db.doc(action.registryPath);
      const registrySnapshot = await transaction.get(registryRef);
      const registryUpdateTime = normalizedUpdateTime(registrySnapshot.updateTime);
      if (!registrySnapshot.exists || registryUpdateTime !== action.registryUpdateTime) {
        throw new Error(`Registry changed after dry-run: ${action.registryPath}`);
      }
      transaction.update(ref, {
        'canonicalPolicy.approvalRevision': action.approvalRevision,
        'canonicalPolicy.registryAttestation': {
          approved: true,
          registryId: action.registryId,
          registryVersion: action.registryVersion,
          approvalRevision: action.approvalRevision,
          countryId: action.countryId,
          countryCode: action.countryCode,
          issuedBy: 'security_migration',
          issuedAt: timestamp,
        },
        updatedAt: timestamp,
      });
      transaction.update(registryRef, {
        destinationPath: action.path,
        approvalRevision: action.approvalRevision,
        updatedAt: timestamp,
      });
    } else if (action.type === 'delete_catalog') {
      transaction.delete(ref);
    } else if (action.type === 'verify_catalog') {
      transaction.update(ref, {
        status: 'active', canonicalApproved: true, updatedAt: timestamp,
      });
    } else if (action.type === 'verify_content_gate') {
      transaction.update(ref, {
        publicationGate: { destinationApprovalVerified: true }, updatedAt: timestamp,
      });
    } else if (action.type === 'hold_content') {
      const pendingDestination = action.pendingDestinations[0];
      transaction.update(ref, {
        status: 'moderation_hold',
        publicationGate: { destinationApprovalVerified: false },
        moderation: {
          holdReason: 'destination_pending_approval',
          systemGate: 'destination_pending_approval',
          pendingDestinationKeys: action.pendingDestinationKeys,
          ...(pendingDestination ? {
            destination: pendingDestination,
          } : {}),
        },
        updatedAt: timestamp,
      });
    } else if (action.type === 'clear_held_content_gate') {
      transaction.update(ref, {
        publicationGate: { destinationApprovalVerified: false }, updatedAt: timestamp,
      });
    } else if (action.type === 'set_recommendation_count') {
      transaction.update(ref, {
        'stats.recommendationCount': action.recommendationCount, updatedAt: timestamp,
      });
    } else {
      throw new Error(`Unsupported migration action: ${action.type}`);
    }
  });
}

async function run({ adminApi = admin, options }) {
  const actualProjectId = adminApi.app().options.projectId;
  if (actualProjectId !== options.projectId || options.projectId !== PRODUCTION_PROJECT_ID) {
    throw new Error(`Explicit --project ${PRODUCTION_PROJECT_ID} is required and must match the authenticated target.`);
  }
  const manifest = await buildLiveManifest(adminApi);
  if (!options.apply) return { mode: 'dry-run', ...manifest };
  if (options.confirmation !== CONFIRMATION) {
    throw new Error(`Apply requires --confirm ${CONFIRMATION}.`);
  }
  if (!options.expectedFingerprint || options.expectedFingerprint !== manifest.fingerprint) {
    throw new Error('The live manifest changed. Run dry-run again and pass its fingerprint.');
  }
  for (const action of manifest.actions) await applyAction(adminApi, action);
  await adminApi.firestore().doc(`system/migrations/destinationPublicationGate_${manifest.fingerprint}`).set({
    status: 'applied', fingerprint: manifest.fingerprint, counts: manifest.counts,
    appliedAt: adminApi.firestore.FieldValue.serverTimestamp(),
  });
  const verification = await buildLiveManifest(adminApi);
  if (verification.actions.length) throw new Error('Post-apply verification found remaining publication-gate actions.');
  return { mode: 'apply', fingerprint: manifest.fingerprint, applied: manifest.actions.length, verification };
}

if (require.main === module) {
  const options = parseArgs(process.argv.slice(2));
  if (!options.projectId) throw new Error(`Dry-run also requires --project ${PRODUCTION_PROJECT_ID}.`);
  const execute = options.apply
    ? () => {
      initializeAdmin(admin, { projectId: options.projectId, storageBucket: MEDIA_BUCKET });
      return run({ options });
    }
    : async () => ({
      mode: 'dry-run',
      ...await buildLiveManifestRest({
        projectId: options.projectId,
        accessToken: gcloudAccessToken().access_token,
      }),
    });
  execute()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => { console.error(error); process.exitCode = 1; })
    .finally(() => (admin.apps.length ? admin.app().delete() : undefined));
}

module.exports = {
  buildPublicationManifest,
  buildLiveManifestRest,
  contentReferenceAssessment,
  contentReferences,
  decodeFirestoreValue,
  loadLiveRecordsRest,
  manifestFingerprint,
  normalizedUpdateTime,
  parseArgs,
  run,
};
