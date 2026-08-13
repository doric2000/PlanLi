const { HttpsError } = require('firebase-functions/v2/https');
const { attachRouteDestinationPreviews } = require('./routeDestinationPreviewService');
const {
  BUDGET_IDS,
  CATEGORY_IDS,
  ENVIRONMENT_IDS,
  INTEREST_IDS,
  isSmartProfileComplete,
  NEED_IDS,
  normalizeRecommendationTags,
  normalizeSmartProfile,
  PACE_IDS,
  ROUTE_DIFFICULTY_IDS,
	ROUTE_EXPERIENCE_IDS,
  SEASON_IDS,
  TRANSPORT_MODE_IDS,
  TRAVELER_STYLE_IDS,
  TRAVEL_PARTY_IDS,
  VIBE_IDS,
} = require('./travelTaxonomy');
const {
  destinationKey,
  matchesDestinations,
  parseSearchQuery,
  searchRelevance,
} = require('./discoverySearch');

const DAY_MS = 24 * 60 * 60 * 1000;
const AFFINITY_HALF_LIFE_MS = 90 * DAY_MS;
const RECENCY_HALF_LIFE_MS = 30 * DAY_MS;
const MAX_DESTINATIONS = 20;
const MAX_RECENT_OPENS = 50;
const MAX_AFFINITY = 20;
const MAX_CANDIDATES = 180;

function assert(condition, code, message) {
  if (!condition) throw new HttpsError(code, message);
}

