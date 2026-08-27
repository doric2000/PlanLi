/* eslint-disable no-await-in-loop, no-console */
const crypto = require('crypto');
const admin = require('firebase-admin');
const { GoogleAuth } = require('google-auth-library');
const { googleAuthOptions, initializeAdmin } = require('./localCredentials');
const {
  BUDGET_IDS,
  CATEGORY_IDS,
  ENVIRONMENT_IDS,
  INTEREST_IDS,
  NEED_IDS,
  PACE_IDS,
  POST_BUDGET_IDS,
  RECOMMENDATION_CATALOG,
  RECOMMENDATION_CATEGORIES,
  RECOMMENDATION_SUBCATEGORIES,
  ROUTE_DIFFICULTY_IDS,
  ROUTE_EXPERIENCE_IDS,
  SEASON_IDS,
  TAG_IDS,
  TRANSPORT_MODE_IDS,
  TRAVELER_STYLE_IDS,
  TRAVEL_PARTY_IDS,
  VIBE_IDS,
  isRecommendationClassificationValid,
  taxonomy,
} = require('../travelTaxonomy');

const RECOMMENDATION_CATEGORY_BY_ID = Object.freeze(Object.fromEntries(
  RECOMMENDATION_CATEGORIES.map((item) => [item.id, item])
));
const RECOMMENDATION_SUBCATEGORY_BY_ID = Object.freeze(Object.fromEntries(
  RECOMMENDATION_SUBCATEGORIES.map((item) => [item.id, item])
));

const PROJECT_ID = 'planli-f0b12';
const US_BUCKET = 'planli-f0b12.firebasestorage.app';
const EU_BUCKET = 'planli-f0b12-media-eu';
const CORE_SERVICE_ACCOUNT =
  'planli-core-functions@planli-f0b12.iam.gserviceaccount.com';
const MEDIA_SERVICE_ACCOUNT =
  'planli-media-functions@planli-f0b12.iam.gserviceaccount.com';
const ALLOWED_ROOTS = new Set([
  'countries',
  'destinationCatalog',
  'notificationDevices',
  'publicProfiles',
  'recommendations',
  'routes',
  'system',
  'trips',
  'users',
]);

function isAllowedRoot(rootId) {
  return ALLOWED_ROOTS.has(rootId);
}
const FORBIDDEN_FIELDS = new Set([
  'created_at',
  'imageAsset',
  'imageAssets',
  'likedBy',
  'mediaVersion',
  'photoMediaVersion',
  'rating',
  'thumbnail_url',
  'tripDaysData',
]);

function initialize() {
  initializeAdmin(admin, { projectId: PROJECT_ID });
  return admin.firestore();
}

function favoriteKeyForPath(targetPath) {
  return crypto.createHash('sha256').update(targetPath).digest('base64url');
}

function canonicalArray(value, allowed, { minimum = 0 } = {}) {
  return Array.isArray(value) && value.length >= minimum &&
    value.every((entry) => typeof entry === 'string' && allowed.includes(entry));
}

function canonicalSearchIndex(search) {
  if (!search || typeof search !== 'object' || Object.hasOwn(search, 'tokens')) return false;
  return typeof search.normalizedTitle === 'string' && [
    'titleTokens',
    'taxonomyTokens',
    'destinationTokens',
    'descriptionTokens',
    'prefixes',
  ].every((field) => Array.isArray(search[field]) &&
    search[field].every((entry) => typeof entry === 'string'));
}

