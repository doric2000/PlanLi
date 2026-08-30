#!/usr/bin/env node

const { gcloudAccessToken } = require('./localCredentials');

const PROJECT_ID = 'planli-f0b12';
const DATABASE_ID = '(default)';
const API_ROOT = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents`;
const MAX_DOCUMENTS = 20_000;
const MAX_COLLECTION_PATHS = 20_000;
const CONCURRENCY = 12;
const CREDENTIAL_PATTERNS = Object.freeze([
  { kind: 'gcp-api-key', pattern: /AIza[0-9A-Za-z_-]{35}/ },
  { kind: 'private-key', pattern: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/ },
  { kind: 'firebase-refresh-token', pattern: /\b1\/[0-9A-Za-z_-]{20,}/ },
  { kind: 'github-token', pattern: /\bgh[pousr]_[0-9A-Za-z]{30,}/ },
  { kind: 'aws-access-key', pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { kind: 'openai-api-key', pattern: /\bsk-(?:proj-)?[0-9A-Za-z_-]{20,}/ },
]);

function encodedPath(value) {
  return String(value).split('/').map(encodeURIComponent).join('/');
}

function relativeDocumentPath(name) {
  return String(name || '').split('/documents/')[1] || '';
}

function collectionShape(name) {
  return relativeDocumentPath(name).split('/').filter((_, index) => index % 2 === 0).join('/*/');
}

function inspectString(value, field, shape, findings) {
  for (const { kind, pattern } of CREDENTIAL_PATTERNS) {
    if (pattern.test(value)) findings.push({ collectionShape: shape, field, kind });
  }
}

function inspectFirestoreValue(value, field, shape, findings) {
  if (!value || typeof value !== 'object') return;
  if (typeof value.stringValue === 'string') inspectString(value.stringValue, field, shape, findings);
  for (const [key, entry] of Object.entries(value.mapValue?.fields || {})) {
    inspectFirestoreValue(entry, field ? `${field}.${key}` : key, shape, findings);
  }
  (value.arrayValue?.values || []).forEach((entry) =>
    inspectFirestoreValue(entry, `${field}[]`, shape, findings));
}

function credentialReferencesForDocument(document) {
  const findings = [];
  const shape = collectionShape(document?.name);
  for (const [field, value] of Object.entries(document?.fields || {})) {
    inspectFirestoreValue(value, field, shape, findings);
  }
  return findings;
}

function summarizeFindings(findings) {
  const grouped = new Map();
  for (const finding of findings) {
    const key = JSON.stringify(finding);
    grouped.set(key, (grouped.get(key) || 0) + 1);
  }
  return [...grouped.entries()]
    .map(([key, count]) => ({ ...JSON.parse(key), count }))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

async function requestJson(url, accessToken, { method = 'GET', body } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new Error(`Firestore REST audit failed with HTTP ${response.status}.`);
  return response.json();
}

async function listCollectionIds(accessToken, parentPath = '') {
  const url = parentPath
    ? `${API_ROOT}/${encodedPath(parentPath)}:listCollectionIds`
    : `${API_ROOT}:listCollectionIds`;
  const ids = [];
  let pageToken = '';
  do {
    const payload = await requestJson(url, accessToken, {
      method: 'POST',
      body: { pageSize: 1000, ...(pageToken ? { pageToken } : {}) },
    });
    ids.push(...(payload.collectionIds || []));
    pageToken = payload.nextPageToken || '';
  } while (pageToken);
  return ids;
}

async function listDocuments(accessToken, collectionPath) {
  const documents = [];
  let pageToken = '';
  do {
    const url = new URL(`${API_ROOT}/${encodedPath(collectionPath)}`);
    url.searchParams.set('pageSize', '300');
    url.searchParams.set('showMissing', 'true');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const payload = await requestJson(url, accessToken);
    documents.push(...(payload.documents || []));
    pageToken = payload.nextPageToken || '';
  } while (pageToken);
  return documents;
}

async function collectDocumentsRest(accessToken) {
  const rootIds = await listCollectionIds(accessToken);
  const pending = [...new Set(rootIds)].sort();
  const seenCollections = new Set();
  const documents = [];
  let documentCount = 0;

  while (pending.length) {
    const batch = pending.splice(0, CONCURRENCY)
      .filter((collectionPath) => !seenCollections.has(collectionPath));
    batch.forEach((collectionPath) => seenCollections.add(collectionPath));
    if (seenCollections.size > MAX_COLLECTION_PATHS) throw new Error('Collection-path safety limit exceeded.');
    const results = await Promise.all(batch.map(async (collectionPath) => {
      const documents = await listDocuments(accessToken, collectionPath);
      const children = [];
      for (const document of documents) {
        const documentPath = relativeDocumentPath(document.name);
        const childIds = await listCollectionIds(accessToken, documentPath);
        children.push(...childIds.map((id) => `${documentPath}/${id}`));
      }
      return { rawDocuments: documents, children };
    }));
    for (const result of results) {
      const liveDocuments = result.rawDocuments.filter((document) => (
        document.fields || document.createTime || document.updateTime
      ));
      documents.push(...liveDocuments);
      documentCount += liveDocuments.length;
      pending.push(...result.children.filter((entry) => !seenCollections.has(entry)));
    }
    if (documentCount > MAX_DOCUMENTS) throw new Error('Document safety limit exceeded.');
  }

  return {
    roots: [...new Set(rootIds)].sort(),
    documents,
    documentCount,
    collectionPathCount: seenCollections.size,
  };
}

async function audit({ tokenProvider = gcloudAccessToken } = {}) {
  const accessToken = tokenProvider().access_token;
  const inventory = await collectDocumentsRest(accessToken);
  const findings = inventory.documents.flatMap(credentialReferencesForDocument);

  const credentialReferences = summarizeFindings(findings);
  return {
    auditedAt: new Date().toISOString(),
    projectId: PROJECT_ID,
    databaseId: DATABASE_ID,
    documentCount: inventory.documentCount,
    collectionPathCount: inventory.collectionPathCount,
    credentialReferences,
    ok: credentialReferences.length === 0,
  };
}

if (require.main === module) {
  audit().then((report) => {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (!report.ok) process.exitCode = 1;
  }).catch((error) => {
    process.stderr.write(`Live credential-reference audit failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  audit,
  collectDocumentsRest,
  collectionShape,
  credentialReferencesForDocument,
  summarizeFindings,
};
