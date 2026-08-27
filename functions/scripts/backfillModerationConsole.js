/* eslint-disable no-await-in-loop, no-console */
const admin = require('firebase-admin');
const { initializeAdmin } = require('./localCredentials');
const { buildAdminSearchProjection, projectionId, targetForPath } = require('../adminSearchProjection');
const { buildModerationPreview } = require('../moderationPreview');
const { caseIdForTarget } = require('../moderationService');

const PAGE_SIZE = 200;
const UNITS = Object.freeze([
  { id: 'cases', kind: 'cases', collection: 'system/moderation/cases' },
  { id: 'held_recommendations', kind: 'held', collection: 'recommendations', type: 'recommendation' },
  { id: 'held_routes', kind: 'held', collection: 'routes', type: 'route' },
  { id: 'held_trips', kind: 'held', collection: 'trips', type: 'trip' },
  { id: 'search_recommendations', kind: 'search', collection: 'recommendations' },
  { id: 'search_routes', kind: 'search', collection: 'routes' },
  { id: 'search_trips', kind: 'search', collection: 'trips' },
  { id: 'search_profiles', kind: 'search', collection: 'publicProfiles' },
  { id: 'search_destinations', kind: 'search_group', collection: 'destinations' },
  { id: 'search_comments', kind: 'search_group', collection: 'comments' },
  { id: 'search_route_stops', kind: 'search_group', collection: 'stops' },
]);

function valueAfter(argv, flag) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : null;
}

function parseArgs(argv) {
  const parsedLimit = Number.parseInt(valueAfter(argv, '--limit'), 10);
  const requestedPhase = valueAfter(argv, '--phase') || 'all';
  if (!['all', 'cases', 'held', 'search'].includes(requestedPhase)) {
    throw new Error('--phase must be all, cases, held, or search.');
  }
  return {
    apply: argv.includes('--apply'),
    after: valueAfter(argv, '--after') || '',
    phase: requestedPhase,
    limit: Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 2000) : PAGE_SIZE,
  };
}

function unitsForPhase(phase) {
  if (phase === 'all') return UNITS;
  if (phase === 'cases') return UNITS.filter((unit) => unit.kind === 'cases');
  if (phase === 'held') return UNITS.filter((unit) => unit.kind === 'held');
  return UNITS.filter((unit) => unit.kind.startsWith('search'));
}

function splitCursor(value) {
  const separator = value.indexOf(':');
  return separator < 0 ? { unitId: '', documentId: '' } : {
    unitId: value.slice(0, separator),
    documentId: value.slice(separator + 1),
  };
}

function queryForUnit(db, unit, after, limit) {
  let query = unit.kind === 'search_group'
    ? db.collectionGroup(unit.collection)
    : db.collection(unit.collection);
  if (unit.kind === 'held') query = query.where('status', '==', 'moderation_hold');
  query = query.orderBy(admin.firestore.FieldPath.documentId()).limit(limit);
  return after ? query.startAfter(after) : query;
}

function missingCasePatch(value) {
  const patch = {};
  if (!Number.isSafeInteger(value.revision) || value.revision < 0) patch.revision = 0;
  if (!value.source) patch.source = value.reportCount ? 'report' : 'automatic';
  if (typeof value.assignmentUid !== 'string') patch.assignmentUid = value.assignment?.uid || '';
  if (!value.lastActivityAt) patch.lastActivityAt = value.updatedAt || value.firstReportedAt || admin.firestore.FieldValue.serverTimestamp();
  return patch;
}

function comparableValue(value) {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== 'object') return value;
  if (typeof value.toMillis === 'function') return { __timestampMs: value.toMillis() };
  if (value instanceof Date) return { __dateMs: value.getTime() };
  if (Array.isArray(value)) return value.map(comparableValue);
  return Object.fromEntries(Object.keys(value).sort().flatMap((key) => {
    const normalized = comparableValue(value[key]);
    return normalized === undefined ? [] : [[key, normalized]];
  }));
}

function equivalentProjection(existing, projection) {
  const { updatedAt: _existingUpdatedAt, ...existingValue } = existing || {};
  return JSON.stringify(comparableValue(existingValue)) === JSON.stringify(comparableValue(projection));
}