function taxonomyContentErrors(documentPath, data = {}) {
  const errors = [];
  const active = data.status === 'active';
  if (/^recommendations\/[^/]+$/.test(documentPath) && active) {
    if (data.taxonomyVersion !== taxonomy.version) errors.push('taxonomy-version');
    const catalogVersion = Number(data.recommendationCatalogVersion || 0);
    if (catalogVersion !== Number(RECOMMENDATION_CATALOG.schemaVersion || 0)) {
      errors.push('recommendation-catalog-version');
    }
    const catalogClassificationValid = isRecommendationClassificationValid({
      categoryId: data.categoryId,
      subcategoryIds: data.subcategoryIds,
      customSubcategoryLabel: data.customSubcategoryLabel,
    });
    if (!catalogClassificationValid) errors.push('recommendation-classification');
    if (data.category !== RECOMMENDATION_CATEGORY_BY_ID[data.categoryId]?.label) {
      errors.push('category-label');
    }
	if (!canonicalArray(data.tags || [], TAG_IDS)) errors.push('legacy-tags');
    const expectedCatalogInterests = [...new Set((data.subcategoryIds || []).flatMap(
      (subcategoryId) => RECOMMENDATION_SUBCATEGORY_BY_ID[subcategoryId]?.interestIds || []
    ))];
    if (!canonicalArray(data.catalogInterestIds, INTEREST_IDS) ||
        JSON.stringify(data.catalogInterestIds) !== JSON.stringify(expectedCatalogInterests)) {
      errors.push('catalog-interests');
    }
    if (!canonicalArray(data.facets?.catalogInterests, INTEREST_IDS) ||
        JSON.stringify(data.facets?.catalogInterests) !== JSON.stringify(expectedCatalogInterests)) {
      errors.push('catalog-interest-facets');
    }
    if (!canonicalArray(data.facets?.interests, INTEREST_IDS, { minimum: 1 })) errors.push('interests');
    if (!canonicalArray(data.facets?.audiences, TRAVEL_PARTY_IDS)) errors.push('audiences');
    if (!canonicalArray(data.facets?.vibes, VIBE_IDS)) errors.push('vibes');
    if (!canonicalArray(data.facets?.travelerStyles, TRAVELER_STYLE_IDS)) errors.push('traveler-styles');
    if (!canonicalArray(data.facets?.needs, NEED_IDS)) errors.push('needs');
    if (!canonicalArray(data.facets?.seasons, SEASON_IDS)) errors.push('seasons');
    if (!canonicalArray(data.facets?.environments, ENVIRONMENT_IDS)) errors.push('environments');
	if (!['all', 'selected'].includes(data.facets?.audienceScope)) errors.push('audience-scope');
	if (data.facets?.audienceScope === 'all' && data.facets.audiences.length) errors.push('universal-audiences');
	if (data.facets?.audienceScope === 'selected' && !data.facets.audiences.length) errors.push('selected-audiences');
	if (data.facets?.travelerStyles.length) errors.push('recommendation-styles');
	if (data.facets?.seasons.length) errors.push('recommendation-seasons');
	if (data.facets?.needs.length && data.facets?.needsScope !== 'recommendation') errors.push('needs-scope');
	if (!data.facets?.needs.length && data.facets?.needsScope) errors.push('empty-needs-scope');
	const budget = data.budget || '';
	const facetBudget = data.facets?.budgetLevel || '';
	if (budget && !POST_BUDGET_IDS.includes(budget)) errors.push('budget');
	if (budget !== facetBudget) errors.push('budget-facet-mismatch');
    if (!['exact', 'destination', 'pin'].includes(data.locationMode)) errors.push('location-mode');
    if (data.locationMode === 'exact' && !data.place?.placeId) errors.push('exact-place');
    if (data.locationMode === 'destination' && data.place?.placeId) errors.push('general-place-point');
    if (data.locationMode === 'pin' &&
        (data.place?.source !== 'manual_pin' || !Number.isFinite(data.place?.coordinates?.lat) ||
          !Number.isFinite(data.place?.coordinates?.lng))) errors.push('manual-pin');
    if (!data.details || typeof data.details !== 'object' || Array.isArray(data.details)) errors.push('details');
    if (data.categoryId === 'events' && !String(data.details?.eventSchedule || '').trim()) {
      errors.push('event-schedule');
    }
    if (!canonicalSearchIndex(data.search)) errors.push('search');
  }
  if (/^routes\/[^/]+$/.test(documentPath) && active) {
    const streamlined = Number(data.routeSchemaVersion || 0) >= 2;
    if (data.taxonomyVersion !== taxonomy.version) errors.push('taxonomy-version');
	if (!canonicalArray(data.categoryIds, CATEGORY_IDS, { minimum: streamlined ? 0 : 1 })) errors.push('categories');
	if (!canonicalArray(data.subcategoryIds, TAG_IDS, { minimum: streamlined ? 0 : 1 })) errors.push('subcategories');
	const routeTagCategories = new Set((data.subcategoryIds || []).map(
		(tagId) => taxonomy.tags.find((tag) => tag.id === tagId)?.categoryId
	).filter(Boolean));
	if (!(data.categoryIds || []).every((categoryId) => routeTagCategories.has(categoryId)) ||
		(data.subcategoryIds || []).some((tagId) => !data.categoryIds?.includes(
			taxonomy.tags.find((tag) => tag.id === tagId)?.categoryId
		))) errors.push('subcategory-category-match');
	if (!canonicalArray(data.facets?.interests, INTEREST_IDS, { minimum: streamlined ? 0 : 1 })) errors.push('interests');
	if (!canonicalArray(data.facets?.audiences, TRAVEL_PARTY_IDS)) errors.push('audiences');
    if (!canonicalArray(data.facets?.vibes, VIBE_IDS)) errors.push('vibes');
    if (!canonicalArray(data.facets?.travelerStyles, TRAVELER_STYLE_IDS)) errors.push('traveler-styles');
    if (!canonicalArray(data.facets?.needs, NEED_IDS)) errors.push('needs');
    if (!canonicalArray(data.facets?.seasons, SEASON_IDS)) errors.push('seasons');
    if (!canonicalArray(data.facets?.environments, ENVIRONMENT_IDS)) errors.push('environments');
	if (!['all', 'selected'].includes(data.facets?.audienceScope)) errors.push('audience-scope');
	if (data.facets?.audienceScope === 'all' && data.facets.audiences.length) errors.push('universal-audiences');
	if (data.facets?.audienceScope === 'selected' && !data.facets.audiences.length) errors.push('selected-audiences');
	if (data.facets?.needs.length && data.facets?.needsScope !== 'entire_route') errors.push('needs-scope');
	if (!data.facets?.needs.length && data.facets?.needsScope) errors.push('empty-needs-scope');
	if (!POST_BUDGET_IDS.includes(data.facets?.budgetLevel)) errors.push('budget');
	if (data.difficulty && !ROUTE_DIFFICULTY_IDS.includes(data.difficulty)) errors.push('difficulty');
    if (data.experienceLevel && !ROUTE_EXPERIENCE_IDS.includes(data.experienceLevel)) errors.push('experience');
    if (!canonicalArray(data.transportModes, TRANSPORT_MODE_IDS, { minimum: streamlined ? 0 : 1 })) errors.push('transport');
	if (data.pace && !PACE_IDS.includes(data.pace)) errors.push('pace');
	if (!streamlined && !data.facets?.seasons.length) errors.push('seasons-required');
	if (!streamlined && data.facets?.environments.length !== 1) errors.push('environment-required');
    if (!Array.isArray(data.destinations) || !data.destinations.length ||
      data.destinations.some((entry) => !entry?.countryId || !entry?.cityId)) errors.push('destinations');
    if (!canonicalSearchIndex(data.search)) errors.push('search');
  }
  if (/^users\/[^/]+$/.test(documentPath)) {
    const profile = data.smartProfile || {};
    const allowedFields = new Set([
      'setupRequired', 'completedAt', 'interests', 'budget', 'travelParties', 'vibe', 'travelerStyles', 'pace', 'needs',
      'onboardingVersion',
    ]);
    if (Object.keys(profile).some((key) => !allowedFields.has(key))) errors.push('profile-fields');
    if (profile.onboardingVersion != null && Number(profile.onboardingVersion) !== 2) {
      errors.push('profile-onboarding-version');
    }
    if (!canonicalArray(profile.interests || [], INTEREST_IDS)) errors.push('profile-interests');
    if (profile.budget && !BUDGET_IDS.includes(profile.budget)) errors.push('profile-budget');
    if (!canonicalArray(profile.travelParties || [], TRAVEL_PARTY_IDS)) errors.push('profile-parties');
    if (!canonicalArray(profile.vibe || [], VIBE_IDS)) errors.push('profile-vibes');
    if (!canonicalArray(profile.travelerStyles || [], TRAVELER_STYLE_IDS)) errors.push('profile-styles');
    if (profile.pace && !PACE_IDS.includes(profile.pace)) errors.push('profile-pace');
    if (!canonicalArray(profile.needs || [], NEED_IDS)) errors.push('profile-needs');
  }
  return errors;
}

