const { HttpsError } = require('firebase-functions/v2/https');
const { cleanDiscoveryRegionId } = require('./discoveryRegions');
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
  ONBOARDING_INTEREST_IDS,
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
const { contentIsPubliclyVisible } = require('./destinationReferencePolicy');

const DAY_MS = 24 * 60 * 60 * 1000;
const AFFINITY_HALF_LIFE_MS = 90 * DAY_MS;
const RECENCY_HALF_LIFE_MS = 30 * DAY_MS;
const MAX_DESTINATIONS = 20;
const MAX_RECENT_OPENS = 50;
const MAX_AFFINITY = 20;
const MAX_CANDIDATES = 180;
const MAX_SUPPRESSED_TARGETS = 300;
const MAX_PROCESSED_GUEST_MERGES = 20;
const PERSONALIZATION_SCHEMA_VERSION = 2;

const CANONICAL_INTEREST_MAP = Object.freeze({
  nature_scenery: 'nature_scenery',
  hiking: 'nature_scenery',
  freshwater_nature: 'nature_scenery',
  wildlife: 'nature_scenery',
  photography_viewpoints: 'nature_scenery',
  scenic_roadtrips: 'nature_scenery',
  beaches_water: 'beaches_water',
  food: 'food',
  cafes: 'food',
  culture_history: 'culture_history',
  museums_art: 'culture_history',
  architecture_neighborhoods: 'culture_history',
  shopping_markets: 'shopping_markets',
  nightlife: 'nightlife',
  music_events: 'nightlife',
  family_attractions: 'activities',
  entertainment_parks: 'activities',
  adventure_extreme: 'activities',
  local_experiences: 'activities',
  winter_sports: 'activities',
  sports_stadiums: 'activities',
  activities: 'activities',
  wellness: 'wellness',
});

const SIGNAL_WEIGHTS = Object.freeze({
  meaningful_view: 1,
  open: 1,
  like: 3,
  unlike: -3,
  favorite: 5,
  unfavorite: -5,
});

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

function canonicalInterestIds(values = []) {
  const allowed = new Set(ONBOARDING_INTEREST_IDS);
  return Array.from(new Set((Array.isArray(values) ? values : [])
    .map((value) => CANONICAL_INTEREST_MAP[value] || (allowed.has(value) ? value : ''))
    .filter(Boolean)));
}

function canonicalInterestScoreMap(source, factor) {
  const result = {};
  for (const [key, raw] of Object.entries(source || {})) {
    const canonicalId = CANONICAL_INTEREST_MAP[key];
    if (!canonicalId) continue;
    const score = clamp((Number(raw) || 0) * factor, 0, MAX_AFFINITY);
    if (score >= 0.01) result[canonicalId] = Math.max(Number(result[canonicalId] || 0), Number(score.toFixed(4)));
  }
  return result;
}

function expandCanonicalInterestQueryIds(values = []) {
  const canonicalIds = Array.from(new Set(canonicalInterestIds(values)));
  const aliases = [];
  for (const canonicalId of canonicalIds) {
    for (const [legacyId, mappedId] of Object.entries(CANONICAL_INTEREST_MAP)) {
      if (mappedId === canonicalId && legacyId !== canonicalId) aliases.push(legacyId);
    }
  }
  return Array.from(new Set([...canonicalIds, ...aliases])).slice(0, 10);
}

function personalizationCandidateInterestIds(profile = {}, personalization = {}) {
  const behavioralInterestIds = personalization.behaviorEnabled === false
    ? []
    : Object.entries(personalization.facetScores?.interests || {})
      .sort((left, right) => right[1] - left[1])
      .map(([interestId]) => interestId);
  return Array.from(new Set([
    ...canonicalInterestIds(profile.interests || []),
    ...behavioralInterestIds,
  ])).slice(0, 10);
}

function normalizeEvidenceMap(source = {}) {
  const result = {};
  for (const interestId of ONBOARDING_INTEREST_IDS) {
    const evidence = source?.[interestId];
    if (!evidence || typeof evidence !== 'object') continue;
    const normalized = {
      meaningfulViews: Math.max(0, Math.trunc(Number(evidence.meaningfulViews) || 0)),
      likes: Math.max(0, Math.trunc(Number(evidence.likes) || 0)),
      favorites: Math.max(0, Math.trunc(Number(evidence.favorites) || 0)),
      less: Math.max(0, Math.trunc(Number(evidence.less) || 0)),
      lastAction: typeof evidence.lastAction === 'string' ? evidence.lastAction : '',
      lastActionAtMs: Math.max(0, Number(evidence.lastActionAtMs) || 0),
    };
    if (normalized.meaningfulViews || normalized.likes || normalized.favorites || normalized.less) {
      result[interestId] = normalized;
    }
  }
  return result;
}

function normalizeSuppressedTargets(source, nowMs) {
  return (Array.isArray(source) ? source : [])
    .filter((entry) => (
      typeof entry?.path === 'string'
      && typeof entry?.feedbackId === 'string'
      && nowMs - Number(entry.createdAtMs || 0) <= 365 * DAY_MS
    ))
    .map((entry) => ({
      path: entry.path,
      feedbackId: entry.feedbackId,
      interestIds: canonicalInterestIds(entry.interestIds),
      destinations: (Array.isArray(entry.destinations) ? entry.destinations : [])
        .filter((destination) => destination?.countryId && destination?.cityId)
        .slice(0, 5)
        .map((destination) => ({
          countryId: String(destination.countryId),
          cityId: String(destination.cityId),
        })),
      appliedLearning: entry.appliedLearning === true,
      createdAtMs: Number(entry.createdAtMs || nowMs),
    }))
    .slice(0, MAX_SUPPRESSED_TARGETS);
}

