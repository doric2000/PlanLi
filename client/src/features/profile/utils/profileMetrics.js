import {
  getTravelCategoryPresentation,
  getCategoryOrder,
} from '../../../constants/travelPresentation';

export const STANDING_TIERS = Object.freeze([
  { id: 'starting', label: 'בתחילת הדרך', minimumScore: 0, color: '#64748B', icon: 'explore' },
  { id: 'keen_eye', label: 'עם עין למקומות', minimumScore: 50, color: '#0891B2', icon: 'visibility' },
  { id: 'tip_source', label: 'כתובת לטיפים', minimumScore: 200, color: '#D97706', icon: 'lightbulb' },
  { id: 'community_compass', label: 'מצפן לקהילה', minimumScore: 500, color: '#1E3A5F', icon: 'explore' },
]);

export function calculateContributionScore({ recommendations, likesReceived } = {}) {
  return Number(recommendations || 0) * 10 + Number(likesReceived || 0) * 2;
}

export function getTravelerStanding(score) {
  const normalizedScore = Math.max(0, Number(score || 0));
  return [...STANDING_TIERS]
    .reverse()
    .find((tier) => normalizedScore >= tier.minimumScore) || STANDING_TIERS[0];
}

function recommendationCategoryEntry(recommendation) {
  const visual = getTravelCategoryPresentation(
    recommendation?.categoryId,
    recommendation?.category
  );
  if (!visual.categoryId) return null;
  return visual;
}

export function getDominantRecommendationCategory(recommendations) {
  const items = Array.isArray(recommendations) ? recommendations : [];
  if (!items.length) return null;

  const grouped = new Map();
  items.forEach((recommendation) => {
    const visual = recommendationCategoryEntry(recommendation);
    if (!visual) return;
    const current = grouped.get(visual.categoryId) || {
      ...visual,
      count: 0,
      likes: 0,
    };
    current.count += 1;
    current.likes += Number(recommendation?.stats?.likeCount || 0);
    grouped.set(visual.categoryId, current);
  });

  const dominant = Array.from(grouped.values()).sort((left, right) => (
    right.count - left.count
      || right.likes - left.likes
      || getCategoryOrder(left.categoryId) - getCategoryOrder(right.categoryId)
  ))[0];

  if (!dominant || dominant.count < 3 || dominant.count / items.length < 0.3) return null;
  return {
    ...dominant,
    share: dominant.count / items.length,
  };
}

function timestampToMillis(value) {
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (Number.isFinite(value?.seconds)) return value.seconds * 1000;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (value instanceof Date) return value.getTime();
  return 0;
}

function mediaCandidate(item, kind) {
  const media = Array.isArray(item?.media) && item.media.length
    ? item.media
    : [{ url: item?.imageUrl || item?.image || item?.photoURL }];
  for (const asset of media) {
    const url = asset?.feed?.url || asset?.large?.url || asset?.thumb?.url || asset?.url;
    if (typeof url === 'string' && /^https?:|^file:|^blob:|^data:image\//i.test(url)) {
      return {
        url,
        kind,
        itemId: item?.id || null,
        item,
        asset,
        timestamp: timestampToMillis(item?.createdAt),
      };
    }
  }
  return null;
}

export function selectProfileHeroMedia(recommendations, routes, limit = 3) {
  const candidates = [
    ...(Array.isArray(recommendations) ? recommendations : []).map((item) => mediaCandidate(item, 'recommendation')),
    ...(Array.isArray(routes) ? routes : []).map((item) => mediaCandidate(item, 'route')),
  ]
    .filter(Boolean)
    .sort((left, right) => right.timestamp - left.timestamp);

  const seen = new Set();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.url)) return false;
    seen.add(candidate.url);
    return true;
  }).slice(0, Math.max(0, Number(limit) || 0));
}