function inspectValue(value, documentPath, keyPath, report) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      inspectValue(entry, documentPath, `${keyPath}[${index}]`, report));
    return;
  }
  if (!value || typeof value !== 'object') {
    if (typeof value === 'string') {
      if (value.includes(US_BUCKET)) {
        report.usReferences.push({ documentPath, field: keyPath });
      }
      if (value.includes(EU_BUCKET)) report.euReferenceCount += 1;
    }
    return;
  }
  if (value instanceof admin.firestore.Timestamp ||
      value instanceof admin.firestore.GeoPoint ||
      value instanceof admin.firestore.DocumentReference) return;
  for (const [key, entry] of Object.entries(value)) {
    const nextPath = keyPath ? `${keyPath}.${key}` : key;
    if (FORBIDDEN_FIELDS.has(key)) {
      report.forbiddenFields.push({ documentPath, field: nextPath });
    }
    inspectValue(entry, documentPath, nextPath, report);
  }
}

async function collectAllDocuments(db) {
  const result = [];
  const roots = await db.listCollections();

  async function visitCollection(collection) {
    const snapshot = await collection.get();
    for (const document of snapshot.docs) {
      result.push(document);
      const children = await document.ref.listCollections();
      for (const child of children) await visitCollection(child);
    }
  }

  for (const root of roots) await visitCollection(root);
  return { roots: roots.map((entry) => entry.id).sort(), documents: result };
}

