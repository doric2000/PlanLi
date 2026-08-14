export function canManageRecommendation({ user, ownerId, isAdmin = false }) {
  if (!user?.uid) return false;
  return user.uid === ownerId || Boolean(isAdmin);
}

export const canManageContent = canManageRecommendation;
