import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '../../auth/AuthContext';
import { clearDestinationSearchCache } from '../../../services/DestinationService';
import { clearPersonalizationDiscoveryCache } from '../../../services/PersonalizationService';
import { isSupportedRegionId } from '../regionDefinitions';
import {
  clearPendingAccountSync, clearSelectedRegion, createEmptyRegionSelection,
  loadRegionSelection, savePendingAccountSync, saveRegionPromptDismissed, saveSelectedRegion,
} from '../services/RegionSelectionStorage';
import { syncSelectedRegion } from '../services/RegionSelectionService';
import { RegionSelectionStateContext } from './RegionSelectionState';
export { useOptionalRegionSelection, useRegionSelection } from './RegionSelectionState';


export function RegionSelectionProvider({ children }) {
  const { user, userDocument } = useAuth();
  const [selection, setSelection] = useState(createEmptyRegionSelection);
  const [loading, setLoading] = useState(true);
  const [syncState, setSyncState] = useState('idle');
  const lastSyncedSelectionRef = useRef('');

  useEffect(() => {
    let active = true;
    loadRegionSelection().then((stored) => { if (active) setSelection(stored); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const syncPending = useCallback(async (candidate) => {
    const current = candidate || selection;
    const uid = user?.uid;
    if (!uid || current.pendingAccountSync?.uid !== uid) return current;
    setSyncState('syncing');
    try {
      await syncSelectedRegion(current.pendingAccountSync.regionId);
      lastSyncedSelectionRef.current = `${uid}:${current.pendingAccountSync.regionId}`;
      const next = await clearPendingAccountSync(uid);
      setSelection(next);
      setSyncState('synced');
      return next;
    } catch {
      setSyncState('pending');
      return current;
    }
  }, [selection, user?.uid]);

  useEffect(() => {
    if (loading || !user?.uid) return;
    if (selection.pendingAccountSync?.uid === user.uid) { syncPending(); return; }
    const cloud = userDocument?.discoveryRegion;
    if (isSupportedRegionId(cloud?.regionId)) {
      const localSyncKey = `${user.uid}:${selection.regionId}`;
      if (selection.regionId === cloud.regionId) {
        if (lastSyncedSelectionRef.current === localSyncKey) lastSyncedSelectionRef.current = '';
        return;
      }
      if (lastSyncedSelectionRef.current === localSyncKey) return;
      if (selection.regionId !== cloud.regionId) {
        saveSelectedRegion(cloud.regionId, cloud.selectedAt?.toDate?.() || new Date()).then(setSelection);
      }
    } else if (selection.regionId) {
      if (lastSyncedSelectionRef.current === `${user.uid}:${selection.regionId}`) return;
      savePendingAccountSync(user.uid, selection.regionId, selection.selectedAt)
        .then((next) => { setSelection(next); return syncPending(next); });
    }
  }, [loading, selection.pendingAccountSync?.uid, selection.regionId, syncPending, user?.uid, userDocument?.discoveryRegion]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') syncPending(); });
    return () => subscription.remove();
  }, [syncPending]);

  const selectRegion = useCallback(async (regionId) => {
    let next = await saveSelectedRegion(regionId);
    if (user?.uid) next = await savePendingAccountSync(user.uid, regionId, next.selectedAt);
    setSelection(next);
    clearPersonalizationDiscoveryCache();
    clearDestinationSearchCache();
    if (user?.uid) syncPending(next);
    return next;
  }, [syncPending, user?.uid]);
  const dismissPrompt = useCallback(async () => { const next = await saveRegionPromptDismissed(); setSelection(next); return next; }, []);
  const clearRegion = useCallback(async () => {
    const next = await clearSelectedRegion(); setSelection(next);
    clearPersonalizationDiscoveryCache(); clearDestinationSearchCache(); return next;
  }, []);
  const value = useMemo(() => ({
    selectedRegionId: selection.regionId, selectedAt: selection.selectedAt,
    hasSeenPrompt: selection.hasSeenPrompt, loading, syncState,
    selectRegion, dismissPrompt, clearRegion,
  }), [clearRegion, dismissPrompt, loading, selectRegion, selection, syncState]);
  return <RegionSelectionStateContext.Provider value={value}>{children}</RegionSelectionStateContext.Provider>;
}