function allowedMergedProviderGroup(documents) {
  if (!Array.isArray(documents) || documents.length < 2) return false;
  const active = documents.filter((document) => document.data()?.status === 'active');
  if (active.length !== 1) return false;
  const activePath = active[0].ref.path;
  return documents.every((document) => {
    if (document.ref.path === activePath) return true;
    const data = document.data() || {};
    const mergedPath = data.mergedInto?.countryId && data.mergedInto?.cityId
      ? `countries/${data.mergedInto.countryId}/destinations/${data.mergedInto.cityId}`
      : '';
    return data.status === 'inactive' && mergedPath === activePath;
  });
}

async function auditFirestore(db) {
  const { roots, documents } = await collectAllDocuments(db);
  const report = {
    roots,
    documentCount: documents.length,
    unexpectedRoots: roots.filter((root) => !isAllowedRoot(root)),
    forbiddenFields: [],
    usReferences: [],
    euReferenceCount: 0,
    invalidCountryIds: [],
    invalidCityIds: [],
    duplicateCountryCodes: [],
    duplicateCityProviders: [],
    invalidFavorites: [],
    orphanFavorites: [],
    counterMismatches: [],
    invalidTaxonomyContent: [],
    profileCountMismatch: null,
    sampleMediaPath: null,
  };
  const byPath = new Map(documents.map((document) => [document.ref.path, document]));
  const countriesByCode = new Map();
  const citiesByProvider = new Map();
  const content = documents.filter((document) =>
    /^(recommendations|routes|trips)\/[^/]+$/.test(document.ref.path));

  for (const document of documents) {
    const data = document.data() || {};
    inspectValue(data, document.ref.path, '', report);
    const taxonomyErrors = taxonomyContentErrors(document.ref.path, data);
    if (taxonomyErrors.length) report.invalidTaxonomyContent.push({ documentPath: document.ref.path, errors: taxonomyErrors });
    if (!report.sampleMediaPath && Array.isArray(data.media)) {
      report.sampleMediaPath = data.media.find((asset) => asset?.thumb?.path)?.thumb?.path || null;
    }
    if (/^countries\/[^/]+$/.test(document.ref.path)) {
      if (!/^[A-Z]{2}$/.test(document.id)) report.invalidCountryIds.push(document.ref.path);
      const code = String(data.code || '').toUpperCase();
      if (code) {
        if (countriesByCode.has(code)) report.duplicateCountryCodes.push(code);
        countriesByCode.set(code, document.ref.path);
      }
    }
    if (/^countries\/[^/]+\/destinations\/[^/]+$/.test(document.ref.path)) {
      if (!/^dst_[A-Za-z0-9_-]{20}$/.test(document.id)) report.invalidCityIds.push(document.ref.path);
      const providerId = String(data.providerRefs?.googlePlaceId || '').trim();
      if (providerId) {
        citiesByProvider.set(providerId, [...(citiesByProvider.get(providerId) || []), document]);
      }
    }
    if (/^users\/[^/]+\/favorites\/[^/]+$/.test(document.ref.path)) {
      const targetPath = String(data.target?.path || '');
      if (!targetPath || document.id !== favoriteKeyForPath(targetPath)) {
        report.invalidFavorites.push(document.ref.path);
      } else if (!byPath.has(targetPath)) {
        report.orphanFavorites.push({ favorite: document.ref.path, target: targetPath });
      }
    }
  }

  for (const [providerId, providerDocuments] of citiesByProvider) {
    if (providerDocuments.length > 1 && !allowedMergedProviderGroup(providerDocuments)) {
      report.duplicateCityProviders.push(providerId);
    }
  }

  for (const document of content) {
    const data = document.data() || {};
    const prefix = `${document.ref.path}/`;
    const likes = documents.filter((entry) =>
      entry.ref.path.startsWith(`${prefix}likes/`) && entry.ref.path.split('/').length === 4).length;
    const comments = documents.filter((entry) =>
      entry.ref.path.startsWith(`${prefix}comments/`) && entry.ref.path.split('/').length === 4).length;
    const expectedLikes = Number(data.stats?.likeCount || 0);
    const expectedComments = Number(data.stats?.commentCount || 0);
    if (likes !== expectedLikes || comments !== expectedComments) {
      report.counterMismatches.push({
        documentPath: document.ref.path,
        expected: { likes: expectedLikes, comments: expectedComments },
        actual: { likes, comments },
      });
    }
  }

  const userCount = documents.filter((document) => /^users\/[^/]+$/.test(document.ref.path)).length;
  const profileCount = documents.filter((document) =>
    /^publicProfiles\/[^/]+$/.test(document.ref.path)).length;
  if (userCount !== profileCount) report.profileCountMismatch = { userCount, profileCount };
  return report;
}

