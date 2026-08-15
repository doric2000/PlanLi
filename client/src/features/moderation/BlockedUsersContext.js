import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { collection, limit, onSnapshot, query } from 'firebase/firestore';

import { db } from '../../config/firebase';
import { useAuth } from '../auth/AuthContext';

const BlockedUsersContext = createContext({ blockedUserIds: new Set(), isBlocked: () => false });

export function BlockedUsersProvider({ children }) {
  const { user } = useAuth();
  const [blockedUserIds, setBlockedUserIds] = useState(new Set());
  useEffect(() => {
    if (!user?.uid) {
      setBlockedUserIds(new Set());
      return undefined;
    }
    return onSnapshot(
      query(collection(db, 'users', user.uid, 'blockedUsers'), limit(250)),
      (snapshot) => setBlockedUserIds(new Set(snapshot.docs.map((entry) => entry.id))),
      () => setBlockedUserIds(new Set())
    );
  }, [user?.uid]);
  const value = useMemo(() => ({
    blockedUserIds,
    isBlocked: (uid) => Boolean(uid && blockedUserIds.has(uid)),
  }), [blockedUserIds]);
  return <BlockedUsersContext.Provider value={value}>{children}</BlockedUsersContext.Provider>;
}

export const useBlockedUsers = () => useContext(BlockedUsersContext);
