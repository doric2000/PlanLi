const { HttpsError } = require('firebase-functions/v2/https');
const {
  INTEREST_IDS,
  isSmartProfileComplete,
  NEED_IDS,
  normalizeRecommendationTags,
  normalizeSmartProfile,
  POST_BUDGET_IDS,
  TRAVEL_PARTY_IDS,
  VIBE_IDS,
} = require('./travelTaxonomy');

const DAY_MS = 24 * 60 * 60 * 1000;
const AFFINITY_HALF_LIFE_MS = 90 * DAY_MS;
const RECENCY_HALF_LIFE_MS = 30 * DAY_MS;
const MAX_DESTINATIONS = 20;
const MAX_RECENT_OPENS = 50;
const MAX_AFFINITY = 20;

function assert(condition, code, message) {
  if (!condition) throw new HttpsError(code, message);
}

function cleanId(value, field) {
  assert(typeof value === 'string', 'invalid-argument', `${field} must be a string.`);
  const text = value.trim();
  assert(text && text.length <= 180 && !text.includes('/'), 'invalid-argument', `${field} is invalid.`);
  return text;
}

function clamp(value, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, Number(value) || 0));
}

function timestampMs(value) {
  if (typeof value === 'number') return value;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function decayFactor(elapsedMs, halfLifeMs = AFFINITY_HALF_LIFE_MS) {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 1;
  return Math.pow(0.5, elapsedMs / halfLifeMs);
}

function decayScoreMap(source, factor, allowed) {
  const result = {};
  const allowedSet = new Set(allowed);
  for (const [key, raw] of Object.entries(source || {})) {
    if (!allowedSet.has(key)) continue;
    const score = clamp((Number(raw) || 0) * factor, 0, MAX_AFFINITY);
    if (score >= 0.01) result[key] = Number(score.toFixed(4));
  }
  return result;
}

function normalizePersonalization(existing = {}, nowMs = Date.now()) {
  const previousUpdatedAtMs = Number(existing.updatedAtMs || nowMs);
  const factor = decayFactor(nowMs - previousUpdatedAtMs);
  const scores = existing.facetScores || {};
  const destinations = (Array.isArray(existing.destinations) ? existing.destinations : [])
    .map((entry) => ({
      countryId: String(entry?.countryId || ''),
      cityId: String(entry?.cityId || ''),
      score: Number((clamp((Number(entry?.score) || 0) * factor, 0, MAX_AFFINITY)).toFixed(4)),
      updatedAtMs: Number(entry?.updatedAtMs || previousUpdatedAtMs),
    }))
    .filter((entry) => entry.countryId && entry.cityId && entry.score >= 0.01)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_DESTINATIONS);
  return {
    facetScores: {
      interests: decayScoreMap(scores.interests, factor, INTEREST_IDS),
      audiences: decayScoreMap(scores.audiences, factor, TRAVEL_PARTY_IDS),
      vibes: decayScoreMap(scores.vibes, factor, VIBE_IDS),
      needs: decayScoreMap(scores.needs, factor, NEED_IDS),
    },
    destinations,
    recentOpens: (Array.isArray(existing.recentOpens) ? existing.recentOpens : [])
      .filter((entry) => typeof entry?.path === 'string' && nowMs - Number(entry.openedAtMs || 0) <= 30 * DAY_MS)
      .slice(0, MAX_RECENT_OPENS),
    ...(typeof existing.historySeedVersion === 'string'
      ? { historySeedVersion: existing.historySeedVersion }
      : {}),
    updatedAtMs: nowMs,
  };
}

function adjustMap(map, keys, delta, allowed) {
  const allowedSet = new Set(allowed);
  for (const key of Array.isArray(keys) ? keys : []) {
    if (!allowedSet.has(key)) continue;
    const next = clamp((Number(map[key]) || 0) + delta, 0, MAX_AFFINITY);
    if (next < 0.01) delete map[key];
    else map[key] = Number(next.toFixed(4));
  }
}

