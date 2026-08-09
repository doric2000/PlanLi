import { getUserTier } from './userTier';

export function canManageRecommendation({ user, ownerId, isAdmin = false }) {
  if (!user?.uid || getUserTier(user) !== 'verified') return false;
  return user.uid === ownerId || Boolean(isAdmin);
}
