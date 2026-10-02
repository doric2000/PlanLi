const crypto = require('node:crypto');
const { HttpsError } = require('firebase-functions/v2/https');

const {
  NEED_IDS,
  POST_BUDGET_IDS,
  PRACTICAL_FACT_IDS,
  RECOMMENDATION_CATALOG,
  recommendationPracticalAllowed,
  taxonomy,
} = require('./travelTaxonomy');
const { normalize: normalizeName } = require('./destinationIdentityService');

// Private ingestion namespace. Everything under system/** is server-only in Rules.
const INGESTION_ROOT = 'system/recommendationIngestion';
const MIN_ACTUAL_LIKES = 50;
// Engagement metric chosen by the operator on 2026-10-02: Facebook offers no
// sort by Likes, and the reaction pre-filter only reports total reactions.
const ENGAGEMENT_METRICS = Object.freeze(['total_reactions', 'actual_likes']);
const DEFAULT_ENGAGEMENT_METRIC = 'total_reactions';
const WATCH_ACTUAL_LIKES = 35;
const FRESHNESS_DAYS = 183;
const MIN_SOURCE_TEXT_LENGTH = 30;
const MAX_SOURCE_TEXT_LENGTH = 12000;
const MAX_POST_IMAGES = 10;
const MAX_CANDIDATE_PHOTOS = 5;
const MAX_CANDIDATES_PER_POST = 6;
const TITLE_MAX = 120;
const DESCRIPTION_MAX = 5000;
const DEFAULT_COLLECTION_CAP_USD = 10;
const DEFAULT_COLLECTION_CAP_POSTS = 1000;
// Actor sort orders. Popular posts are needed to reach the actual-Like threshold.
const VIEW_OPTIONS = Object.freeze(['TOP_POSTS', 'CHRONOLOGICAL', 'RECENT_ACTIVITY']);
const DEFAULT_VIEW_OPTION = 'TOP_POSTS';

// The rollout is enforced server-side: one complete trial must be published and
// verified in the app before any larger collection can start.
const ROLLOUT_STAGES = Object.freeze({
  trial: Object.freeze({
    maxEnabledGroups: 1, maxResultsLimit: 10, maxRunChargeUsd: 0.25, maxActiveRuns: 1, bulk: false,
  }),
  pilot: Object.freeze({
    maxEnabledGroups: 5, maxResultsLimit: 20, maxRunChargeUsd: 1, maxActiveRuns: 5, bulk: true,
  }),
  scale: Object.freeze({
    maxEnabledGroups: 20, maxResultsLimit: 200, maxRunChargeUsd: 5, maxActiveRuns: 5, bulk: true,
  }),
});
const NEXT_STAGE = Object.freeze({ trial: 'pilot', pilot: 'scale' });
const STAGE_CHECKLIST = Object.freeze(['photos', 'title', 'description', 'location', 'budget', 'author']);

const REVIEW_STATES = Object.freeze(['needs_input', 'ready', 'publishing', 'published', 'rejected']);
const TERMINAL_REVIEW_STATES = new Set(['published', 'rejected']);
const LOCKED_REVIEW_STATES = new Set(['publishing', 'published', 'rejected']);
const RESOLVED_LOCATION_STATES = new Set(['resolved', 'confirmed']);
const FACEBOOK_GROUP_URL = /^https:\/\/(?:www\.|m\.)?facebook\.com\/groups\/([A-Za-z0-9.]{3,80})\/?$/;

function fail(code, reason, message) {
  throw new HttpsError(code, message, { reason });
}

