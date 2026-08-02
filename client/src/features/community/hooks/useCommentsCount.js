import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../../config/firebase';

export const useCommentsCount = (collectionName, postId) => {
  const [commentsCount, setCommentsCount] = useState(0);
  useEffect(() => {
    if (!postId || !collectionName) return undefined;
    return onSnapshot(
      doc(db, collectionName, postId),
      (snapshot) => setCommentsCount(
        Math.max(0, Number(snapshot.data()?.stats?.commentCount || 0))
      ),
      () => setCommentsCount(0)
    );
  }, [postId, collectionName]);
  return commentsCount;
};