function targetDestination(target, targetData) {
  if (target?.type === 'city') {
    return { countryId: target.countryId, cityId: target.id };
  }
  const destination = targetData?.destination;
  return destination?.countryId && destination?.cityId
    ? { countryId: destination.countryId, cityId: destination.cityId }
    : null;
}

function applyPersonalizationSignal({ existing, target, targetData, delta, action, nowMs = Date.now() }) {
  const personalization = normalizePersonalization(existing, nowMs);
  const path = target?.path || `${target?.type || 'recommendation'}s/${target?.id || ''}`;
  if (action === 'open') {
    const previous = personalization.recentOpens.find((entry) => entry.path === path);
    if (previous && nowMs - Number(previous.openedAtMs || 0) < DAY_MS) {
      return { personalization, changed: false };
    }
    personalization.recentOpens = [
      { path, openedAtMs: nowMs },
      ...personalization.recentOpens.filter((entry) => entry.path !== path),
    ].slice(0, MAX_RECENT_OPENS);
  }

  const facets = targetData?.facets || {};
  adjustMap(personalization.facetScores.interests, facets.interests, delta, INTEREST_IDS);
  adjustMap(personalization.facetScores.audiences, facets.audiences, delta, TRAVEL_PARTY_IDS);
  adjustMap(personalization.facetScores.vibes, facets.vibes, delta, VIBE_IDS);
  adjustMap(personalization.facetScores.needs, facets.needs, delta, NEED_IDS);

  const destination = targetDestination(target, targetData);
  if (destination) {
    const existingDestination = personalization.destinations.find(
      (entry) => entry.countryId === destination.countryId && entry.cityId === destination.cityId
    );
    const nextScore = clamp((existingDestination?.score || 0) + delta, 0, MAX_AFFINITY);
    personalization.destinations = [
      ...(nextScore > 0
        ? [{ ...destination, score: Number(nextScore.toFixed(4)), updatedAtMs: nowMs }]
        : []),
      ...personalization.destinations.filter(
        (entry) => entry.countryId !== destination.countryId || entry.cityId !== destination.cityId
      ),
    ].sort((a, b) => b.score - a.score).slice(0, MAX_DESTINATIONS);
  }

  return { personalization, changed: true };
}