async function listBucket(bucket) {
  const files = [];
  let pageToken;
  do {
    const [page, , response] = await bucket.getFiles({
      autoPaginate: false,
      maxResults: 1000,
      ...(pageToken ? { pageToken } : {}),
    });
    files.push(...page);
    pageToken = response?.nextPageToken;
  } while (pageToken);
  return files;
}

function checksum(metadata = {}) {
  return metadata.crc32c || metadata.md5Hash || null;
}

async function auditStorage() {
  const storage = admin.storage();
  const usBucket = storage.bucket(US_BUCKET);
  const euBucket = storage.bucket(EU_BUCKET);
  const [[usMetadata], [euMetadata], usFiles, euFiles] = await Promise.all([
    usBucket.getMetadata(),
    euBucket.getMetadata(),
    listBucket(usBucket),
    listBucket(euBucket),
  ]);
  const euByName = new Map(euFiles.map((file) => [file.name, file]));
  const missingInEurope = [];
  const checksumMismatches = [];
  for (const source of usFiles) {
    const target = euByName.get(source.name);
    if (!target) {
      missingInEurope.push(source.name);
      continue;
    }
    if (String(source.metadata.size) !== String(target.metadata.size) ||
        checksum(source.metadata) !== checksum(target.metadata)) {
      checksumMismatches.push(source.name);
    }
  }
  const sumBytes = (files) => files.reduce(
    (total, file) => total + Number(file.metadata.size || 0), 0);
  const prefixes = (files) => Object.fromEntries(
    [...files.reduce((counts, file) => {
      const prefix = file.name.split('/')[0] || '(root)';
      counts.set(prefix, (counts.get(prefix) || 0) + 1);
      return counts;
    }, new Map())].sort(([left], [right]) => left.localeCompare(right))
  );
  const corsOrigins = [...new Set(
    (euMetadata.cors || []).flatMap((entry) => entry.origin || [])
  )].sort();
  const stagingLifecycle = (euMetadata.lifecycle?.rule || []).some((rule) =>
    rule.action?.type === 'Delete' &&
    Number(rule.condition?.age) === 1 &&
    (rule.condition?.matchesPrefix || []).some((prefix) => prefix === 'media-staging/')
  );
  return {
    us: {
      location: usMetadata.location,
      objectCount: usFiles.length,
      bytes: sumBytes(usFiles),
      prefixes: prefixes(usFiles),
    },
    eu: {
      location: euMetadata.location,
      storageClass: euMetadata.storageClass,
      uniformAccess: euMetadata.iamConfiguration?.uniformBucketLevelAccess?.enabled === true,
      softDeleteSeconds: euMetadata.softDeletePolicy?.retentionDurationSeconds || null,
      corsOrigins,
      stagingLifecycle,
      objectCount: euFiles.length,
      bytes: sumBytes(euFiles),
      prefixes: prefixes(euFiles),
    },
    missingInEurope,
    checksumMismatches,
  };
}

