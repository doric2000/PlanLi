import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '../../auth/AuthContext';
import { clearDestinationSearchCache } from '../../../services/DestinationService';
import { clearPersonalizationDiscoveryCache } from '../../../services/PersonalizationService';
import { normalizeDiscoveryScope } from '../regionDefinitions';
import {
  clearPendingAccountSync, clearSelectedRegion, createEmptyRegionSelection,
  loadRegionSelection, savePendingAccountSync, saveRegionPromptDismissed,
  saveDiscoverySelection, selectionIdentity,
} from '../services/RegionSelectionStorage';
import { syncSelectedRegion } from '../services/RegionSelectionService';
import { RegionSelectionStateContext } from './RegionSelectionState';
export { useOptionalRegionSelection, useRegionSelection } from './RegionSelectionState';

const sameScope = (a, b) => a.mode === b.mode && a.regionId === b.regionId;

export function RegionSelectionProvider({ children }) {
  const { user, userDocument } = useAuth();
  const [selection, setSelection] = useState(createEmptyRegionSelection);
  const [loading, setLoading] = useState(true);
  const [syncState, setSyncState] = useState('idle');
  const selectionRef = useRef(selection);
  const accountRef = useRef(user?.uid);
  accountRef.current = user?.uid;
  const revisionRef = useRef(0);
  const syncingRef = useRef(false);
  const savingRef = useRef(false);
  const mountedRef = useRef(true);
  const lastSyncedRef = useRef('');

  const adopt = useCallback((next) => {
    if (!mountedRef.current) return;
    if (!sameScope(selectionRef.current, next)) {
      clearPersonalizationDiscoveryCache();
      clearDestinationSearchCache();
    }
    selectionRef.current = next;
    setSelection(next);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    loadRegionSelection().then(adopt).finally(() => { if (mountedRef.current) setLoading(false); });
    return () => { mountedRef.current = false; };
  }, [adopt]);

  // One request at a time. A newer choice stays pending until its own acknowledgement.
  const syncPending = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    try {
      while (mountedRef.current) {
        const pending = selectionRef.current.pendingAccountSync;
        const uid = accountRef.current;
        if (!uid || pending?.uid !== uid) break;
        const identity = selectionIdentity(pending);
        setSyncState('syncing');
        try {
          if (pending.mode === 'global') await syncSelectedRegion(null, 'global');
          else await syncSelectedRegion(pending.regionId);
          const next = await clearPendingAccountSync(uid, pending);
          if (!mountedRef.current) break;
          if (accountRef.current !== uid) continue;
          if (selectionIdentity(selectionRef.current) === identity) {
            lastSyncedRef.current = uid + ':' + identity;
            adopt(next);
            setSyncState(next.pendingAccountSync ? 'pending' : 'synced');
          }
        } catch {
          if (!mountedRef.current) break;
          if (accountRef.current !== uid) continue;
          setSyncState('pending');
          if (selectionIdentity(selectionRef.current.pendingAccountSync) === identity) break;
        }
      }
    } finally { syncingRef.current = false; }
  }, [adopt]);

  useEffect(() => {
    const uid = user?.uid;
    if (loading || !uid || savingRef.current) return;
    if (selection.pendingAccountSync?.uid === uid) { syncPending(); return; }
    const cloud = normalizeDiscoveryScope(userDocument?.discoveryRegion);
    const localKey = uid + ':' + selectionIdentity(selection);
    if (cloud.mode) {
      if (sameScope(selection, cloud)) {
        if (lastSyncedRef.current === localKey) lastSyncedRef.current = '';
        return;
      }
      if (lastSyncedRef.current === localKey) return;
      const revision = revisionRef.current;
      saveDiscoverySelection(cloud, userDocument.discoveryRegion.selectedAt?.toDate?.() || new Date())
        .then((next) => { if (revisionRef.current === revision && accountRef.current === uid) adopt(next); })
        .catch(() => { if (mountedRef.current) setSyncState('pending'); });
    } else if (selection.mode && lastSyncedRef.current !== localKey) {
      const revision = revisionRef.current;
      savePendingAccountSync(uid, selection.regionId, selection.selectedAt, selection.mode)
        .then((next) => {
          if (revisionRef.current !== revision || accountRef.current !== uid) return;
          adopt(next); syncPending();
        }).catch(() => { if (mountedRef.current) setSyncState('pending'); });
    }
  }, [adopt, loading, selection, syncPending, user?.uid, userDocument?.discoveryRegion]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') syncPending(); });
    return () => subscription.remove();
  }, [syncPending]);

  const selectScope = useCallback(async (scope) => {
    const revision = ++revisionRef.current;
    savingRef.current = true;
    try {
      const next = await saveDiscoverySelection(scope, new Date(), accountRef.current);
      if (revisionRef.current === revision) {
        adopt(next);
        setSyncState(next.pendingAccountSync ? 'pending' : 'idle');
        syncPending();
      }
      return next;
    } finally { if (revisionRef.current === revision) savingRef.current = false; }
  }, [adopt, syncPending]);
  const selectRegion = useCallback((regionId) => selectScope({ mode: 'region', regionId }), [selectScope]);
  const selectGlobal = useCallback(() => selectScope({ mode: 'global', regionId: null }), [selectScope]);
  const dismissPrompt = useCallback(async () => {
    const next = await saveRegionPromptDismissed(); adopt(next); return next;
  }, [adopt]);
  const clearRegion = useCallback(async () => {
    revisionRef.current += 1;
    const next = await clearSelectedRegion(); adopt(next); return next;
  }, [adopt]);
  const value = useMemo(() => ({
    selectedRegionId: selection.regionId, selectedMode: selection.mode,
    hasSelection: Boolean(selection.mode), selectedAt: selection.selectedAt,
    hasSeenPrompt: selection.hasSeenPrompt, loading, syncState,
    selectRegion, selectGlobal, dismissPrompt, clearRegion,
  }), [clearRegion, dismissPrompt, loading, selectGlobal, selectRegion, selection, syncState]);
  return <RegionSelectionStateContext.Provider value={value}>{children}</RegionSelectionStateContext.Provider>;
}
