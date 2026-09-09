import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  normalizeDiscoveryScope, REGION_SELECTION_SCHEMA_VERSION, REGION_SELECTION_STORAGE_KEY,
} from '../regionDefinitions';

export function createEmptyRegionSelection() {
  return { version: REGION_SELECTION_SCHEMA_VERSION, mode: null, regionId: null,
    selectedAt: null, hasSeenPrompt: false, pendingAccountSync: null };
}

export function selectionIdentity(value) {
  const scope = normalizeDiscoveryScope(value);
  return [scope.mode || '', scope.regionId || '', value?.selectedAt || ''].join(':');
}

export function normalizeRegionSelection(value) {
  if (!value || ![1, 2, REGION_SELECTION_SCHEMA_VERSION].includes(value.version)
    || typeof value.hasSeenPrompt !== 'boolean') return createEmptyRegionSelection();
  const scope = normalizeDiscoveryScope(value.version < 3 ? { regionId: value.regionId } : value);
  if (!scope.mode) {
    return value.regionId == null && value.mode == null
      ? { ...createEmptyRegionSelection(), hasSeenPrompt: value.hasSeenPrompt }
      : createEmptyRegionSelection();
  }
  if (typeof value.selectedAt !== 'string' || !Number.isFinite(Date.parse(value.selectedAt))) {
    return createEmptyRegionSelection();
  }
  const pending = value.pendingAccountSync;
  const normalized = { version: REGION_SELECTION_SCHEMA_VERSION, ...scope,
    selectedAt: value.selectedAt, hasSeenPrompt: value.hasSeenPrompt, pendingAccountSync: null };
  if (pending && typeof pending.uid === 'string' && pending.uid
    && selectionIdentity(pending) === selectionIdentity(normalized)) {
    normalized.pendingAccountSync = { uid: pending.uid, ...scope, selectedAt: value.selectedAt };
  }
  return normalized;
}

export async function loadRegionSelection() {
  try {
    const serialized = await AsyncStorage.getItem(REGION_SELECTION_STORAGE_KEY);
    return normalizeRegionSelection(serialized ? JSON.parse(serialized) : null);
  } catch { return createEmptyRegionSelection(); }
}

// Serialize read/modify/write operations, including late sync acknowledgements.
let mutations = Promise.resolve();
function updateSelection(update) {
  const operation = mutations.then(async () => {
    const current = await loadRegionSelection();
    const next = normalizeRegionSelection(update(current));
    await AsyncStorage.setItem(REGION_SELECTION_STORAGE_KEY, JSON.stringify(next));
    return next;
  });
  mutations = operation.catch(() => {});
  return operation;
}

export function saveDiscoverySelection(value, now = new Date(), uid = null) {
  const scope = normalizeDiscoveryScope(value);
  if (!scope.mode) return Promise.reject(new Error('Unsupported region ID'));
  const selectedAt = now.toISOString();
  return updateSelection(() => ({
    version: REGION_SELECTION_SCHEMA_VERSION, ...scope, selectedAt, hasSeenPrompt: true,
    pendingAccountSync: uid ? { uid, ...scope, selectedAt } : null,
  }));
}

export const saveSelectedRegion = (regionId, now = new Date()) =>
  saveDiscoverySelection({ mode: 'region', regionId }, now);

export function savePendingAccountSync(uid, regionId, selectedAt, mode = 'region') {
  return updateSelection((current) => selectionIdentity(current) === selectionIdentity({ mode, regionId, selectedAt })
    ? { ...current, pendingAccountSync: { uid, mode, regionId, selectedAt } } : current);
}

export function clearPendingAccountSync(uid, expectedSelection) {
  return updateSelection((current) => {
    if (current.pendingAccountSync?.uid !== uid
      || (expectedSelection && selectionIdentity(current.pendingAccountSync) !== selectionIdentity(expectedSelection))) return current;
    return { ...current, pendingAccountSync: null };
  });
}

export const saveRegionPromptDismissed = () => updateSelection((current) => ({ ...current, hasSeenPrompt: true }));
export const clearSelectedRegion = () => updateSelection((current) => ({
  ...createEmptyRegionSelection(), hasSeenPrompt: current.hasSeenPrompt,
}));