function assert(condition, code, reason, message) {
  if (!condition) fail(code, reason, message);
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function shortHash(value, length = 32) {
  return sha256(value).slice(0, length);
}

// saveRecommendation accepts RFC-4122-shaped request IDs. Deriving one from the
// candidate makes every approval retry target the same recommendation document.
function deterministicPublishRequestId(candidateId) {
  const hex = sha256(`system-recommendation:${candidateId}`).slice(0, 32).split('');
  hex[12] = '5';
  hex[16] = ['8', '9', 'a', 'b'][parseInt(hex[16], 16) % 4];
  const value = hex.join('');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function normalizeSourceText(value) {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[​-‍﻿]/g, '')
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Whitespace-insensitive comparison key used for exact-span verification.
function fidelityKey(value) {
  return normalizeSourceText(value).replace(/\s+/g, ' ').trim();
}

function spanIsInSource(span, sourceText) {
  const key = fidelityKey(span);
  return key.length > 0 && fidelityKey(sourceText).includes(key);
}

function parseFacebookGroupUrl(value) {
  const url = String(value || '').trim();
  const match = FACEBOOK_GROUP_URL.exec(url);
  assert(match, 'invalid-argument', 'ingestion_group_invalid', 'The Facebook group URL is invalid.');
  return { url: `https://www.facebook.com/groups/${match[1]}/`, slug: match[1] };
}

function groupKeyFor(url) {
  return `fbg_${shortHash(parseFacebookGroupUrl(url).slug.toLowerCase(), 20)}`;
}

function finiteNonNegativeInteger(value) {
  const number = typeof value === 'string' && value.trim() ? Number(value) : value;
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function sourceTimestamp(item) {
  const raw = item?.time ?? item?.date ?? item?.timestamp;
  const parsed = typeof raw === 'number'
    ? new Date(raw < 1e12 ? raw * 1000 : raw)
    : new Date(String(raw || ''));
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function safeHttpsUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : '';
  } catch {
    return '';
  }
}

// Apify omits reactionLikeCount when a post has no reactions at all; that is a
// verified zero. A post with reactions but no Like breakdown stays unverifiable.
function actualLikeCount(item) {
  const likes = finiteNonNegativeInteger(item?.reactionLikeCount);
  if (likes != null) return likes;
  return finiteNonNegativeInteger(item?.likesCount) === 0 ? 0 : null;
}

function sourceImages(item) {
  const attachments = [
    ...(Array.isArray(item?.attachments) ? item.attachments : []),
    ...(Array.isArray(item?.media) ? item.media : []),
    ...(Array.isArray(item?.imageUrls) ? item.imageUrls.map((url) => ({ __typename: 'Photo', url })) : []),
  ];
  const seen = new Set();
  const images = [];
  for (const attachment of attachments) {
    if (!attachment || typeof attachment !== 'object') continue;
    const typeName = String(attachment.__typename || attachment.type || '').toLowerCase();
    if (typeName && /video/.test(typeName)) continue;
    const imageUrl = safeHttpsUrl(
      attachment.photo_image?.uri || attachment.image?.uri || attachment.image?.url ||
      attachment.photo?.uri || attachment.thumbnail || attachment.uri || attachment.url
    );
    if (!imageUrl || seen.has(imageUrl)) continue;
    seen.add(imageUrl);
    images.push({
      index: images.length,
      url: imageUrl,
      providerMediaId: String(attachment.id || '').slice(0, 80),
      width: finiteNonNegativeInteger(attachment.photo_image?.width ?? attachment.image?.width) || null,
      height: finiteNonNegativeInteger(attachment.photo_image?.height ?? attachment.image?.height) || null,
      ocrText: typeof attachment.ocrText === 'string' ? attachment.ocrText.trim().slice(0, 300) : '',
    });
    if (images.length >= MAX_POST_IMAGES) break;
  }
  return images;
}

// Normalizes one provider item into a private source record. Total reactions are
// retained for context only; eligibility uses the actual Like reaction count.
function normalizeApifyItem(item, { groupKey }) {
  assert(item && typeof item === 'object', 'invalid-argument', 'ingestion_item_invalid', 'Provider item is invalid.');
  // In provider output facebookId is the group's ID; legacyId/postId identify the post.
  const providerPostId = String(item.legacyId || item.postId || item.id || '').trim().slice(0, 200);
  const url = safeHttpsUrl(item.postUrl || item.url || item.facebookUrl);
  const text = normalizeSourceText(item.postText || item.text || item.message || '').slice(0, MAX_SOURCE_TEXT_LENGTH);
  const images = sourceImages(item);
  const postedAt = sourceTimestamp(item);
  const identity = providerPostId || url;
  if (!identity) return null;
  return {
    sourceId: `src_${shortHash(`${groupKey}:${identity}`)}`,
    groupKey,
    provider: 'apify',
    providerPostId,
    url,
    postedAt,
    actualLikes: actualLikeCount(item),
    totalReactions: finiteNonNegativeInteger(item.reactionCount ?? item.likesCount),
    text,
    images,
    contentHash: shortHash(JSON.stringify([text, images.map((image) => image.providerMediaId || image.url)])),
  };
}

function engagementValue(source, metric = DEFAULT_ENGAGEMENT_METRIC) {
  return metric === 'actual_likes' ? source?.actualLikes : source?.totalReactions;
}

function evaluateSource(source, {
  now = new Date(), freshnessDays = FRESHNESS_DAYS, minLikes = MIN_ACTUAL_LIKES, metric = DEFAULT_ENGAGEMENT_METRIC,
} = {}) {
  const postedAtMs = source?.postedAt instanceof Date ? source.postedAt.getTime() : NaN;
  if (!Number.isFinite(postedAtMs)) return { status: 'stale', reason: 'missing_post_date' };
  if (now.getTime() - postedAtMs > freshnessDays * 86_400_000) return { status: 'stale', reason: 'older_than_window' };
  if (String(source.text || '').length < MIN_SOURCE_TEXT_LENGTH) return { status: 'no_text', reason: 'missing_source_text' };
  const value = engagementValue(source, metric);
  if (value == null) return { status: 'likes_unverifiable', reason: `${metric}_missing` };
  if (value < minLikes) {
    return {
      status: 'below_threshold',
      reason: `insufficient_${metric}`,
      watch: value >= WATCH_ACTUAL_LIKES,
    };
  }
  return { status: 'eligible', reason: '' };
}

function stageConfig(stage) {
  const limits = ROLLOUT_STAGES[stage];
  assert(limits, 'failed-precondition', 'ingestion_stage_invalid', 'The ingestion rollout stage is invalid.');
  return limits;
}

function collectionBudgetCheck(ledger, { reserveUsd, reservePosts, capUsd, capPosts }) {
  const committedUsd = Number(ledger?.spentUsd || 0) + Number(ledger?.reservedUsd || 0);
  const committedPosts = Number(ledger?.collectedPosts || 0) + Number(ledger?.reservedPosts || 0);
  return {
    allowed: committedUsd + reserveUsd <= capUsd + 1e-9 && committedPosts + reservePosts <= capPosts,
    remainingUsd: Math.max(0, capUsd - committedUsd),
    remainingPosts: Math.max(0, capPosts - committedPosts),
  };
}

function catalogSubcategory(id) {
  return (RECOMMENDATION_CATALOG.subcategories || []).find((entry) => entry.id === id) || null;
}

function catalogCategory(id) {
  return (RECOMMENDATION_CATALOG.categories || []).find((entry) => entry.id === id) || null;
}

function genericTitle(title, destinationNames = []) {
  const key = normalizeName(title);
  if (!key) return true;
  return destinationNames.some((name) => {
    const nameKey = normalizeName(name);
    return nameKey && (key === nameKey || key === `${nameKey} city` || key === `העיר ${nameKey}`);
  });
}

function blank(value) {
  return typeof value !== 'string' || !value.trim();
}

function classificationIssues(content) {
  const missing = [];
  const category = catalogCategory(content.categoryId);
  if (!category) {
    missing.push('category');
    return missing;
  }
  const subcategories = Array.isArray(content.subcategoryIds) ? content.subcategoryIds : [];
  const maximum = RECOMMENDATION_CATALOG.selection?.subcategories?.max || 3;
  if (!subcategories.length || subcategories.length > maximum ||
      subcategories.some((id) => catalogSubcategory(id)?.categoryId !== content.categoryId)) {
    missing.push('subcategories');
  }
  const needsCustom = subcategories.some((id) => /_other$/.test(id));
  const customLabel = String(content.customSubcategoryLabel || '').trim();
  if (needsCustom && (customLabel.length < 2 || customLabel.length > 40)) missing.push('customSubcategoryLabel');
  const applicable = recommendationPracticalAllowed(content.categoryId, subcategories);
  if ((content.needs || []).some((id) => !applicable.needs.includes(id)) ||
      (content.practicalFacts || []).some((id) => !applicable.practicalFacts.includes(id))) {
    missing.push('practicalInfo');
  }
  if (content.categoryId === 'events' && blank(content.details?.eventSchedule)) missing.push('eventSchedule');
  return missing;
}

// Readiness is computed on the server from the stored candidate and its prepared
// photo pool. Missing budget is reported separately so reviewers can complete it.
function computeReadiness(candidate, { photoPool = [], source = null, destinationNames = [] } = {}) {
  const missing = [];
  const content = candidate?.content || {};
  if (blank(content.title) || content.title.trim().length > TITLE_MAX) missing.push('title');
  else if (genericTitle(content.title, destinationNames)) missing.push('title_generic');
  if (blank(content.description) || content.description.trim().length > DESCRIPTION_MAX) missing.push('description');
  else if (!candidate?.fidelity?.editedByReviewer && candidate?.fidelity?.descriptionVerified !== true) {
    missing.push('description_unverified');
  }
  missing.push(...classificationIssues(content));
  if (!POST_BUDGET_IDS.includes(content.budget)) missing.push('budget');
  const location = candidate?.location || {};
  if (!RESOLVED_LOCATION_STATES.has(location.status) || blank(location.placeId)) missing.push('location');
  if (!candidate?.destinationRef?.countryId || !candidate?.destinationRef?.cityId) missing.push('destination');
  const preparedIndexes = new Set(photoPool
    .filter((photo) => photo?.state === 'prepared' && photo.asset?.assetId)
    .map((photo) => photo.index));
  const photoIds = Array.isArray(candidate?.photoIds) ? candidate.photoIds : [];
  if (!photoIds.length || photoIds.some((index) => !preparedIndexes.has(index))) missing.push('photos');
  if (source) {
    if (!(Number(engagementValue(source, source.engagementMetric || 'actual_likes')) >= MIN_ACTUAL_LIKES)) missing.push('source_likes');
    if (source.filter?.status !== 'eligible') missing.push('source_filter');
  }
  if ((candidate?.issues || []).some((issue) => issue?.severity === 'blocking')) missing.push('blocking_issue');
  const unique = Array.from(new Set(missing));
  return { ready: unique.length === 0, missing: unique };
}

function reviewStateFor(candidate, readiness) {
  if (LOCKED_REVIEW_STATES.has(candidate?.reviewState)) return candidate.reviewState;
  return readiness.ready ? 'ready' : 'needs_input';
}

function cleanDetails(details = {}) {
  const allowed = ['contactName', 'phone', 'externalUrl', 'priceNote', 'accessibilityNote', 'eventSchedule'];
  return Object.fromEntries(allowed
    .map((key) => [key, typeof details?.[key] === 'string' ? details[key].trim() : ''])
    .filter(([, value]) => value));
}

// The one mapping from a candidate to the canonical saveRecommendation request.
// The admin preview is derived from this same request so both always match.
function buildPublishData(candidate, photoPool) {
  const content = candidate.content || {};
  const byIndex = new Map(photoPool.map((photo) => [photo.index, photo]));
  const media = (candidate.photoIds || []).map((index) => byIndex.get(index)?.asset).filter(Boolean);
  return {
    publishRequestId: candidate.publishRequestId,
    locationMode: 'exact',
    destinationRef: {
      countryId: candidate.destinationRef?.countryId,
      cityId: candidate.destinationRef?.cityId,
    },
    placeId: candidate.location?.placeId,
    recommendation: {
      taxonomyVersion: taxonomy.version,
      recommendationCatalogVersion: RECOMMENDATION_CATALOG.schemaVersion,
      title: String(content.title || '').trim(),
      description: String(content.description || '').trim(),
      budget: content.budget,
      categoryId: content.categoryId,
      subcategoryIds: content.subcategoryIds || [],
      ...(content.customSubcategoryLabel ? { customSubcategoryLabel: content.customSubcategoryLabel } : {}),
      details: cleanDetails(content.details),
      facets: {
        needs: (content.needs || []).filter((id) => NEED_IDS.includes(id)),
        practicalFacts: (content.practicalFacts || []).filter((id) => PRACTICAL_FACT_IDS.includes(id)),
      },
      media,
    },
  };
}

module.exports = {
  DEFAULT_COLLECTION_CAP_POSTS,
  DEFAULT_COLLECTION_CAP_USD,
  DEFAULT_ENGAGEMENT_METRIC,
  DEFAULT_VIEW_OPTION,
  ENGAGEMENT_METRICS,
  DESCRIPTION_MAX,
  FRESHNESS_DAYS,
  INGESTION_ROOT,
  LOCKED_REVIEW_STATES,
  MAX_CANDIDATES_PER_POST,
  MAX_CANDIDATE_PHOTOS,
  MAX_POST_IMAGES,
  MIN_ACTUAL_LIKES,
  NEXT_STAGE,
  RESOLVED_LOCATION_STATES,
  REVIEW_STATES,
  ROLLOUT_STAGES,
  STAGE_CHECKLIST,
  TERMINAL_REVIEW_STATES,
  TITLE_MAX,
  VIEW_OPTIONS,
  actualLikeCount,
  assert,
  buildPublishData,
  catalogCategory,
  catalogSubcategory,
  cleanDetails,
  collectionBudgetCheck,
  computeReadiness,
  deterministicPublishRequestId,
  engagementValue,
  evaluateSource,
  fail,
  fidelityKey,
  genericTitle,
  groupKeyFor,
  normalizeApifyItem,
  normalizeName,
  normalizeSourceText,
  parseFacebookGroupUrl,
  reviewStateFor,
  sha256,
  shortHash,
  spanIsInSource,
  stageConfig,
};