async function applyAffinitySignalInTransaction({
  transaction,
  db,
  admin,
  userId,
  target,
  targetData,
  delta,
  action,
  nowMs = Date.now(),
}) {
  if (!userId || !targetData || !delta) return false;
  if (!['recommendation', 'city'].includes(target?.type)) return false;
  const userRef = db.doc(`users/${userId}`);
  const userSnapshot = await transaction.get(userRef);
  if (!userSnapshot.exists) return false;
  const result = applyPersonalizationSignal({
    existing: userSnapshot.data()?.personalization,
    target,
    targetData,
    delta,
    action,
    nowMs,
  });
  if (!result.changed) return false;
  transaction.set(userRef, {
    personalization: result.personalization,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  return true;
}

function overlapScore(wanted, actual, missingValue = 0.5) {
  if (!Array.isArray(wanted) || wanted.length === 0) return 0.5;
  if (!Array.isArray(actual) || actual.length === 0) return missingValue;
  const actualSet = new Set(actual);
  return wanted.filter((value) => actualSet.has(value)).length / wanted.length;
}

function budgetScore(preferred, actual) {
  if (!preferred || preferred === 'flexible') return 0.5;
  if (!actual) return 0.5;
  const ordered = ['economy', 'balanced', 'comfort', 'premium'];
  const distance = Math.abs(ordered.indexOf(preferred) - ordered.indexOf(actual));
  if (distance === 0) return 1;
  if (distance === 1) return 0.6;
  return 0.2;
}

function affinityFor(map, keys) {
  if (!Array.isArray(keys) || keys.length === 0) return 0;
  return Math.max(...keys.map((key) => clamp((Number(map?.[key]) || 0) / MAX_AFFINITY)));
}

function scoreRecommendation(item, profile = {}, personalization = {}, { nowMs = Date.now(), maxLikes = 1 } = {}) {
  const facets = item?.facets || {};
  const interest = overlapScore(profile.interests, facets.interests);
  const budget = budgetScore(profile.budget, facets.budgetLevel);
  const party = overlapScore(profile.travelParties, facets.audiences);
  const vibe = overlapScore(profile.vibe, facets.vibes);
  const needs = overlapScore(profile.needs, facets.needs, 0);
  const explicitScore = interest * 25 + budget * 10 + party * 8 + vibe * 7 + needs * 5;

  const scores = personalization.facetScores || {};
  const facetAffinity = Math.max(
    affinityFor(scores.interests, facets.interests),
    affinityFor(scores.audiences, facets.audiences),
    affinityFor(scores.vibes, facets.vibes),
    affinityFor(scores.needs, facets.needs)
  );
  const destinationAffinity = (personalization.destinations || []).find(
    (entry) => entry.countryId === item?.destination?.countryId && entry.cityId === item?.destination?.cityId
  );
  const behaviorScore = facetAffinity * 15 + clamp((destinationAffinity?.score || 0) / MAX_AFFINITY) * 10;

  const likes = Math.max(0, Number(item?.stats?.likeCount || 0));
  const popularity = maxLikes > 0 ? Math.log1p(likes) / Math.log1p(maxLikes) : 0;
  const ageMs = Math.max(0, nowMs - timestampMs(item?.createdAt));
  const recency = decayFactor(ageMs, RECENCY_HALF_LIFE_MS);
  const qualityScore = popularity * 12 + recency * 8;

  const reasons = [];
  const matchedInterest = (profile.interests || []).find((id) => facets.interests?.includes(id));
  const matchedParty = (profile.travelParties || []).find((id) => facets.audiences?.includes(id));
  if (matchedInterest) reasons.push(`interest:${matchedInterest}`);
  if (budget >= 0.6 && profile.budget && profile.budget !== 'flexible') reasons.push('budget');
  if (matchedParty) reasons.push(`party:${matchedParty}`);

  return {
    item,
    explicitScore,
    behaviorScore,
    qualityScore,
    score: explicitScore + behaviorScore + qualityScore,
    reasons: reasons.slice(0, 1),
  };
}

function interleaveDiscovery(scored, limit) {
  const personalized = [...scored].sort(
    (a, b) => b.score - a.score || timestampMs(b.item?.createdAt) - timestampMs(a.item?.createdAt) ||
      String(a.item?.id).localeCompare(String(b.item?.id))
  );
  const protectedIds = new Set(personalized.slice(0, Math.ceil(limit * 0.8)).map((entry) => entry.item.id));
  const discovery = [...scored]
    .filter((entry) => !protectedIds.has(entry.item.id))
    .sort((a, b) => b.qualityScore - a.qualityScore || b.score - a.score ||
      timestampMs(b.item?.createdAt) - timestampMs(a.item?.createdAt) ||
      String(a.item?.id).localeCompare(String(b.item?.id)));
  const used = new Set();
  const result = [];
  while (result.length < limit && used.size < scored.length) {
    const discoverySlot = (result.length + 1) % 5 === 0;
    const source = discoverySlot ? discovery : personalized;
    let next = source.find((entry) => !used.has(entry.item.id));
    if (!next) next = personalized.find((entry) => !used.has(entry.item.id));
    if (!next) break;
    used.add(next.item.id);
    result.push(next);
  }
  return result;
}

function cleanFilters(filters = {}) {
  const stringArray = (value, maximum) => {
    assert(value == null || (Array.isArray(value) && value.length <= maximum),
      'invalid-argument', 'Recommendation filters are invalid.');
    assert((value || []).every((entry) => (
      typeof entry === 'string' && entry.trim().length >= 1 && entry.trim().length <= 80
    )), 'invalid-argument', 'Recommendation filters are invalid.');
    return Array.from(new Set((value || []).map((entry) => entry.trim())));
  };
  const budgetLevels = stringArray(filters.budgetLevels, 4);
  assert(budgetLevels.every((entry) => POST_BUDGET_IDS.includes(entry)), 'invalid-argument', 'Budget filters are invalid.');
  const rawTags = stringArray(filters.tags, 20);
  const tags = normalizeRecommendationTags(rawTags);
  assert(tags.length === rawTags.length, 'invalid-argument', 'Tag filters are invalid.');
  return {
    categoryIds: stringArray(filters.categoryIds, 10),
    tags,
    budgetLevels,
  };
}

function matchesFilters(item, filters) {
  if (filters.categoryIds.length && !filters.categoryIds.includes(item.categoryId)) return false;
  if (filters.tags.length && !normalizeRecommendationTags(item.tags)
    .some((tag) => filters.tags.includes(tag))) return false;
  if (filters.budgetLevels.length && !filters.budgetLevels.includes(item?.facets?.budgetLevel)) return false;
  return true;
}

async function candidateSnapshots(db, { context, interests }) {
  const collection = db.collection('recommendations');
  const base = () => {
    let query = collection.where('status', '==', 'active');
    if (context) query = query.where('destination.countryId', '==', context.countryId)
      .where('destination.cityId', '==', context.cityId);
    return query;
  };
  const queries = [
    base().orderBy('stats.likeCount', 'desc').limit(30).get(),
    base().orderBy('createdAt', 'desc').limit(30).get(),
  ];
  if (interests.length) {
    queries.push(base().where('facets.interests', 'array-contains-any', interests.slice(0, 8))
      .orderBy('createdAt', 'desc').limit(40).get());
  }
  return Promise.all(queries);
}

async function getPersonalizedRecommendations({ admin, auth, data }) {
  const startedAt = Date.now();
  const requestedLimit = Number(data?.limit || 30);
  assert(Number.isInteger(requestedLimit) && requestedLimit >= 1 && requestedLimit <= 30,
    'invalid-argument', 'limit is invalid.');
  const filters = cleanFilters(data?.filters);
  const context = data?.context
    ? {
        countryId: cleanId(data.context.countryId, 'context.countryId'),
        cityId: cleanId(data.context.cityId, 'context.cityId'),
      }
    : null;
  const db = admin.firestore();
  const userSnapshot = auth?.uid ? await db.doc(`users/${auth.uid}`).get() : null;
  const userData = userSnapshot?.exists ? userSnapshot.data() : {};
  const profile = userData.smartProfile || {};
  const personalized = Boolean(auth?.uid && isSmartProfileComplete(profile));
  const declaredProfile = personalized ? normalizeSmartProfile(profile) : {};
  const interests = declaredProfile.interests || [];
  let snapshots;
  let fallbackReason = null;
  try {
    snapshots = await candidateSnapshots(db, { context, interests });
  } catch (error) {
    fallbackReason = 'candidate-query-failed';
    let fallbackQuery = db.collection('recommendations').where('status', '==', 'active');
    if (context) fallbackQuery = fallbackQuery.where('destination.cityId', '==', context.cityId);
    else fallbackQuery = fallbackQuery.orderBy('stats.likeCount', 'desc');
    const fallback = await fallbackQuery.limit(requestedLimit).get();
    snapshots = [fallback];
  }
  const byId = new Map();
  snapshots.forEach((snapshot) => snapshot.docs.forEach((document) => {
    byId.set(document.id, { id: document.id, ...document.data() });
  }));
  const candidates = Array.from(byId.values()).filter((item) => (
    (!context || (
      item?.destination?.countryId === context.countryId &&
      item?.destination?.cityId === context.cityId
    )) && matchesFilters(item, filters)
  ));
  const maxLikes = Math.max(1, ...candidates.map((item) => Number(item?.stats?.likeCount || 0)));
  let output;
  if (personalized) {
    const normalized = normalizePersonalization(userData.personalization, startedAt);
    const scored = candidates.map((item) => scoreRecommendation(item, declaredProfile, normalized, {
      nowMs: startedAt,
      maxLikes,
    }));
    output = interleaveDiscovery(scored, requestedLimit).map((entry) => ({
      ...entry.item,
      personalization: { reasonCodes: entry.reasons },
    }));
  } else {
    output = candidates
      .sort((a, b) => Number(b?.stats?.likeCount || 0) - Number(a?.stats?.likeCount || 0) ||
        timestampMs(b.createdAt) - timestampMs(a.createdAt))
      .slice(0, requestedLimit);
  }
  const mode = fallbackReason ? 'fallback' : personalized ? 'personalized' : 'generic';
  console.info('personalized_recommendations', {
    mode,
    context: Boolean(context),
    candidates: candidates.length,
    returned: output.length,
    fallbackReason,
    latencyMs: Date.now() - startedAt,
  });
  return { mode, items: output };
}

async function consumeDiscoveryRateLimit({ admin, uid, nowMs }) {
  const ref = admin.firestore().doc(`users/${uid}/serverState/rateLimits_discovery`);
  await admin.firestore().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const previous = snapshot.data() || {};
    const inWindow = nowMs - Number(previous.windowStartedAtMs || 0) < 60 * 1000;
    const count = inWindow ? Number(previous.count || 0) : 0;
    assert(count < 120, 'resource-exhausted', 'Too many activity updates.');
    transaction.set(ref, {
      count: count + 1,
      windowStartedAtMs: inWindow ? previous.windowStartedAtMs : nowMs,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
}

async function recordDiscoverySignal({ admin, auth, data }) {
  assert(auth?.uid, 'unauthenticated', 'You must be signed in.');
  assert(data?.action === 'open', 'invalid-argument', 'Unsupported discovery signal.');
  const target = data?.target || {};
  assert(target.type === 'recommendation', 'invalid-argument', 'Unsupported discovery target.');
  const id = cleanId(target.id, 'target.id');
  const nowMs = Date.now();
  await consumeDiscoveryRateLimit({ admin, uid: auth.uid, nowMs });
  const db = admin.firestore();
  const normalizedTarget = { type: 'recommendation', id, path: `recommendations/${id}` };
  let changed = false;
  await db.runTransaction(async (transaction) => {
    const recommendation = await transaction.get(db.doc(normalizedTarget.path));
    assert(recommendation.exists && recommendation.data()?.status === 'active', 'not-found', 'Recommendation is unavailable.');
    changed = await applyAffinitySignalInTransaction({
      transaction,
      db,
      admin,
      userId: auth.uid,
      target: normalizedTarget,
      targetData: recommendation.data(),
      delta: 1,
      action: 'open',
      nowMs,
    });
  });
  return { recorded: changed };
}

async function resetPersonalizationActivity({ admin, auth }) {
  assert(auth?.uid, 'unauthenticated', 'You must be signed in.');
  const userRef = admin.firestore().doc(`users/${auth.uid}`);
  const userSnapshot = await userRef.get();
  assert(userSnapshot.exists, 'failed-precondition', 'Profile setup is unavailable.');
  await userRef.set({
    personalization: {
      facetScores: { interests: {}, audiences: {}, vibes: {}, needs: {} },
      destinations: [],
      recentOpens: [],
      updatedAtMs: Date.now(),
    },
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  return { reset: true };
}

module.exports = {
  AFFINITY_HALF_LIFE_MS,
  applyAffinitySignalInTransaction,
  applyPersonalizationSignal,
  cleanFilters,
  decayFactor,
  getPersonalizedRecommendations,
  interleaveDiscovery,
  matchesFilters,
  normalizePersonalization,
  recordDiscoverySignal,
  resetPersonalizationActivity,
  scoreRecommendation,
  scoreDiscoveryItem: scoreRecommendation,
};