async function auditFunctions() {
  const auth = new GoogleAuth({
    ...googleAuthOptions({ projectId: PROJECT_ID }),
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  const client = await auth.getClient();
  const functions = [];
  let pageToken = null;
  do {
    const url = new URL(
      `https://cloudfunctions.googleapis.com/v2/projects/${PROJECT_ID}/locations/-/functions`
    );
    url.searchParams.set('filter', 'environment="GEN_2"');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const response = await client.request({ url: url.toString() });
    functions.push(...(response.data.functions || []));
    pageToken = response.data.nextPageToken || null;
  } while (pageToken);
  const byServiceAccount = {};
  const unexpected = [];
  for (const cloudFunction of functions) {
    const name = cloudFunction.name.split('/').pop();
    const serviceAccount = cloudFunction.serviceConfig?.serviceAccountEmail || null;
    byServiceAccount[serviceAccount] = (byServiceAccount[serviceAccount] || 0) + 1;
    if (!cloudFunction.name.includes('/locations/europe-west1/')) {
      unexpected.push({ name, reason: 'wrong-region' });
    }
    if (cloudFunction.buildConfig?.runtime !== 'nodejs22') {
      unexpected.push({ name, reason: 'wrong-runtime' });
    }
    if (cloudFunction.state !== 'ACTIVE') unexpected.push({ name, reason: cloudFunction.state });
    if (![CORE_SERVICE_ACCOUNT, MEDIA_SERVICE_ACCOUNT].includes(serviceAccount)) {
      unexpected.push({ name, reason: `unexpected-service-account:${serviceAccount}` });
    }
  }
  return { count: functions.length, byServiceAccount, unexpected };
}

async function verifyPublicMediaRead(mediaPath) {
  if (!mediaPath) return { pathFound: false, status: null };
  const url =
    `https://firebasestorage.googleapis.com/v0/b/${EU_BUCKET}/o/` +
    `${encodeURIComponent(mediaPath)}?alt=media`;
  const response = await fetch(url, { headers: { Range: 'bytes=0-0' } });
  if (response.body) await response.body.cancel();
  return {
    pathFound: true,
    status: response.status,
    readable: response.ok || response.status === 206,
  };
}

function failures(report) {
  const firestore = report.firestore;
  const storage = report.storage;
  return [
    ...firestore.unexpectedRoots,
    ...firestore.forbiddenFields,
    ...firestore.usReferences,
    ...firestore.invalidCountryIds,
    ...firestore.invalidCityIds,
    ...firestore.duplicateCountryCodes,
    ...firestore.duplicateCityProviders,
    ...firestore.invalidFavorites,
    ...firestore.orphanFavorites,
    ...firestore.counterMismatches,
    ...firestore.invalidTaxonomyContent,
    ...(firestore.profileCountMismatch ? [firestore.profileCountMismatch] : []),
    ...storage.missingInEurope,
    ...storage.checksumMismatches,
    ...(String(storage.eu.location).toUpperCase() === 'EUROPE-WEST1' ? [] : ['wrong EU location']),
    ...(storage.eu.uniformAccess ? [] : ['uniform access disabled']),
    ...(storage.eu.corsOrigins.includes('*') ? ['wildcard CORS origin'] : []),
    ...(storage.eu.stagingLifecycle ? [] : ['staging lifecycle missing']),
    ...report.functions.unexpected,
    ...(report.functions.count > 0 ? [] : ['no deployed functions']),
    ...(report.publicMediaRead.pathFound && !report.publicMediaRead.readable
      ? ['public media read failed']
      : []),
  ];
}

async function main() {
  const db = initialize();
  const firestore = await auditFirestore(db);
  const report = {
    auditedAt: new Date().toISOString(),
    firestore,
    storage: await auditStorage(),
    functions: await auditFunctions(),
    publicMediaRead: await verifyPublicMediaRead(firestore.sampleMediaPath),
  };
  delete report.firestore.sampleMediaPath;
  const detectedFailures = failures(report);
  report.ok = detectedFailures.length === 0;
  report.failureCount = detectedFailures.length;
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  allowedMergedProviderGroup,
  auditFirestore,
  favoriteKeyForPath,
  failures,
  inspectValue,
  isAllowedRoot,
  taxonomyContentErrors,
};
