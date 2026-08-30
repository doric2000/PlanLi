import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from 'firebase/firestore';

import { db } from '../../../config/firebase';
import { primeUserDataCache } from '../../../hooks/useUserData';
import { createRequestCoordinator } from '../../../utils/requestCoordinator';
import { registerProfileResourceInvalidator } from '../../../utils/profileResourceInvalidation';
import { listMyPendingContent } from '../../../services/PendingContentService';
import {
  calculateContributionScore,
  getDominantRecommendationCategory,
  getTravelerStanding,
} from '../utils/profileMetrics';

const profileCoordinator = createRequestCoordinator({ maxEntries: 30 });

export const DEFAULT_PROFILE_STATS = {
  recommendations: 0,
  routes: 0,
  likesReceived: 0,
  contributionScore: 0,
  standing: getTravelerStanding(0),
  dominantCategory: null,
};

export function buildProfileUserData(user = {}, data = {}, isOwnProfile = false) {
  return {
    displayName: data?.displayName || data?.fullName || user?.displayName || 'Traveler',
    photoURL: data?.photoURL || user?.photoURL || null,
    photoMedia: data?.photoMedia || null,
    email: isOwnProfile ? data?.email || user?.email || '' : '',
    bio: data?.bio || '',
    isExpert: Boolean(data?.isExpert),
    smartProfile: data?.smartProfile || null,
  };
}

async function getOrderedContent(collectionName, uid, resultLimit) {
  const base = [
    collection(db, collectionName),
    where('ownerId', '==', uid),
    where('status', '==', 'active'),
    where('publicationGate.destinationApprovalVerified', '==', true),
  ];
  try {
    return await getDocs(query(...base, orderBy('createdAt', 'desc'), limit(resultLimit)));
  } catch (error) {
    console.info('profile_content_order_fallback', { collectionName, code: error?.code || 'unknown' });
    return getDocs(query(...base, limit(resultLimit)));
  }
}

function snapshotItems(snapshot) {
  return snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
}

function recommendationStats(recommendations) {
  const likesReceived = recommendations.reduce(
    (total, item) => total + Number(item?.stats?.likeCount || 0),
    0
  );
  const contributionScore = calculateContributionScore({
    recommendations: recommendations.length,
    likesReceived,
  });
  return {
    recommendations: recommendations.length,
    likesReceived,
    contributionScore,
    standing: getTravelerStanding(contributionScore),
    dominantCategory: getDominantRecommendationCategory(recommendations),
  };
}

async function loadProfileResource({ uid, user, isOwnProfile }) {
  const identityPromise = isOwnProfile
    ? Promise.resolve(buildProfileUserData(user, user, true))
    : getDoc(doc(db, 'publicProfiles', uid)).then((snapshot) => (
      buildProfileUserData({}, snapshot.exists() ? snapshot.data() : {}, false)
    ));
  const recommendationsPromise = getOrderedContent('recommendations', uid, 50);
  const routesPromise = getOrderedContent('routes', uid, 30);
  const routeCountPromise = getCountFromServer(query(
    collection(db, 'routes'),
    where('ownerId', '==', uid),
    where('status', '==', 'active'),
    where('publicationGate.destinationApprovalVerified', '==', true)
  )).then((snapshot) => Number(snapshot.data()?.count || 0)).catch(() => null);
  const pendingPromise = isOwnProfile
    ? listMyPendingContent({ limit: 30 }).catch((error) => ({ items: [], nextCursor: null, error }))
    : Promise.resolve({ items: [], nextCursor: null, error: null });

  const [userData, recommendationSnapshot, routeSnapshot, routeCount, pending] = await Promise.all([
    identityPromise,
    recommendationsPromise,
    routesPromise,
    routeCountPromise,
    pendingPromise,
  ]);
  const recommendations = snapshotItems(recommendationSnapshot);
  const routes = snapshotItems(routeSnapshot);
  const stats = {
    ...DEFAULT_PROFILE_STATS,
    ...recommendationStats(recommendations),
    routes: routeCount ?? routes.length,
  };
  primeUserDataCache(uid, userData);
  return {
    userData,
    stats,
    recommendations,
    routes,
    pendingContent: pending.items,
    pendingNextCursor: pending.nextCursor,
    pendingError: pending.error || null,
  };
}

function resourceKey(uid, isOwnProfile) {
  return `profile:${uid}:${isOwnProfile ? 'private' : 'public'}`;
}

export function requestProfileResource({ uid, user, isOwnProfile }) {
  if (!uid) {
    const value = {
      userData: buildProfileUserData(user, user, isOwnProfile),
      stats: DEFAULT_PROFILE_STATS,
      recommendations: [],
      routes: [],
      pendingContent: [],
      pendingNextCursor: null,
      pendingError: null,
    };
    return { requested: false, source: 'empty', promise: Promise.resolve(value) };
  }
  return profileCoordinator.request(
    resourceKey(uid, isOwnProfile),
    () => loadProfileResource({ uid, user, isOwnProfile })
  );
}

export function peekProfileResource(uid, isOwnProfile) {
  return uid ? profileCoordinator.peek(resourceKey(uid, isOwnProfile)) : undefined;
}

export function invalidateProfileResource(uid) {
  profileCoordinator.invalidate(uid ? `profile:${uid}:` : 'profile:');
}

registerProfileResourceInvalidator(invalidateProfileResource);
