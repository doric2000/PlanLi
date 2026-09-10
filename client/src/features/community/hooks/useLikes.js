import { useEffect, useMemo, useRef, useState } from 'react';
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
  const { user, isActive, ensureCapability, handleCallableAuthError } = useAuth();
  const currentUserId = user?.uid;
  const pending = useRef(false);
  const owner = useRef(currentUserId);
  owner.current = currentUserId;
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
    if (pending.current) return;
    if (!itemId || !await ensureCapability(CAPABILITIES.ACTIVE)) return;
    if (pending.current) return;
    pending.current = true;
    const nextLiked = !isLiked;
    const previousCount = likeCount;
    setIsLiked(nextLiked);
    setLikeCount(Math.max(0, previousCount + (nextLiked ? 1 : -1)));
    try {
      const result = await setReaction(target, nextLiked);
      if (owner.current !== currentUserId) return;
      setIsLiked(result?.liked === true);
      setLikeCount(Math.max(0, Number(result?.likeCount || 0)));
    } catch (error) {
      if (owner.current !== currentUserId) return;
      console.error('Error updating like:', error);
      setIsLiked(!nextLiked);
      setLikeCount(previousCount);
      handleCallableAuthError(error);
    } finally {
      pending.current = false;
    }
  };

  return { isLiked, likeCount, toggleLike };
};