function normalizePersonalization(existing = {}, nowMs = Date.now()) {
  const previousUpdatedAtMs = Number(existing.updatedAtMs || nowMs);
  const factor = decayFactor(nowMs - previousUpdatedAtMs);
  const scores = existing.facetScores || {};
  return {
    schemaVersion: PERSONALIZATION_SCHEMA_VERSION,
    behaviorEnabled: existing.behaviorEnabled !== false,
    facetScores: {
      interests: canonicalInterestScoreMap(scores.interests, factor),
      audiences: decayScoreMap(scores.audiences, factor, TRAVEL_PARTY_IDS),
      vibes: decayScoreMap(scores.vibes, factor, VIBE_IDS),
      travelerStyles: decayScoreMap(scores.travelerStyles, factor, TRAVELER_STYLE_IDS),
      needs: decayScoreMap(scores.needs, factor, NEED_IDS),
    },
    negativeFacetScores: {
      interests: decayScoreMap(existing.negativeFacetScores?.interests, factor, ONBOARDING_INTEREST_IDS),
    },
    facetEvidence: {
      interests: normalizeEvidenceMap(existing.facetEvidence?.interests),
    },
    destinations: (Array.isArray(existing.destinations) ? existing.destinations : [])
      .map((entry) => ({
        countryId: String(entry?.countryId || ''),
        cityId: String(entry?.cityId || ''),
        score: Number(clamp((Number(entry?.score) || 0) * factor, 0, MAX_AFFINITY).toFixed(4)),
        negativeScore: Number(clamp((Number(entry?.negativeScore) || 0) * factor, 0, MAX_AFFINITY).toFixed(4)),
        updatedAtMs: Number(entry?.updatedAtMs || previousUpdatedAtMs),
      }))
      .filter((entry) => entry.countryId && entry.cityId && (entry.score >= 0.01 || entry.negativeScore >= 0.01))
      .sort((a, b) => (b.score + b.negativeScore) - (a.score + a.negativeScore))
      .slice(0, MAX_DESTINATIONS),
    recentOpens: (Array.isArray(existing.recentOpens) ? existing.recentOpens : [])
      .filter((entry) => typeof entry?.path === 'string' && nowMs - Number(entry.openedAtMs || 0) <= 30 * DAY_MS)
      .slice(0, MAX_RECENT_OPENS),
    suppressedTargets: normalizeSuppressedTargets(existing.suppressedTargets, nowMs),
    processedGuestMergeIds: (Array.isArray(existing.processedGuestMergeIds)
      ? existing.processedGuestMergeIds
      : [])
      .filter((entry) => typeof entry === 'string' && entry.length <= 180)
      .slice(0, MAX_PROCESSED_GUEST_MERGES),
    activityResetAtMs: Math.max(0, Number(existing.activityResetAtMs) || 0),
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

function adjustInterestEvidence(map, keys, action, direction, nowMs) {
  const field = action === 'meaningful_view' || action === 'open' || action === 'merged_view'
    ? 'meaningfulViews'
    : action === 'like' || action === 'unlike'
      ? 'likes'
      : action === 'favorite' || action === 'unfavorite'
        ? 'favorites'
        : action === 'less' || action === 'undo_less'
          ? 'less'
          : '';
  if (!field) return;
  for (const key of canonicalInterestIds(keys)) {
    const previous = map[key] || {
      meaningfulViews: 0, likes: 0, favorites: 0, less: 0,
      lastAction: '', lastActionAtMs: 0,
    };
    const next = {
      ...previous,
      [field]: Math.max(0, Math.trunc(Number(previous[field] || 0) + direction)),
      lastAction: action,
      lastActionAtMs: nowMs,
    };
    if (next.meaningfulViews || next.likes || next.favorites || next.less) map[key] = next;
    else delete map[key];
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
  if (!personalization.behaviorEnabled) return { personalization, changed: false };
  const path = target?.path || `${target?.type || 'recommendation'}s/${target?.id || ''}`;
  if (action === 'meaningful_view' || action === 'open') {
    const previous = personalization.recentOpens.find((entry) => entry.path === path);
    if (previous && nowMs - Number(previous.openedAtMs || 0) < DAY_MS) return { personalization, changed: false };
    personalization.recentOpens = [
      { path, openedAtMs: nowMs },
      ...personalization.recentOpens.filter((entry) => entry.path !== path),
    ].slice(0, MAX_RECENT_OPENS);
  }

  const facets = targetData?.facets || {};
  const interestIds = canonicalInterestIds(facets.interests);
  adjustMap(personalization.facetScores.interests, interestIds, delta, ONBOARDING_INTEREST_IDS);
  adjustMap(personalization.facetScores.audiences, facets.audiences, delta, TRAVEL_PARTY_IDS);
	const expectedNeedsScope = target?.type === 'route' ? 'entire_route' : 'recommendation';
	if (facets.needsScope === expectedNeedsScope) {
		adjustMap(personalization.facetScores.needs, facets.needs, delta, NEED_IDS);
	}
  adjustInterestEvidence(
    personalization.facetEvidence.interests,
    interestIds,
    action,
    delta >= 0 ? 1 : -1,
    nowMs
  );

  for (const destination of targetDestinations(target, targetData)) {
    const previous = personalization.destinations.find((entry) => (
      entry.countryId === destination.countryId && entry.cityId === destination.cityId
    ));
    const nextScore = clamp((previous?.score || 0) + delta, 0, MAX_AFFINITY);
    personalization.destinations = [
      ...(nextScore > 0 || previous?.negativeScore > 0 ? [{
        ...destination,
        score: Number(nextScore.toFixed(4)),
        negativeScore: Number(previous?.negativeScore || 0),
        updatedAtMs: nowMs,
      }] : []),
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
  if (!ordered.includes(preferred) || !ordered.includes(actual)) return 0.5;
  const distance = Math.abs(ordered.indexOf(preferred) - ordered.indexOf(actual));
  if (distance === 0) return 1;
  if (distance === 1) return 0.6;
  return 0.2;
}

function affinityFor(map, keys) {
  if (!Array.isArray(keys) || keys.length === 0) return 0;
  return Math.max(...keys.map((key) => clamp((Number(map?.[key]) || 0) / MAX_AFFINITY)));
}

function itemDestinationAffinity(item, personalization, field = 'score') {
  const keys = new Set(targetDestinations({}, item).map((entry) => destinationKey(entry.countryId, entry.cityId)));
  return Math.max(0, ...(personalization.destinations || [])
    .filter((entry) => keys.has(destinationKey(entry.countryId, entry.cityId)))
    .map((entry) => Number(entry[field] || 0)));
}

function publicReason(code, value, evidence, contribution) {
  return {
    code,
    ...(value ? { value } : {}),
    ...(evidence ? { evidence } : {}),
    contribution: Number(contribution.toFixed(3)),
  };
}

function scoreRecommendation(item, profile = {}, personalization = {}, {
  nowMs = Date.now(), maxLikes = 1, textScore = 0, route = false,
} = {}) {
  const facets = item?.facets || {};
  const wantedInterests = canonicalInterestIds(profile.interests);
  const itemInterests = canonicalInterestIds(facets.interests);
  const interest = overlapScore(wantedInterests, itemInterests, 0);
  const budget = budgetScore(profile.budget, facets.budgetLevel);
	const party = facets.audienceScope === 'all'
		? 1
		: overlapScore(profile.travelParties, facets.audiences);
	const expectedNeedsScope = route ? 'entire_route' : 'recommendation';
	const needs = facets.needsScope === expectedNeedsScope
		? overlapScore(profile.needs, facets.needs, 0)
		: 0;
  const explicitScore = interest * 30 + budget * 10 + party * 8 + needs * 7;

  const scores = personalization.facetScores || {};
  const facetAffinity = affinityFor(scores.interests, itemInterests);
  const destinationAffinity = clamp(itemDestinationAffinity(item, personalization) / MAX_AFFINITY);
  const behaviorScore = personalization.behaviorEnabled === false
    ? 0
    : facetAffinity * 15 + destinationAffinity * 10;
  const negativeFacetAffinity = affinityFor(
    personalization.negativeFacetScores?.interests,
    itemInterests
  );
  const negativeDestinationAffinity = clamp(
    itemDestinationAffinity(item, personalization, 'negativeScore') / MAX_AFFINITY
  );
  const negativeScore = personalization.behaviorEnabled === false
    ? 0
    : negativeFacetAffinity * 15 + negativeDestinationAffinity * 10;
  const likes = Math.max(0, Number(item?.stats?.likeCount || 0));
  const popularity = maxLikes > 0 ? Math.log1p(likes) / Math.log1p(maxLikes) : 0;
  const recency = decayFactor(Math.max(0, nowMs - timestampMs(item?.createdAt)), RECENCY_HALF_LIFE_MS);
  const qualityScore = popularity * 12 + recency * 8;
  const reasons = [];
  const matchedInterest = wantedInterests.find((id) => itemInterests.includes(id));
  const matchedParty = (profile.travelParties || []).find((id) => facets.audiences?.includes(id));
  const behaviorEnabled = personalization.behaviorEnabled !== false;
  const learnedInterest = behaviorEnabled
    ? [...itemInterests]
      .sort((left, right) => Number(scores.interests?.[right] || 0) - Number(scores.interests?.[left] || 0))[0]
    : '';
  if (matchedInterest) reasons.push(publicReason('declared_interest', matchedInterest, null, interest * 30));
  if (budget >= 0.6 && profile.budget && profile.budget !== 'flexible' && facets.budgetLevel) {
    reasons.push(publicReason(budget === 1 ? 'budget_exact' : 'budget_near', facets.budgetLevel, null, budget * 10));
  }
  if (matchedParty) reasons.push(publicReason('travel_party', matchedParty, null, party * 8));
  const matchedNeed = (profile.needs || []).find((id) => facets.needs?.includes(id));
  if (matchedNeed && needs > 0) reasons.push(publicReason('need_match', matchedNeed, null, needs * 7));
  if (learnedInterest && learnedInterest !== matchedInterest && Number(scores.interests?.[learnedInterest] || 0) > 0) {
    reasons.push(publicReason(
      'learned_interest',
      learnedInterest,
      personalization.facetEvidence?.interests?.[learnedInterest] || null,
      facetAffinity * 15
    ));
  }
  if (behaviorEnabled && destinationAffinity > 0) {
    const destination = targetDestinations({}, item)[0];
    reasons.push(publicReason('learned_destination', destinationKey(destination?.countryId, destination?.cityId), null, destinationAffinity * 10));
  }
  reasons.sort((left, right) => right.contribution - left.contribution);
  return {
    item,
    explicitScore,
    behaviorScore,
    negativeScore,
    qualityScore,
    textScore,
    score: explicitScore + behaviorScore + qualityScore - negativeScore,
    rankingScore: textScore * 1000 + explicitScore + behaviorScore + qualityScore - negativeScore,
    reasons: reasons.slice(0, 3),
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
    const isExploration = (result.length + 1) % 5 === 0;
    const source = isExploration ? discovery : personalized;
    const lastTwo = result.slice(-2);
    const repeatsOwner = (entry) => (
      lastTwo.length === 2
      && lastTwo.every((previous) => previous.item?.ownerId && previous.item.ownerId === entry.item?.ownerId)
    );
    const repeatsInterest = (entry) => {
      const current = canonicalInterestIds(entry.item?.facets?.interests)[0];
      return Boolean(current && lastTwo.length === 2 && lastTwo.every((previous) => (
        canonicalInterestIds(previous.item?.facets?.interests)[0] === current
      )));
    };
    let next = source.find((entry) => !used.has(entry.item.id) && !repeatsOwner(entry) && !repeatsInterest(entry));
    if (!next) next = source.find((entry) => !used.has(entry.item.id));
    const selectedAsExploration = Boolean(isExploration && next);
    if (!next) next = personalized.find((entry) => !used.has(entry.item.id));
    if (!next) break;
    used.add(next.item.id);
    result.push({ ...next, placementMode: selectedAsExploration ? 'exploration' : 'personalized' });
  }
  return result;
}

function rankPersonalizedResults(scored, limit, { hasQuery = false } = {}) {
  if (hasQuery) return [...scored].sort((left, right) => (
    right.textScore - left.textScore || scoredComparator(left, right)
  )).slice(0, limit);
  return interleaveDiscovery(scored, limit);
}

function cleanStringArray(value, field, allowed, maximum) {
  assert(value == null || (Array.isArray(value) && value.length <= maximum), 'invalid-argument', `${field} is invalid.`);
  const entries = Array.from(new Set((value || []).map((entry) => cleanId(entry, field))));
  if (allowed) assert(entries.every((entry) => allowed.includes(entry)), 'invalid-argument', `${field} is invalid.`);
  return entries;
}

function cleanGuestPreferenceContext(value) {
  if (value == null) return null;
  assert(value && typeof value === 'object' && !Array.isArray(value),
    'invalid-argument', 'guestPreferenceContext is invalid.');
  assert(Object.keys(value).every((key) => (
    ['interests', 'budget', 'travelParties', 'needs', 'onboardingVersion'].includes(key)
  )), 'invalid-argument', 'guestPreferenceContext contains unsupported fields.');
  const interests = cleanStringArray(value.interests, 'guestPreferenceContext.interests', INTEREST_IDS, 4);
  const travelParties = cleanStringArray(
    value.travelParties,
    'guestPreferenceContext.travelParties',
    TRAVEL_PARTY_IDS,
    2
  );
  const needs = cleanStringArray(value.needs, 'guestPreferenceContext.needs', NEED_IDS, NEED_IDS.length);
  assert(interests.length >= 2, 'invalid-argument', 'guestPreferenceContext.interests is invalid.');
  assert(travelParties.length >= 1, 'invalid-argument', 'guestPreferenceContext.travelParties is invalid.');
  assert(BUDGET_IDS.includes(value.budget), 'invalid-argument', 'guestPreferenceContext.budget is invalid.');
  assert(Number(value.onboardingVersion || 0) === 2,
    'invalid-argument', 'guestPreferenceContext.onboardingVersion is invalid.');
  return {
    interests,
    budget: value.budget,
    travelParties,
    needs,
    onboardingVersion: 2,
  };
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

function candidateBase(collection, { context, route, discoveryRegionId }) {
  let query = collection
    .where('status', '==', 'active')
    .where('publicationGate.destinationApprovalVerified', '==', true);
  if (discoveryRegionId) query = route
    ? query.where(`discoveryRegionMembership.${discoveryRegionId}`, '==', true)
    : query.where('discoveryRegionId', '==', discoveryRegionId);
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
  collectionName, context, destinations, interests, filters, parsedQuery, route, discoveryRegionId,
}) {
  const collection = db.collection(collectionName);
  const base = () => candidateBase(collection, { context, route, discoveryRegionId });
  const queries = [
    base().orderBy('stats.likeCount', 'desc').limit(80).get(),
    base().orderBy('createdAt', 'desc').limit(80).get(),
  ];
  // Firestore permits only one array membership predicate per query. Routes
  // use destinationKeys as an array, so text/facet candidates are collected
  // globally and the hard destination context is applied in memory below.
  const facetBase = () => route && context
    ? candidateBase(collection, { context: null, route, discoveryRegionId })
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
        queries.push(candidateBase(collection, { context: null, route, discoveryRegionId })
          .where('destinationKeys', 'array-contains', destinationKey(destination.countryId, destination.cityId))
          .limit(100).get());
      } else {
        let query = candidateBase(collection, { context: null, route, discoveryRegionId })
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

function matchesDiscoveryRegion(item, discoveryRegionId, { route = false } = {}) {
  if (!discoveryRegionId) return true;
  return route
    ? item?.discoveryRegionMembership?.[discoveryRegionId] === true
    : item?.discoveryRegionId === discoveryRegionId;
}

function cleanGuestBehaviorContext(value) {
  if (value == null) return null;
  assert(value && typeof value === 'object' && !Array.isArray(value),
    'invalid-argument', 'guestBehaviorContext is invalid.');
  assert(Object.keys(value).every((key) => (
    ['facetScores', 'negativeFacetScores', 'facetEvidence', 'destinations', 'suppressedPaths'].includes(key)
  )), 'invalid-argument', 'guestBehaviorContext contains unsupported fields.');
  for (const [field, container] of [
    ['facetScores', value.facetScores],
    ['negativeFacetScores', value.negativeFacetScores],
    ['facetEvidence', value.facetEvidence],
  ]) {
    assert(container == null || (container && typeof container === 'object' && !Array.isArray(container)
      && Object.keys(container).every((key) => key === 'interests')),
    'invalid-argument', `guestBehaviorContext.${field} is invalid.`);
  }
  const cleanScoreMap = (source, field) => {
    assert(source == null || (source && typeof source === 'object' && !Array.isArray(source)),
      'invalid-argument', `${field} is invalid.`);
    const result = {};
    for (const [key, raw] of Object.entries(source || {})) {
      assert(ONBOARDING_INTEREST_IDS.includes(key), 'invalid-argument', `${field} is invalid.`);
      const score = Number(raw);
      assert(Number.isFinite(score) && score >= 0 && score <= MAX_AFFINITY,
        'invalid-argument', `${field} is invalid.`);
      if (score >= 0.01) result[key] = Number(score.toFixed(4));
    }
    return result;
  };
  const destinations = (Array.isArray(value.destinations) ? value.destinations : []).map((entry, index) => {
    assert(index < MAX_DESTINATIONS, 'invalid-argument', 'guestBehaviorContext.destinations is invalid.');
    const score = Number(entry?.score || 0);
    const negativeScore = Number(entry?.negativeScore || 0);
    assert(Number.isFinite(score) && score >= 0 && score <= MAX_AFFINITY
      && Number.isFinite(negativeScore) && negativeScore >= 0 && negativeScore <= MAX_AFFINITY,
    'invalid-argument', 'guestBehaviorContext.destinations is invalid.');
    return {
      countryId: cleanId(entry?.countryId, `guestBehaviorContext.destinations[${index}].countryId`),
      cityId: cleanId(entry?.cityId, `guestBehaviorContext.destinations[${index}].cityId`),
      score,
      negativeScore,
      updatedAtMs: Date.now(),
    };
  });
  assert(value.suppressedPaths == null || (Array.isArray(value.suppressedPaths)
    && value.suppressedPaths.length <= MAX_SUPPRESSED_TARGETS),
  'invalid-argument', 'guestBehaviorContext.suppressedPaths is invalid.');
  const suppressedPaths = Array.from(new Set(value.suppressedPaths || []));
  assert(suppressedPaths.every((path) => (
    typeof path === 'string' && path.length <= 220 && /^(recommendations|routes)\/[^/]+$/u.test(path)
  )), 'invalid-argument', 'guestBehaviorContext.suppressedPaths is invalid.');
  return {
    schemaVersion: PERSONALIZATION_SCHEMA_VERSION,
    behaviorEnabled: true,
    facetScores: {
      interests: cleanScoreMap(value.facetScores?.interests, 'guestBehaviorContext.facetScores.interests'),
      audiences: {}, vibes: {}, travelerStyles: {}, needs: {},
    },
    negativeFacetScores: {
      interests: cleanScoreMap(
        value.negativeFacetScores?.interests,
        'guestBehaviorContext.negativeFacetScores.interests'
      ),
    },
    facetEvidence: { interests: normalizeEvidenceMap(value.facetEvidence?.interests) },
    destinations,
    recentOpens: [],
    suppressedTargets: suppressedPaths.map((path) => ({
      path, feedbackId: `guest:${path}`, interestIds: [], destinations: [], createdAtMs: Date.now(),
    })),
    updatedAtMs: Date.now(),
  };
}

function publicPersonalization(entry, { hasQuery = false } = {}) {
  let reasons = entry.reasons || [];
  const isRecent = Date.now() - timestampMs(entry.item?.createdAt) <= 60 * DAY_MS;
  if (hasQuery) reasons = [publicReason('search_match', '', null, Math.max(1, entry.textScore || 0))];
  if (entry.placementMode === 'exploration') {
    reasons = [publicReason(
      Number(entry.item?.stats?.likeCount || 0) > 0
        ? 'exploration_popular'
        : isRecent ? 'exploration_new' : 'community_pick',
      '',
      null,
      Math.max(1, entry.qualityScore || 0)
    )];
  }
  if (!reasons.length) {
    reasons = [publicReason(
      Number(entry.item?.stats?.likeCount || 0) > 0
        ? 'generic_popular'
        : isRecent ? 'generic_new' : 'community_pick',
      '',
      null,
      Math.max(1, entry.qualityScore || 0)
    )];
  }
  const publicReasons = reasons.slice(0, 3).map(({ contribution, ...reason }) => {
    if (!reason.evidence) return reason;
    const source = Number(reason.evidence.favorites || 0) > 0
      ? 'favorite'
      : Number(reason.evidence.likes || 0) > 0
        ? 'like'
        : 'meaningful_view';
    return { ...reason, evidence: { source } };
  });
  const primary = publicReasons[0];
  let legacyReason = '';
  if (primary.code === 'declared_interest') legacyReason = `interest:${primary.value}`;
  if (primary.code === 'budget_exact' || primary.code === 'budget_near') legacyReason = 'budget';
  if (primary.code === 'travel_party') legacyReason = `party:${primary.value}`;
  return {
    schemaVersion: PERSONALIZATION_SCHEMA_VERSION,
    reasons: publicReasons,
    reasonCodes: legacyReason ? [legacyReason] : [],
  };
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
  const discoveryRegionId = cleanDiscoveryRegionId(data?.regionId);
  assert(discoveryRegionId !== undefined, 'invalid-argument', 'regionId is invalid.');
  const { destinations, context } = cleanDestinations(data || {});
  const db = admin.firestore();
  const [userSnapshot, blockedSnapshot] = auth?.uid
    ? await Promise.all([
        db.doc(`users/${auth.uid}`).get(),
        db.collection(`users/${auth.uid}/blockedUsers`).limit(250).get(),
      ])
    : [null, null];
  const userData = userSnapshot?.exists ? userSnapshot.data() : {};
  const blockedUserIds = new Set(blockedSnapshot?.docs?.map((entry) => entry.id) || []);
  const completed = Boolean(auth?.uid && isSmartProfileComplete(userData.smartProfile || {}));
  const guestProfile = auth?.uid ? null : cleanGuestPreferenceContext(data?.guestPreferenceContext);
  const guestActivity = auth?.uid ? null : cleanGuestBehaviorContext(data?.guestBehaviorContext);
  const declaredProfile = completed
    ? normalizeSmartProfile(userData.smartProfile)
    : guestProfile || {};
  const normalizedActivity = auth?.uid
    ? normalizePersonalization(userData.personalization, startedAt)
    : guestActivity || normalizePersonalization({}, startedAt);
  const candidateInterestIds = personalizationCandidateInterestIds(
    declaredProfile,
    normalizedActivity
  );
  const shouldRankForYou = ['forYou', 'relevance'].includes(sort);
  const shouldPersonalize = Boolean(
    shouldRankForYou && (completed || guestProfile || guestActivity)
  );
  let snapshots;
  let fallbackReason = null;
  try {
    snapshots = await candidateSnapshots(db, {
      collectionName,
      context,
      destinations,
      interests: expandCanonicalInterestQueryIds(candidateInterestIds),
      filters,
      parsedQuery,
      route,
      discoveryRegionId,
    });
  } catch {
    fallbackReason = 'candidate-query-failed';
    const fallback = db.collection(collectionName)
      .where('status', '==', 'active')
      .where('publicationGate.destinationApprovalVerified', '==', true);
    snapshots = [await fallback.orderBy('stats.likeCount', 'desc').limit(MAX_CANDIDATES).get()];
  }
  const byId = new Map();
  snapshots.forEach((snapshot) => snapshot.docs.forEach((document) => {
    byId.set(document.id, { id: document.id, ...document.data() });
  }));
  const suppressedPaths = new Set((normalizedActivity.suppressedTargets || []).map((entry) => entry.path));
  const candidates = Array.from(byId.values()).filter((item) => {
    if (!contentIsPubliclyVisible(item)) return false;
    const path = `${collectionName}/${item.id}`;
    if (suppressedPaths.has(path)) return false;
    if (blockedUserIds.has(item.ownerId)) return false;
    if (!matchesDiscoveryRegion(item, discoveryRegionId, { route })) return false;
    if (!matchesDestinations(item, destinations)) return false;
    if (!matchesFilters(item, filters, { route })) return false;
    const relevance = searchRelevance(item, parsedQuery);
    if (!relevance.matches) return false;
    item._textScore = relevance.score;
    return true;
  });
  const maxLikes = Math.max(1, ...candidates.map((item) => Number(item?.stats?.likeCount || 0)));
  let output;
  if (shouldRankForYou) {
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
      personalization: publicPersonalization(entry, { hasQuery: parsedQuery.terms.length > 0 }),
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
    discoveryRegionId,
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
  assert(['meaningful_view', 'open'].includes(data?.action),
    'invalid-argument', 'Unsupported discovery signal.');
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
    assert(document.exists && contentIsPubliclyVisible(document.data()),
      'not-found', 'Discovery target is unavailable.');
    changed = await applyAffinitySignalInTransaction({
      transaction,
      db,
      admin,
      userId: auth.uid,
      target: normalizedTarget,
      targetData: document.data(),
      delta: SIGNAL_WEIGHTS[data.action],
      action: data.action,
      nowMs,
    });
  });
  return { recorded: changed };
}

function adjustDestinationNegativeScore(personalization, destinations, delta, nowMs) {
  for (const destination of destinations) {
    const previous = personalization.destinations.find((entry) => (
      entry.countryId === destination.countryId && entry.cityId === destination.cityId
    ));
    const negativeScore = clamp((Number(previous?.negativeScore) || 0) + delta, 0, MAX_AFFINITY);
    const next = {
      ...destination,
      score: Number(previous?.score || 0),
      negativeScore: Number(negativeScore.toFixed(4)),
      updatedAtMs: nowMs,
    };
    personalization.destinations = [
      ...(next.score > 0 || next.negativeScore > 0 ? [next] : []),
      ...personalization.destinations.filter((entry) => (
        entry.countryId !== destination.countryId || entry.cityId !== destination.cityId
      )),
    ].sort((left, right) => (
      (right.score + right.negativeScore) - (left.score + left.negativeScore)
    )).slice(0, MAX_DESTINATIONS);
  }
}

function applyLessFeedback({ existing, path, feedbackId, targetData, undo = false, nowMs = Date.now(), weight = 5 }) {
  const personalization = normalizePersonalization(existing, nowMs);
  const previous = personalization.suppressedTargets.find((entry) => entry.path === path);
  if (!undo && previous) return { personalization, changed: false };
  if (undo && !previous) return { personalization, changed: false };
  if (undo && feedbackId && previous.feedbackId !== feedbackId) {
    return { personalization, changed: false };
  }
  const interestIds = undo ? previous.interestIds : canonicalInterestIds(targetData?.facets?.interests);
  const destinations = undo ? previous.destinations : targetDestinations({}, targetData);
  const appliedLearning = undo ? previous.appliedLearning : personalization.behaviorEnabled;
  if (appliedLearning) {
    const delta = undo ? -weight : weight;
    adjustMap(
      personalization.negativeFacetScores.interests,
      interestIds,
      delta,
      ONBOARDING_INTEREST_IDS
    );
    adjustDestinationNegativeScore(personalization, destinations, delta, nowMs);
    adjustInterestEvidence(
      personalization.facetEvidence.interests,
      interestIds,
      undo ? 'undo_less' : 'less',
      undo ? -1 : 1,
      nowMs
    );
  }
  personalization.suppressedTargets = undo
    ? personalization.suppressedTargets.filter((entry) => entry.path !== path)
    : [{
        path,
        feedbackId,
        interestIds,
        destinations,
        appliedLearning,
        createdAtMs: nowMs,
      }, ...personalization.suppressedTargets].slice(0, MAX_SUPPRESSED_TARGETS);
  return { personalization, changed: true };
}

function normalizeContentTarget(value) {
  assert(value && typeof value === 'object' && !Array.isArray(value),
    'invalid-argument', 'target is invalid.');
  assert(['recommendation', 'route'].includes(value.type),
    'invalid-argument', 'Unsupported discovery target.');
  const id = cleanId(value.id, 'target.id');
  const collectionName = value.type === 'route' ? 'routes' : 'recommendations';
  return { type: value.type, id, path: `${collectionName}/${id}` };
}

async function setPersonalizationFeedback({ admin, auth, data }) {
  assert(auth?.uid, 'unauthenticated', 'You must be signed in.');
  assert(['less', 'undo'].includes(data?.value), 'invalid-argument', 'Feedback value is invalid.');
  const target = normalizeContentTarget(data?.target);
  const feedbackId = cleanId(data?.requestId, 'requestId');
  const nowMs = Date.now();
  await consumeDiscoveryRateLimit({ admin, uid: auth.uid, nowMs });
  const db = admin.firestore();
  let changed = false;
  await db.runTransaction(async (transaction) => {
    const [document, userSnapshot] = await Promise.all([
      transaction.get(db.doc(target.path)),
      transaction.get(db.doc(`users/${auth.uid}`)),
    ]);
    assert(userSnapshot.exists, 'failed-precondition', 'Profile setup is unavailable.');
    if (data.value === 'less') {
      assert(document.exists && contentIsPubliclyVisible(document.data()),
        'not-found', 'Discovery target is unavailable.');
    }
    const result = applyLessFeedback({
      existing: userSnapshot.data()?.personalization,
      path: target.path,
      feedbackId,
      targetData: document.data(),
      undo: data.value === 'undo',
      nowMs,
    });
    changed = result.changed;
    if (changed) transaction.set(db.doc(`users/${auth.uid}`), {
      personalization: result.personalization,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  });
  return { applied: changed, hidden: data.value === 'less' };
}

function cleanGuestEvents(value, nowMs) {
  assert(Array.isArray(value) && value.length <= 100, 'invalid-argument', 'events are invalid.');
  const ids = new Set();
  return value.map((event, index) => {
    assert(event && typeof event === 'object' && !Array.isArray(event),
      'invalid-argument', `events[${index}] is invalid.`);
    assert(Object.keys(event).every((key) => ['id', 'action', 'target', 'createdAtMs'].includes(key)),
      'invalid-argument', `events[${index}] contains unsupported fields.`);
    const id = cleanId(event.id, `events[${index}].id`);
    assert(!ids.has(id), 'invalid-argument', 'events contain duplicate ids.');
    ids.add(id);
    assert(['meaningful_view', 'less', 'undo_less'].includes(event.action),
      'invalid-argument', `events[${index}].action is invalid.`);
    const createdAtMs = Number(event.createdAtMs);
    assert(Number.isFinite(createdAtMs) && createdAtMs <= nowMs + 5 * 60 * 1000
      && nowMs - createdAtMs <= 90 * DAY_MS,
    'invalid-argument', `events[${index}].createdAtMs is invalid.`);
    return { id, action: event.action, target: normalizeContentTarget(event.target), createdAtMs };
  }).sort((left, right) => left.createdAtMs - right.createdAtMs || left.id.localeCompare(right.id));
}

function isGuestEventAfterActivityReset(personalization, event) {
  return Number(event?.createdAtMs || 0) > Number(personalization?.activityResetAtMs || 0);
}

async function mergeGuestPersonalization({ admin, auth, data }) {
  assert(auth?.uid, 'unauthenticated', 'You must be signed in.');
  const mergeId = cleanId(data?.mergeId, 'mergeId');
  const nowMs = Date.now();
  const events = cleanGuestEvents(data?.events, nowMs);
  await consumeDiscoveryRateLimit({ admin, uid: auth.uid, nowMs });
  const db = admin.firestore();
  let merged = 0;
  let alreadyMerged = false;
  await db.runTransaction(async (transaction) => {
    const userRef = db.doc(`users/${auth.uid}`);
    const [userSnapshot, ...documents] = await Promise.all([
      transaction.get(userRef),
      ...events.map((event) => transaction.get(db.doc(event.target.path))),
    ]);
    assert(userSnapshot.exists, 'failed-precondition', 'Profile setup is unavailable.');
    let personalization = normalizePersonalization(userSnapshot.data()?.personalization, nowMs);
    if (personalization.processedGuestMergeIds.includes(mergeId)) {
      alreadyMerged = true;
      return;
    }
    events.forEach((event, index) => {
      const document = documents[index];
      if (!document.exists || !contentIsPubliclyVisible(document.data())) return;
      if (!isGuestEventAfterActivityReset(personalization, event)) return;
      const ageFactor = decayFactor(nowMs - event.createdAtMs);
      if (event.action === 'meaningful_view') {
        const result = applyPersonalizationSignal({
          existing: personalization,
          target: event.target,
          targetData: document.data(),
          delta: SIGNAL_WEIGHTS.meaningful_view * ageFactor,
          action: 'merged_view',
          nowMs,
        });
        personalization = result.personalization;
        if (result.changed) merged += 1;
        return;
      }
      const result = applyLessFeedback({
        existing: personalization,
        path: event.target.path,
        feedbackId: event.action === 'undo_less'
          ? personalization.suppressedTargets.find((entry) => entry.path === event.target.path)?.feedbackId
          : `guest:${event.id}`,
        targetData: document.data(),
        undo: event.action === 'undo_less',
        nowMs,
        weight: 5 * ageFactor,
      });
      personalization = result.personalization;
      if (result.changed) merged += 1;
    });
    personalization = normalizePersonalization(personalization, nowMs);
    personalization.processedGuestMergeIds = [
      mergeId,
      ...personalization.processedGuestMergeIds.filter((entry) => entry !== mergeId),
    ].slice(0, MAX_PROCESSED_GUEST_MERGES);
    transaction.set(userRef, {
      personalization,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  });
  return { merged, alreadyMerged };
}

async function setPersonalizationBehavior({ admin, auth, data }) {
  assert(auth?.uid, 'unauthenticated', 'You must be signed in.');
  assert(typeof data?.enabled === 'boolean', 'invalid-argument', 'enabled must be a boolean.');
  const db = admin.firestore();
  const userRef = db.doc(`users/${auth.uid}`);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(userRef);
    assert(snapshot.exists, 'failed-precondition', 'Profile setup is unavailable.');
    const personalization = normalizePersonalization(snapshot.data()?.personalization);
    personalization.behaviorEnabled = data.enabled;
    transaction.set(userRef, {
      personalization,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  });
  return { enabled: data.enabled };
}

async function resetPersonalizationActivity({ admin, auth }) {
  assert(auth?.uid, 'unauthenticated', 'You must be signed in.');
  const userRef = admin.firestore().doc(`users/${auth.uid}`);
  const userSnapshot = await userRef.get();
  assert(userSnapshot.exists, 'failed-precondition', 'Profile setup is unavailable.');
  const historySeedVersion = userSnapshot.data()?.personalization?.historySeedVersion;
  const behaviorEnabled = userSnapshot.data()?.personalization?.behaviorEnabled !== false;
  const processedGuestMergeIds = normalizePersonalization(
    userSnapshot.data()?.personalization
  ).processedGuestMergeIds;
  const activityResetAtMs = Date.now();
  await userRef.set({
    personalization: {
      schemaVersion: PERSONALIZATION_SCHEMA_VERSION,
      behaviorEnabled,
      facetScores: { interests: {}, audiences: {}, vibes: {}, travelerStyles: {}, needs: {} },
      negativeFacetScores: { interests: {} },
      facetEvidence: { interests: {} },
      destinations: [],
      recentOpens: [],
      suppressedTargets: [],
      processedGuestMergeIds,
      activityResetAtMs,
      updatedAtMs: activityResetAtMs,
      ...(typeof historySeedVersion === 'string' ? { historySeedVersion } : {}),
    },
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  return { reset: true };
}

module.exports = {
  AFFINITY_HALF_LIFE_MS,
  applyLessFeedback,
  applyAffinitySignalInTransaction,
  applyPersonalizationSignal,
  canonicalInterestIds,
  cleanDestinations,
  cleanFilters,
  cleanGuestBehaviorContext,
  cleanGuestEvents,
  cleanGuestPreferenceContext,
  decayFactor,
  expandCanonicalInterestQueryIds,
  getDiscoveryResults,
  getPersonalizedRecommendations,
  getPersonalizedRoutes,
  interleaveDiscovery,
  isGuestEventAfterActivityReset,
  mergeGuestPersonalization,
  matchesFilters,
  matchesDiscoveryRegion,
  normalizePersonalization,
  personalizationCandidateInterestIds,
  rankPersonalizedResults,
  recordDiscoverySignal,
  resetPersonalizationActivity,
  setPersonalizationBehavior,
  setPersonalizationFeedback,
  scoreRecommendation,
  scoreDiscoveryItem: scoreRecommendation,
};