function cleanId(value, field, { optional = false } = {}) {
  if (optional && (value == null || value === '')) return '';
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
  return {
    facetScores: {
      interests: decayScoreMap(scores.interests, factor, INTEREST_IDS),
      audiences: decayScoreMap(scores.audiences, factor, TRAVEL_PARTY_IDS),
      vibes: decayScoreMap(scores.vibes, factor, VIBE_IDS),
      travelerStyles: decayScoreMap(scores.travelerStyles, factor, TRAVELER_STYLE_IDS),
      needs: decayScoreMap(scores.needs, factor, NEED_IDS),
    },
    destinations: (Array.isArray(existing.destinations) ? existing.destinations : [])
      .map((entry) => ({
        countryId: String(entry?.countryId || ''),
        cityId: String(entry?.cityId || ''),
        score: Number(clamp((Number(entry?.score) || 0) * factor, 0, MAX_AFFINITY).toFixed(4)),
        updatedAtMs: Number(entry?.updatedAtMs || previousUpdatedAtMs),
      }))
      .filter((entry) => entry.countryId && entry.cityId && entry.score >= 0.01)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_DESTINATIONS),
    recentOpens: (Array.isArray(existing.recentOpens) ? existing.recentOpens : [])
      .filter((entry) => typeof entry?.path === 'string' && nowMs - Number(entry.openedAtMs || 0) <= 30 * DAY_MS)
      .slice(0, MAX_RECENT_OPENS),
    ...(typeof existing.historySeedVersion === 'string' ? { historySeedVersion: existing.historySeedVersion } : {}),
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

function targetDestinations(target, targetData) {
  if (target?.type === 'city') return [{ countryId: target.countryId, cityId: target.id }];
  const destinations = [
    targetData?.destination,
    ...(Array.isArray(targetData?.destinations) ? targetData.destinations : []),
  ].filter((item) => item?.countryId && item?.cityId);
  return Array.from(new Map(destinations.map((item) => [
    destinationKey(item.countryId, item.cityId),
    { countryId: item.countryId, cityId: item.cityId },
  ])).values()).slice(0, MAX_DESTINATIONS);
}

function applyPersonalizationSignal({ existing, target, targetData, delta, action, nowMs = Date.now() }) {
  const personalization = normalizePersonalization(existing, nowMs);
  const path = target?.path || `${target?.type || 'recommendation'}s/${target?.id || ''}`;
  if (action === 'open') {
    const previous = personalization.recentOpens.find((entry) => entry.path === path);
    if (previous && nowMs - Number(previous.openedAtMs || 0) < DAY_MS) return { personalization, changed: false };
    personalization.recentOpens = [
      { path, openedAtMs: nowMs },
      ...personalization.recentOpens.filter((entry) => entry.path !== path),
    ].slice(0, MAX_RECENT_OPENS);
  }

  const facets = targetData?.facets || {};
  adjustMap(personalization.facetScores.interests, facets.interests, delta, INTEREST_IDS);
  adjustMap(personalization.facetScores.audiences, facets.audiences, delta, TRAVEL_PARTY_IDS);
  adjustMap(personalization.facetScores.vibes, facets.vibes, delta, VIBE_IDS);
	if (target?.type === 'route') {
		adjustMap(personalization.facetScores.travelerStyles, facets.travelerStyles, delta, TRAVELER_STYLE_IDS);
	}
	const expectedNeedsScope = target?.type === 'route' ? 'entire_route' : 'recommendation';
	if (facets.needsScope === expectedNeedsScope) {
		adjustMap(personalization.facetScores.needs, facets.needs, delta, NEED_IDS);
	}

  for (const destination of targetDestinations(target, targetData)) {
    const previous = personalization.destinations.find((entry) => (
      entry.countryId === destination.countryId && entry.cityId === destination.cityId
    ));
    const nextScore = clamp((previous?.score || 0) + delta, 0, MAX_AFFINITY);
    personalization.destinations = [
      ...(nextScore > 0 ? [{ ...destination, score: Number(nextScore.toFixed(4)), updatedAtMs: nowMs }] : []),
      ...personalization.destinations.filter((entry) => (
        entry.countryId !== destination.countryId || entry.cityId !== destination.cityId
      )),
    ].sort((a, b) => b.score - a.score).slice(0, MAX_DESTINATIONS);
  }
  return { personalization, changed: true };
}

async function applyAffinitySignalInTransaction({ transaction, db, admin, userId, target, targetData, delta, action, nowMs = Date.now() }) {
  if (!userId || !targetData || !delta) return false;
  if (!['recommendation', 'route', 'city'].includes(target?.type)) return false;
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
  if (!actual || actual === 'flexible') return 0.5;
  const ordered = ['free', 'economy', 'balanced', 'comfort', 'premium'];
  const distance = Math.abs(ordered.indexOf(preferred) - ordered.indexOf(actual));
  if (distance === 0) return 1;
  if (distance === 1) return 0.6;
  return 0.2;
}

function affinityFor(map, keys) {
  if (!Array.isArray(keys) || keys.length === 0) return 0;
  return Math.max(...keys.map((key) => clamp((Number(map?.[key]) || 0) / MAX_AFFINITY)));
}

function itemDestinationAffinity(item, personalization) {
  const keys = new Set(targetDestinations({}, item).map((entry) => destinationKey(entry.countryId, entry.cityId)));
  return Math.max(0, ...(personalization.destinations || [])
    .filter((entry) => keys.has(destinationKey(entry.countryId, entry.cityId)))
    .map((entry) => Number(entry.score || 0)));
}

function scoreRecommendation(item, profile = {}, personalization = {}, {
  nowMs = Date.now(), maxLikes = 1, textScore = 0, route = false,
} = {}) {
  const facets = item?.facets || {};
  const interest = overlapScore(profile.interests, facets.interests);
  const budget = budgetScore(profile.budget, facets.budgetLevel);
	const party = facets.audienceScope === 'all'
		? 1
		: overlapScore(profile.travelParties, facets.audiences);
	const vibeOrStyle = route
		? Math.max(
			overlapScore(profile.vibe, facets.vibes),
			overlapScore(profile.travelerStyles, facets.travelerStyles),
			item?.pace && profile.pace ? (item.pace === profile.pace ? 1 : 0) : 0.5
		)
		: overlapScore(profile.vibe, facets.vibes);
	const expectedNeedsScope = route ? 'entire_route' : 'recommendation';
	const needs = facets.needsScope === expectedNeedsScope
		? overlapScore(profile.needs, facets.needs, 0)
		: 0;
  const explicitScore = interest * 25 + budget * 10 + party * 8 + vibeOrStyle * 7 + needs * 5;

  const scores = personalization.facetScores || {};
  const facetAffinity = Math.max(
    affinityFor(scores.interests, facets.interests),
    affinityFor(scores.audiences, facets.audiences),
    affinityFor(scores.vibes, facets.vibes),
		route ? affinityFor(scores.travelerStyles, facets.travelerStyles) : 0,
		facets.needsScope === expectedNeedsScope ? affinityFor(scores.needs, facets.needs) : 0
  );
  const behaviorScore = facetAffinity * 15 + clamp(itemDestinationAffinity(item, personalization) / MAX_AFFINITY) * 10;
  const likes = Math.max(0, Number(item?.stats?.likeCount || 0));
  const popularity = maxLikes > 0 ? Math.log1p(likes) / Math.log1p(maxLikes) : 0;
  const recency = decayFactor(Math.max(0, nowMs - timestampMs(item?.createdAt)), RECENCY_HALF_LIFE_MS);
  const qualityScore = popularity * 12 + recency * 8;
  const reasons = [];
  const matchedInterest = (profile.interests || []).find((id) => facets.interests?.includes(id));
  const matchedParty = (profile.travelParties || []).find((id) => facets.audiences?.includes(id));
	const matchedStyle = route
		? (profile.travelerStyles || []).find((id) => facets.travelerStyles?.includes(id))
		: null;
  if (matchedInterest) reasons.push(`interest:${matchedInterest}`);
  if (budget >= 0.6 && profile.budget && profile.budget !== 'flexible') reasons.push('budget');
  if (matchedParty) reasons.push(`party:${matchedParty}`);
  if (matchedStyle) reasons.push(`style:${matchedStyle}`);
  return {
    item,
    explicitScore,
    behaviorScore,
    qualityScore,
    textScore,
    score: explicitScore + behaviorScore + qualityScore,
    rankingScore: textScore * 1000 + explicitScore + behaviorScore + qualityScore,
    reasons: reasons.slice(0, 1),
  };
}

function scoredComparator(a, b) {
  const aScore = Number.isFinite(a.rankingScore) ? a.rankingScore : Number(a.score || 0);
  const bScore = Number.isFinite(b.rankingScore) ? b.rankingScore : Number(b.score || 0);
  return bScore - aScore || timestampMs(b.item?.createdAt) - timestampMs(a.item?.createdAt) ||
    String(a.item?.id).localeCompare(String(b.item?.id));
}

function interleaveDiscovery(scored, limit) {
  const personalized = [...scored].sort(scoredComparator);
  const protectedIds = new Set(personalized.slice(0, Math.ceil(limit * 0.8)).map((entry) => entry.item.id));
  const discovery = [...scored]
    .filter((entry) => !protectedIds.has(entry.item.id))
    .sort((a, b) => b.textScore - a.textScore || b.qualityScore - a.qualityScore || scoredComparator(a, b));
  const used = new Set();
  const result = [];
  while (result.length < limit && used.size < scored.length) {
    const source = (result.length + 1) % 5 === 0 ? discovery : personalized;
    let next = source.find((entry) => !used.has(entry.item.id));
    if (!next) next = personalized.find((entry) => !used.has(entry.item.id));
    if (!next) break;
    used.add(next.item.id);
    result.push(next);
  }
  return result;
}

function rankPersonalizedResults(scored, limit, { hasQuery = false } = {}) {
  if (hasQuery) return [...scored].sort(scoredComparator).slice(0, limit);
  return interleaveDiscovery(scored, limit);
}

function cleanStringArray(value, field, allowed, maximum) {
  assert(value == null || (Array.isArray(value) && value.length <= maximum), 'invalid-argument', `${field} is invalid.`);
  const entries = Array.from(new Set((value || []).map((entry) => cleanId(entry, field))));
  if (allowed) assert(entries.every((entry) => allowed.includes(entry)), 'invalid-argument', `${field} is invalid.`);
  return entries;
}

function cleanRange(value, field) {
  if (value == null) return null;
  assert(value && typeof value === 'object' && !Array.isArray(value), 'invalid-argument', `${field} is invalid.`);
  const parse = (entry) => entry === '' || entry == null ? null : Number(entry);
  const minimum = parse(value.min);
  const maximum = parse(value.max);
  assert((minimum == null || (Number.isFinite(minimum) && minimum >= 0)) &&
    (maximum == null || (Number.isFinite(maximum) && maximum >= 0)) &&
    (minimum == null || maximum == null || minimum <= maximum), 'invalid-argument', `${field} is invalid.`);
  return { min: minimum, max: maximum };
}

function cleanFilters(filters = {}, { route = false } = {}) {
  assert(filters && typeof filters === 'object' && !Array.isArray(filters), 'invalid-argument', 'filters are invalid.');
  const rawSubcategories = filters.subcategoryIds || filters.tags || [];
  const subcategoryIds = normalizeRecommendationTags(cleanStringArray(rawSubcategories, 'subcategoryIds', null, 20));
  assert(subcategoryIds.length === rawSubcategories.length, 'invalid-argument', 'subcategoryIds are invalid.');
  const result = {
    categoryIds: cleanStringArray(filters.categoryIds, 'categoryIds', CATEGORY_IDS, 8),
    subcategoryIds,
    audienceIds: cleanStringArray(filters.audienceIds, 'audienceIds', TRAVEL_PARTY_IDS, 6),
    vibeIds: cleanStringArray(filters.vibeIds, 'vibeIds', VIBE_IDS, 8),
    needIds: cleanStringArray(filters.needIds, 'needIds', NEED_IDS, NEED_IDS.length),
    budgetLevels: cleanStringArray(filters.budgetLevels, 'budgetLevels', BUDGET_IDS, BUDGET_IDS.length),
    environments: cleanStringArray(filters.environments, 'environments', ENVIRONMENT_IDS, ENVIRONMENT_IDS.length),
  };
  if (route) Object.assign(result, {
	travelerStyleIds: cleanStringArray(filters.travelerStyleIds, 'travelerStyleIds', TRAVELER_STYLE_IDS, 6),
	seasons: cleanStringArray(filters.seasons, 'seasons', SEASON_IDS, SEASON_IDS.length),
    difficultyIds: cleanStringArray(filters.difficultyIds, 'difficultyIds', ROUTE_DIFFICULTY_IDS, 3),
	experienceLevelIds: cleanStringArray(filters.experienceLevelIds, 'experienceLevelIds', ROUTE_EXPERIENCE_IDS, ROUTE_EXPERIENCE_IDS.length),
    transportModeIds: cleanStringArray(filters.transportModeIds, 'transportModeIds', TRANSPORT_MODE_IDS, 6),
    paceIds: cleanStringArray(filters.paceIds, 'paceIds', PACE_IDS, 3),
    durationDays: cleanRange(filters.durationDays, 'durationDays'),
    distanceKm: cleanRange(filters.distanceKm, 'distanceKm'),
  });
  return result;
}

function intersects(wanted, actual) {
  if (!wanted.length) return true;
  const actualSet = new Set(Array.isArray(actual) ? actual : []);
  return wanted.some((value) => actualSet.has(value));
}

function inRange(value, range) {
  if (!range) return true;
  const number = Number(value);
  if (!Number.isFinite(number)) return false;
  return (range.min == null || number >= range.min) && (range.max == null || number <= range.max);
}

function matchesFilters(item, filters, { route = false } = {}) {
  const facets = item?.facets || {};
  const categories = item?.categoryIds || [item?.categoryId].filter(Boolean);
  const subcategories = item?.subcategoryIds || normalizeRecommendationTags(item?.tags);
  if (!intersects(filters.categoryIds, categories)) return false;
  if (!intersects(filters.subcategoryIds, subcategories)) return false;
	if (filters.audienceIds.length && facets.audienceScope !== 'all' && !intersects(filters.audienceIds, facets.audiences)) return false;
  if (!intersects(filters.vibeIds, facets.vibes)) return false;
	const expectedNeedsScope = route ? 'entire_route' : 'recommendation';
	if (filters.needIds.length && (
		facets.needsScope !== expectedNeedsScope || !intersects(filters.needIds, facets.needs)
	)) return false;
  if (!intersects(filters.budgetLevels, [facets.budgetLevel].filter(Boolean))) return false;
  if (!intersects(filters.environments, facets.environments)) return false;
  if (route) {
	if (!intersects(filters.travelerStyleIds, facets.travelerStyles)) return false;
	if (!intersects(filters.seasons, facets.seasons)) return false;
    if (!intersects(filters.difficultyIds, [item?.difficulty].filter(Boolean))) return false;
	if (!intersects(filters.experienceLevelIds, [item?.experienceLevel].filter(Boolean))) return false;
    if (!intersects(filters.transportModeIds, item?.transportModes)) return false;
    if (!intersects(filters.paceIds, [item?.pace].filter(Boolean))) return false;
    if (!inRange(item?.dayCount, filters.durationDays)) return false;
    if (!inRange(item?.distanceKm, filters.distanceKm)) return false;
  }
  return true;
}

function cleanDestinations(data) {
  const source = Array.isArray(data?.destinations) ? data.destinations : [];
  assert(source.length <= 5, 'invalid-argument', 'destinations are invalid.');
  const destinations = source.map((item, index) => ({
    countryId: cleanId(item?.countryId, `destinations[${index}].countryId`),
    cityId: cleanId(item?.cityId, `destinations[${index}].cityId`, { optional: true }),
  }));
  if (data?.context) {
    const context = {
      countryId: cleanId(data.context.countryId, 'context.countryId'),
      cityId: cleanId(data.context.cityId, 'context.cityId', { optional: true }),
    };
    return { destinations: [context], context };
  }
  return { destinations, context: null };
}

function candidateBase(collection, { context, route }) {
  let query = collection.where('status', '==', 'active');
  if (context) {
    if (route) query = query.where('destinationKeys', 'array-contains', destinationKey(context.countryId, context.cityId));
    else {
      query = query.where('destination.countryId', '==', context.countryId);
      if (context.cityId) query = query.where('destination.cityId', '==', context.cityId);
    }
  }
  return query;
}

async function candidateSnapshots(db, {
  collectionName, context, destinations, interests, filters, parsedQuery, route,
}) {
  const collection = db.collection(collectionName);
  const base = () => candidateBase(collection, { context, route });
  const queries = [
    base().orderBy('stats.likeCount', 'desc').limit(80).get(),
    base().orderBy('createdAt', 'desc').limit(80).get(),
  ];
  // Firestore permits only one array membership predicate per query. Routes
  // use destinationKeys as an array, so text/facet candidates are collected
  // globally and the hard destination context is applied in memory below.
  const facetBase = () => route && context
    ? collection.where('status', '==', 'active')
    : base();
  if (parsedQuery.terms.length) {
    const prefixes = Array.from(new Set(parsedQuery.alternatives.flat())).slice(0, 30);
    queries.push(facetBase().where('search.prefixes', 'array-contains-any', prefixes).limit(MAX_CANDIDATES).get());
  }
	const interestCandidates = interests;
  if (interestCandidates.length) {
    queries.push(facetBase().where('facets.interests', 'array-contains-any', interestCandidates.slice(0, 10)).limit(100).get());
  }
  if (!context) {
    for (const destination of destinations) {
      if (route) {
        queries.push(collection.where('status', '==', 'active')
          .where('destinationKeys', 'array-contains', destinationKey(destination.countryId, destination.cityId))
          .limit(100).get());
      } else {
        let query = collection.where('status', '==', 'active')
          .where('destination.countryId', '==', destination.countryId);
        if (destination.cityId) query = query.where('destination.cityId', '==', destination.cityId);
        queries.push(query.limit(100).get());
      }
    }
  }
  return Promise.all(queries);
}

function sortGeneric(candidates, sort, parsedQuery) {
  return [...candidates].sort((a, b) => {
    if (parsedQuery.terms.length) {
      const relevance = b._textScore - a._textScore;
      if (relevance) return relevance;
    }
    if (sort === 'newest') {
      return timestampMs(b.createdAt) - timestampMs(a.createdAt) || String(a.id).localeCompare(String(b.id));
    }
    return Number(b?.stats?.likeCount || 0) - Number(a?.stats?.likeCount || 0) ||
      timestampMs(b.createdAt) - timestampMs(a.createdAt) || String(a.id).localeCompare(String(b.id));
  });
}

function publicDiscoveryItem(item) {
  const { _textScore, search, ...publicItem } = item;
  return publicItem;
}

async function getDiscoveryResults({ admin, auth, data, collectionName, route = false }) {
  const startedAt = Date.now();
  const requestedLimit = Number(data?.limit || 30);
  assert(Number.isInteger(requestedLimit) && requestedLimit >= 1 && requestedLimit <= 30, 'invalid-argument', 'limit is invalid.');
  const allowedSorts = ['forYou', 'relevance', 'popular', 'newest'];
  const sort = data?.sort || 'forYou';
  assert(allowedSorts.includes(sort), 'invalid-argument', 'sort is invalid.');
  let parsedQuery;
  try {
    parsedQuery = parseSearchQuery(data?.query);
  } catch {
    throw new HttpsError('invalid-argument', 'query is invalid.');
  }
  const filters = cleanFilters(data?.filters || {}, { route });
  const { destinations, context } = cleanDestinations(data || {});
  const db = admin.firestore();
  const userSnapshot = auth?.uid ? await db.doc(`users/${auth.uid}`).get() : null;
  const userData = userSnapshot?.exists ? userSnapshot.data() : {};
  const completed = Boolean(auth?.uid && isSmartProfileComplete(userData.smartProfile || {}));
  const declaredProfile = completed ? normalizeSmartProfile(userData.smartProfile) : {};
  const shouldPersonalize = completed && ['forYou', 'relevance'].includes(sort);
  let snapshots;
  let fallbackReason = null;
  try {
    snapshots = await candidateSnapshots(db, {
      collectionName,
      context,
      destinations,
      interests: declaredProfile.interests || [],
      filters,
      parsedQuery,
      route,
    });
  } catch {
    fallbackReason = 'candidate-query-failed';
    const fallback = db.collection(collectionName).where('status', '==', 'active');
    snapshots = [await fallback.orderBy('stats.likeCount', 'desc').limit(MAX_CANDIDATES).get()];
  }
  const byId = new Map();
  snapshots.forEach((snapshot) => snapshot.docs.forEach((document) => {
    byId.set(document.id, { id: document.id, ...document.data() });
  }));
  const candidates = Array.from(byId.values()).filter((item) => {
    if (!matchesDestinations(item, destinations)) return false;
    if (!matchesFilters(item, filters, { route })) return false;
    const relevance = searchRelevance(item, parsedQuery);
    if (!relevance.matches) return false;
    item._textScore = relevance.score;
    return true;
  });
  const maxLikes = Math.max(1, ...candidates.map((item) => Number(item?.stats?.likeCount || 0)));
  let output;
  if (shouldPersonalize) {
    const normalizedActivity = normalizePersonalization(userData.personalization, startedAt);
    const scored = candidates.map((item) => scoreRecommendation(item, declaredProfile, normalizedActivity, {
      nowMs: startedAt,
      maxLikes,
      textScore: item._textScore,
		route,
    }));
    output = rankPersonalizedResults(scored, requestedLimit, {
      hasQuery: parsedQuery.terms.length > 0,
    }).map((entry) => ({
      ...publicDiscoveryItem(entry.item),
      personalization: { reasonCodes: entry.reasons },
    }));
  } else {
    output = sortGeneric(candidates, sort, parsedQuery).slice(0, requestedLimit).map(publicDiscoveryItem);
  }
  if (route) output = await attachRouteDestinationPreviews(db, output);
  const mode = fallbackReason ? 'fallback' : shouldPersonalize ? 'personalized' : 'generic';
  console.info(route ? 'personalized_routes' : 'personalized_recommendations', {
    mode,
    hasContext: Boolean(context),
    hasQuery: parsedQuery.terms.length > 0,
    candidates: candidates.length,
    returned: output.length,
    fallbackReason,
    latencyMs: Date.now() - startedAt,
  });
  return { mode, items: output };
}

const getPersonalizedRecommendations = (options) => getDiscoveryResults({
  ...options,
  collectionName: 'recommendations',
  route: false,
});
const getPersonalizedRoutes = (options) => getDiscoveryResults({
  ...options,
  collectionName: 'routes',
  route: true,
});

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
  assert(['recommendation', 'route'].includes(target.type), 'invalid-argument', 'Unsupported discovery target.');
  const id = cleanId(target.id, 'target.id');
  const nowMs = Date.now();
  await consumeDiscoveryRateLimit({ admin, uid: auth.uid, nowMs });
  const db = admin.firestore();
  const collectionName = target.type === 'route' ? 'routes' : 'recommendations';
  const normalizedTarget = { type: target.type, id, path: `${collectionName}/${id}` };
  let changed = false;
  await db.runTransaction(async (transaction) => {
    const document = await transaction.get(db.doc(normalizedTarget.path));
    assert(document.exists && document.data()?.status === 'active', 'not-found', 'Discovery target is unavailable.');
    changed = await applyAffinitySignalInTransaction({
      transaction,
      db,
      admin,
      userId: auth.uid,
      target: normalizedTarget,
      targetData: document.data(),
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
  const historySeedVersion = userSnapshot.data()?.personalization?.historySeedVersion;
  await userRef.set({
    personalization: {
      facetScores: { interests: {}, audiences: {}, vibes: {}, travelerStyles: {}, needs: {} },
      destinations: [],
      recentOpens: [],
      updatedAtMs: Date.now(),
      ...(typeof historySeedVersion === 'string' ? { historySeedVersion } : {}),
    },
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  return { reset: true };
}

module.exports = {
  AFFINITY_HALF_LIFE_MS,
  applyAffinitySignalInTransaction,
  applyPersonalizationSignal,
  cleanDestinations,
  cleanFilters,
  decayFactor,
  getDiscoveryResults,
  getPersonalizedRecommendations,
  getPersonalizedRoutes,
  interleaveDiscovery,
  matchesFilters,
  normalizePersonalization,
  rankPersonalizedResults,
  recordDiscoverySignal,
  resetPersonalizationActivity,
  scoreRecommendation,
  scoreDiscoveryItem: scoreRecommendation,
};
