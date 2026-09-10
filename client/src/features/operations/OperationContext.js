import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { operationStore, setOperationPrincipal } from './operationService';

import { backgroundTransfersAvailable, syncBackgroundHistory, acknowledgeBackgroundOperation } from './BackgroundMediaService';

import { OperationContext } from './OperationState';
export { useOperations } from './OperationState';
export function OperationProvider({ children }) {
  const { user } = useAuth();
  const acknowledgements = useRef(new Set());
  const [entries, setEntries] = useState(operationStore.getSnapshot());
  const [persistenceError, setPersistenceError] = useState(false);
  const [noticeActive, setNoticeActive] = useState(false);
  const [active, setActive] = useState(!['background', 'inactive'].includes(AppState.currentState));
  useEffect(() => {
    setOperationPrincipal(user?.uid);
    return () => setOperationPrincipal(null);
  }, [user?.uid]);
  useEffect(() => {
    const sync = () => {
      setEntries(operationStore.getSnapshot());
      setPersistenceError(operationStore.hasPersistenceError());
    };
    const unsubscribe = operationStore.subscribe(sync);
    operationStore.hydrate().then(sync);
    const subscription = AppState.addEventListener('change', (state) => setActive(state === 'active'));
    return () => { unsubscribe(); subscription.remove(); };
  }, []);
  useEffect(() => {
    if (!active || !user?.uid || !backgroundTransfersAvailable()) return;
    let stopped = false; let timer;
    const refresh = async () => {
      await syncBackgroundHistory(user.uid).catch(() => {});
      if (!stopped) timer = setTimeout(refresh, 30000);
    };
    refresh();
    return () => { stopped = true; clearTimeout(timer); };
  }, [active, user?.uid]);
  useEffect(() => {
    if (!active || !user?.uid) return;
    entries.filter((entry) => entry.ownerUid === user.uid && entry.serverOperationId && entry.acknowledged
      && ['success', 'review'].includes(entry.status)).forEach((entry) => {
      const key = `${user.uid}:${entry.serverOperationId}`;
      if (acknowledgements.current.has(key)) return;
      acknowledgements.current.add(key);
      acknowledgeBackgroundOperation(entry.serverOperationId).catch((error) => {
        if (!String(error?.code).includes('not-found')) acknowledgements.current.delete(key);
      });
    });
  }, [active, entries, user?.uid]);
  const value = useMemo(() => ({
    entries: entries.filter((entry) => entry.ownerUid === user?.uid), active, persistenceError, noticeActive, setNoticeActive,
  }), [entries, user?.uid, active, persistenceError, noticeActive]);
  return <OperationContext.Provider value={value}>{children}</OperationContext.Provider>;
}
