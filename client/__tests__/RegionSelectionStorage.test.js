import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  clearSelectedRegion,
  createEmptyRegionSelection,
  loadRegionSelection,
  saveRegionPromptDismissed,
  saveSelectedRegion,
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
      version: 2,
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
      version: 2,
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
      version: 2,
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
      version: 2,
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