async function heldCaseChange(db, entry, unit) {
  const target = { type: unit.type, id: entry.id, path: entry.ref.path };
  const caseId = caseIdForTarget(target);
  const ref = db.doc(`system/moderation/cases/${caseId}`);
  const snapshot = await ref.get();
  if (snapshot.exists) {
    const patch = missingCasePatch(snapshot.data() || {});
    return Object.keys(patch).length ? { ref, patch, merge: true } : null;
  }
  const value = entry.data() || {};
  return {
    ref,
    merge: false,
    patch: {
      caseId,
      target,
      ...(value.ownerId ? { targetOwnerId: value.ownerId } : {}),
      targetPreview: buildModerationPreview({ target, data: value }),
      status: 'auto_held',
      priority: 'normal',
      source: 'automatic',
      revision: 0,
      assignmentUid: '',
      reportCount: 0,
      categoryCounts: {},
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastActivityAt: admin.firestore.FieldValue.serverTimestamp(),
    },
  };
}

async function searchProjectionChange(db, entry) {
  const target = targetForPath(entry.ref.path);
  if (!target) return null;
  const ref = db.doc(`system/moderation/search/${projectionId(entry.ref.path)}`);
  const parentData = target.type === 'comment' || target.subject?.kind === 'attached_place'
    ? (await db.doc(entry.ref.path.split('/').slice(0, 2).join('/')).get()).data() || null
    : null;
  if (target.subject?.kind === 'attached_place' && parentData?.activeRevisionId !== target.revisionId) {
    const snapshot = await ref.get();
    return snapshot.exists ? { ref, delete: true } : null;
  }
  const projection = buildAdminSearchProjection({ target, data: entry.data() || {}, parentData });
  const snapshot = await ref.get();
  if (snapshot.exists && equivalentProjection(snapshot.data() || {}, projection)) return null;
  return {
    ref,
    merge: false,
    patch: { ...projection, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
  };
}

async function changeForEntry(db, entry, unit) {
  if (unit.kind === 'cases') {
    const patch = missingCasePatch(entry.data() || {});
    return Object.keys(patch).length ? { ref: entry.ref, patch, merge: true } : null;
  }
  if (unit.kind === 'held') return heldCaseChange(db, entry, unit);
  return searchProjectionChange(db, entry);
}

async function runBackfill({ apply = false, after = '', phase = 'all', limit = PAGE_SIZE, db = admin.firestore() }) {
  const units = unitsForPhase(phase);
  const cursor = splitCursor(after);
  const startIndex = cursor.unitId ? units.findIndex((unit) => unit.id === cursor.unitId) : 0;
  if (startIndex < 0) throw new Error('The --after cursor does not belong to the selected phase.');
  let inspected = 0;
  let changed = 0;
  let written = 0;
  let nextAfter = null;
  for (let index = startIndex; index < units.length && inspected < limit; index += 1) {
    const unit = units[index];
    const remaining = Math.min(PAGE_SIZE, limit - inspected);
    const unitAfter = index === startIndex ? cursor.documentId : '';
    const snapshot = await queryForUnit(db, unit, unitAfter, remaining).get();
    const changes = [];
    for (const entry of snapshot.docs) {
      const change = await changeForEntry(db, entry, unit);
      if (change) changes.push(change);
    }
    inspected += snapshot.size;
    changed += changes.length;
    if (apply && changes.length) {
      const batch = db.batch();
      changes.forEach((change) => {
        if (change.delete) batch.delete(change.ref);
        else batch.set(change.ref, change.patch, { merge: change.merge });
      });
      await batch.commit();
      written += changes.length;
    }
    if (snapshot.size === remaining && inspected >= limit) {
      const last = snapshot.docs.at(-1);
      nextAfter = `${unit.id}:${unit.kind === 'search_group' ? last.ref.path : last.id}`;
      break;
    }
    if (snapshot.size === remaining && remaining === PAGE_SIZE) {
      const last = snapshot.docs.at(-1);
      nextAfter = `${unit.id}:${unit.kind === 'search_group' ? last.ref.path : last.id}`;
      break;
    }
  }
  return { mode: apply ? 'apply' : 'dry-run', phase, inspected, changed, written, nextAfter };
}

async function main() {
  initializeAdmin(admin);
  console.log(JSON.stringify(await runBackfill(parseArgs(process.argv.slice(2))), null, 2));
}

if (require.main === module) main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

module.exports = {
  equivalentProjection,
  parseArgs,
  runBackfill,
  searchProjectionChange,
  splitCursor,
  unitsForPhase,
};
