import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  isSupportedRegionId,
  REGION_SELECTION_SCHEMA_VERSION,
  REGION_SELECTION_STORAGE_KEY,
} from '../regionDefinitions';

export function createEmptyRegionSelection() {
  return {
    version: REGION_SELECTION_SCHEMA_VERSION,
    regionId: null,
    selectedAt: null,
    hasSeenPrompt: false,
    pendingAccountSync: null,
  };
}

export function normalizeRegionSelection(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return createEmptyRegionSelection();
  }
  if (![1, REGION_SELECTION_SCHEMA_VERSION].includes(value.version)) {
    return createEmptyRegionSelection();
  }
  if (typeof value.hasSeenPrompt !== 'boolean') {
    return createEmptyRegionSelection();
  }
  if (value.regionId === null) {
    return {
      version: REGION_SELECTION_SCHEMA_VERSION,
      regionId: null,
      selectedAt: null,
      hasSeenPrompt: value.hasSeenPrompt,
      pendingAccountSync: null,
    };
  }
  if (!isSupportedRegionId(value.regionId) || typeof value.selectedAt !== 'string') {
    return createEmptyRegionSelection();
  }
  const selectedAtMs = Date.parse(value.selectedAt);
  if (!Number.isFinite(selectedAtMs)) {
    return createEmptyRegionSelection();
  }
  return {
    version: REGION_SELECTION_SCHEMA_VERSION,
    regionId: value.regionId,
    selectedAt: value.selectedAt,
    hasSeenPrompt: value.hasSeenPrompt,
    pendingAccountSync: value.version === REGION_SELECTION_SCHEMA_VERSION
      && value.pendingAccountSync
      && typeof value.pendingAccountSync.uid === 'string'
      && isSupportedRegionId(value.pendingAccountSync.regionId)
      ? value.pendingAccountSync
      : null,
  };
}

export async function loadRegionSelection() {
  try {
    const serialized = await AsyncStorage.getItem(REGION_SELECTION_STORAGE_KEY);
    return normalizeRegionSelection(serialized ? JSON.parse(serialized) : null);
  } catch {
    return createEmptyRegionSelection();
  }
}

async function saveRegionSelection(state) {
  const normalized = normalizeRegionSelection(state);
  await AsyncStorage.setItem(REGION_SELECTION_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export async function saveSelectedRegion(regionId, now = new Date()) {
  if (!isSupportedRegionId(regionId)) {
    throw new Error('Unsupported region ID');
  }
  return saveRegionSelection({
    version: REGION_SELECTION_SCHEMA_VERSION,
    regionId,
    selectedAt: now.toISOString(),
    hasSeenPrompt: true,
    pendingAccountSync: null,
  });
}

export async function savePendingAccountSync(uid, regionId, selectedAt) {
  const current = await loadRegionSelection();
  return saveRegionSelection({
    ...current,
    pendingAccountSync: { uid, regionId, selectedAt },
  });
}

export async function clearPendingAccountSync(uid) {
  const current = await loadRegionSelection();
  if (current.pendingAccountSync?.uid !== uid) return current;
  return saveRegionSelection({ ...current, pendingAccountSync: null });
}

export async function saveRegionPromptDismissed() {
  const current = await loadRegionSelection();
  return saveRegionSelection({
    ...current,
    hasSeenPrompt: true,
  });
}

export async function clearSelectedRegion() {
  const current = await loadRegionSelection();
  return saveRegionSelection({
    ...current,
    regionId: null,
    selectedAt: null,
  });
}
