import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  clearSelectedRegion,
  createEmptyRegionSelection,
  loadRegionSelection,
  saveRegionPromptDismissed,
  saveSelectedRegion, saveDiscoverySelection, savePendingAccountSync, clearPendingAccountSync,
} from '../src/features/region/services/RegionSelectionStorage';
import { REGION_SELECTION_STORAGE_KEY } from '../src/features/region/regionDefinitions';

describe('RegionSelectionStorage', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  it('returns an empty versioned state when no selection exists', async () => {
    await expect(loadRegionSelection()).resolves.toEqual(createEmptyRegionSelection());
  });

  it('stores and loads a supported region with its selection time', async () => {
    const selectedAt = new Date('2026-08-27T10:00:00.000Z');
    await saveSelectedRegion('europe', selectedAt);

    await expect(loadRegionSelection()).resolves.toEqual({
      version: 3,
      mode: 'region',
      regionId: 'europe',
      selectedAt: selectedAt.toISOString(),
      hasSeenPrompt: true,
      pendingAccountSync: null,
    });
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      REGION_SELECTION_STORAGE_KEY,
      expect.any(String),
    );
  });

  it('marks the prompt as seen without creating a region selection', async () => {
    await saveRegionPromptDismissed();
    await expect(loadRegionSelection()).resolves.toEqual({
      version: 3,
      mode: null,
      regionId: null,
      selectedAt: null,
      hasSeenPrompt: true,
      pendingAccountSync: null,
    });
  });

  it('clears a region while preserving that the prompt was seen', async () => {
    await saveSelectedRegion('africa', new Date('2026-08-27T10:00:00.000Z'));
    await clearSelectedRegion();
    await expect(loadRegionSelection()).resolves.toEqual({
      version: 3,
      mode: null,
      regionId: null,
      selectedAt: null,
      hasSeenPrompt: true,
      pendingAccountSync: null,
    });
  });

  it.each([
    ['corrupt JSON', '{not-json'],
    ['unsupported region', JSON.stringify({
      version: 1,
      regionId: 'atlantis',
      selectedAt: '2026-08-27T10:00:00.000Z',
      hasSeenPrompt: true,
    })],
    ['unsupported schema', JSON.stringify({
      version: 99,
      regionId: 'europe',
      selectedAt: '2026-08-27T10:00:00.000Z',
      hasSeenPrompt: true,
    })],
  ])('falls back safely for %s', async (_label, serialized) => {
    await AsyncStorage.setItem(REGION_SELECTION_STORAGE_KEY, serialized);
    await expect(loadRegionSelection()).resolves.toEqual(createEmptyRegionSelection());
  });

  it('migrates a valid v1 preview choice without prompting again', async () => {
    await AsyncStorage.setItem(REGION_SELECTION_STORAGE_KEY, JSON.stringify({
      version: 1,
      regionId: 'israel',
      selectedAt: '2026-08-27T10:00:00.000Z',
      hasSeenPrompt: true,
    }));
    await expect(loadRegionSelection()).resolves.toEqual({
      version: 3,
      mode: 'region',
      regionId: 'israel',
      selectedAt: '2026-08-27T10:00:00.000Z',
      hasSeenPrompt: true,
      pendingAccountSync: null,
    });
  });

  it('rejects attempts to persist an unsupported region ID', async () => {
    await expect(saveSelectedRegion('atlantis')).rejects.toThrow('Unsupported region ID');
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });
});


describe('explicit global scope and sync races', () => {
  beforeEach(async () => { await AsyncStorage.clear(); });
  it('distinguishes global from never selected and survives reload', async () => {
    await saveDiscoverySelection({ mode: 'global', regionId: null }, new Date('2026-09-09T10:00:00Z'), 'u1');
    const loaded = await loadRegionSelection();
    expect(loaded).toMatchObject({ version: 3, mode: 'global', regionId: null, hasSeenPrompt: true,
      pendingAccountSync: { uid: 'u1', mode: 'global', regionId: null } });
    await clearSelectedRegion();
    expect(await loadRegionSelection()).toMatchObject({ mode: null, regionId: null, pendingAccountSync: null });
  });
  it('migrates v2 including a pending account sync', async () => {
    const time = '2026-09-09T10:00:00.000Z';
    await AsyncStorage.setItem(REGION_SELECTION_STORAGE_KEY, JSON.stringify({ version: 2, regionId: 'israel', selectedAt: time,
      hasSeenPrompt: true, pendingAccountSync: { uid: 'u1', regionId: 'israel', selectedAt: time } }));
    expect(await loadRegionSelection()).toMatchObject({ version: 3, mode: 'region', regionId: 'israel', pendingAccountSync: { mode: 'region' } });
  });
  it('does not clear a newer choice when an earlier sync finishes', async () => {
    const earlier = await saveDiscoverySelection({ regionId: 'europe' }, new Date('2026-09-09T10:00:00Z'), 'u1');
    await saveDiscoverySelection({ mode: 'global' }, new Date('2026-09-09T10:00:01Z'), 'u1');
    await clearPendingAccountSync('u1', earlier.pendingAccountSync);
    expect((await loadRegionSelection()).pendingAccountSync).toMatchObject({ mode: 'global' });
    await savePendingAccountSync('u2', 'europe', earlier.selectedAt);
    expect((await loadRegionSelection()).pendingAccountSync.uid).toBe('u1');
  });
  it.each([{ mode: 'global', regionId: 'europe' }, { mode: 'globalish' }, { regionId: 'global' }])('rejects invalid scope %j', async (scope) => {
    await expect(saveDiscoverySelection(scope)).rejects.toThrow();
  });
});
