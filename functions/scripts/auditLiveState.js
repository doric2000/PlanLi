/* eslint-disable no-await-in-loop, no-console */
const crypto = require('crypto');
const admin = require('firebase-admin');
const { GoogleAuth } = require('google-auth-library');
const { googleAuthOptions, initializeAdmin } = require('./localCredentials');

const PROJECT_ID = 'planli-f0b12';
const US_BUCKET = 'planli-f0b12.firebasestorage.app';
const EU_BUCKET = 'planli-f0b12-media-eu';
const CORE_SERVICE_ACCOUNT =
  'planli-core-functions@planli-f0b12.iam.gserviceaccount.com';
const MEDIA_SERVICE_ACCOUNT =
  'planli-media-functions@planli-f0b12.iam.gserviceaccount.com';
const ALLOWED_ROOTS = new Set([
  'countries',
  'publicProfiles',
  'recommendations',
  'routes',
  'system',
  'trips',
  'users',
]);
const FORBIDDEN_FIELDS = new Set([
  'created_at',
  'imageAsset',
  'imageAssets',
  'likedBy',
  'mediaVersion',
  'photoMediaVersion',
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

async function auditFirestore(db) {
  const { roots, documents } = await collectAllDocuments(db);
  const report = {
    roots,
    documentCount: documents.length,
    unexpectedRoots: roots.filter((root) => !ALLOWED_ROOTS.has(root)),
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
    if (!report.sampleMediaPath && Array.isArray(data.media)) {
      report.sampleMediaPath = data.media.find((asset) => asset?.thumb?.path)?.thumb?.path || null;
    }
    if (/^countries\/[^/]+$/.test(document.ref.path)) {
      if (!document.id.startsWith('cty_')) report.invalidCountryIds.push(document.ref.path);
      const code = String(data.code || '').toUpperCase();
      if (code) {
        if (countriesByCode.has(code)) report.duplicateCountryCodes.push(code);
        countriesByCode.set(code, document.ref.path);
      }
    }
    if (/^countries\/[^/]+\/cities\/[^/]+$/.test(document.ref.path)) {
      if (!document.id.startsWith('city_')) report.invalidCityIds.push(document.ref.path);
      const providerId = String(data.googlePlaceId || '').trim();
      if (providerId) {
        if (citiesByProvider.has(providerId)) report.duplicateCityProviders.push(providerId);
        citiesByProvider.set(providerId, document.ref.path);
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
    ...(firestore.profileCountMismatch ? [firestore.profileCountMismatch] : []),
    ...storage.missingInEurope,
    ...storage.checksumMismatches,
    ...(String(storage.eu.location).toUpperCase() === 'EUROPE-WEST1' ? [] : ['wrong EU location']),
    ...(storage.eu.uniformAccess ? [] : ['uniform access disabled']),
    ...(storage.eu.corsOrigins.includes('*') ? ['wildcard CORS origin'] : []),
    ...(storage.eu.stagingLifecycle ? [] : ['staging lifecycle missing']),
    ...report.functions.unexpected,
    ...(report.functions.count > 0 ? [] : ['no deployed functions']),
    ...(report.publicMediaRead.readable ? [] : ['public media read failed']),
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
  auditFirestore,
  favoriteKeyForPath,
  failures,
  inspectValue,
};
