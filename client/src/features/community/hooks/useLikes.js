import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { CAPABILITIES } from '../../../constants/authPolicy';
import {
  getReactionState,
  setReaction,
} from '../../../services/SocialService';

const typeFromCollection = (collectionName) => {
  if (collectionName === 'routes') return 'route';
  if (collectionName === 'trips') return 'trip';
  return 'recommendation';
};
export const useLikes = (collectionName, itemId, initialLikes = 0) => {
  const { user, isActive, requireCapability, handleCallableAuthError } = useAuth();
  const currentUserId = user?.uid;
  const target = useMemo(
    () => ({ type: typeFromCollection(collectionName), id: itemId }),
    [collectionName, itemId]
  );
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(Math.max(0, Number(initialLikes || 0)));

  useEffect(() => {
    setLikeCount(Math.max(0, Number(initialLikes || 0)));
  }, [initialLikes]);

  useEffect(() => {
    let active = true;
    if (!currentUserId || !isActive || !itemId) {
      setIsLiked(false);
      return () => { active = false; };
    }
    getReactionState(target)
      .then((result) => {
        if (active) setIsLiked(result?.liked === true);
      })
      .catch((error) => console.error('Failed to load reaction state:', error));
    return () => { active = false; };
  }, [currentUserId, isActive, itemId, target]);

  const toggleLike = async () => {
    if (!itemId || !requireCapability(CAPABILITIES.ACTIVE)) return;
    const nextLiked = !isLiked;
    const previousCount = likeCount;
    setIsLiked(nextLiked);
    setLikeCount(Math.max(0, previousCount + (nextLiked ? 1 : -1)));
    try {
      const result = await setReaction(target, nextLiked);
      setIsLiked(result?.liked === true);
      setLikeCount(Math.max(0, Number(result?.likeCount || 0)));
    } catch (error) {
      console.error('Error updating like:', error);
      setIsLiked(!nextLiked);
      setLikeCount(previousCount);
      handleCallableAuthError(error);
    }
  };

  return { isLiked, likeCount, toggleLike };
};
