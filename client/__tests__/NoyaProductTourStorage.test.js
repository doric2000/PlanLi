const mockStorage = new Map();

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn((key) => Promise.resolve(mockStorage.get(key) || null)),
  setItem: jest.fn((key, value) => { mockStorage.set(key, value); return Promise.resolve(); }),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  __resetNoyaProductTourStorageForTests,
  NOYA_PRODUCT_TOUR_LEGACY_STORAGE_KEY,
  NOYA_PRODUCT_TOUR_STORAGE_KEY,
  NOYA_PRODUCT_TOUR_VERSION,
  NOYA_PRODUCT_TOUR_V2_STORAGE_KEY,
  NOYA_TOUR_IDS,
  loadNoyaProductTourState,
  resetMainNoyaProductTour,
  saveNoyaProductTourProgress,
} from '../src/features/noya/services/NoyaProductTourStorage';

describe('NoyaProductTourStorage', () => {
  beforeEach(() => {
    mockStorage.clear();
    AsyncStorage.setItem.mockClear();
    __resetNoyaProductTourStorageForTests();
  });

  it('starts each tour independently for existing and new installations', async () => {
    await expect(loadNoyaProductTourState()).resolves.toEqual(expect.objectContaining({
      version: 3,
      mainTour: { status: 'unseen', stepIndex: 0 },
      recommendationGuide: { status: 'unseen', stepIndex: 0 },
      routeGuide: { status: 'unseen', stepIndex: 0 },
    }));
  });

  it('keeps migrated creator progress in memory when the v3 write fails', async () => {
    mockStorage.set(NOYA_PRODUCT_TOUR_V2_STORAGE_KEY, JSON.stringify({
      version: 2,
      mainTour: { status: 'completed', stepIndex: 5 },
      recommendationGuide: { status: 'completed', stepIndex: 2 },
      routeGuide: { status: 'dismissed', stepIndex: 1 },
    }));
    AsyncStorage.setItem.mockRejectedValueOnce(new Error('storage unavailable'));

    const migrated = await loadNoyaProductTourState();

    expect(migrated).toEqual(expect.objectContaining({
      mainTour: { status: 'unseen', stepIndex: 0 },
      recommendationGuide: { status: 'completed', stepIndex: 2 },
      routeGuide: { status: 'dismissed', stepIndex: 1 },
    }));
    await expect(loadNoyaProductTourState()).resolves.toEqual(migrated);
  });

  it('migrates v2 by rerunning only the main tour and preserving creator guides', async () => {
    mockStorage.set(NOYA_PRODUCT_TOUR_V2_STORAGE_KEY, JSON.stringify({
      version: 2,
      mainTour: { status: 'completed', stepIndex: 12 },
      recommendationGuide: { status: 'completed', stepIndex: 3 },
      routeGuide: { status: 'dismissed', stepIndex: 1 },
    }));

    const migrated = await loadNoyaProductTourState();

    expect(NOYA_PRODUCT_TOUR_VERSION).toBe(3);
    expect(migrated).toEqual({
      version: 3,
      mainTour: { status: 'unseen', stepIndex: 0 },
      recommendationGuide: { status: 'completed', stepIndex: 3 },
      routeGuide: { status: 'dismissed', stepIndex: 1 },
    });
    expect(JSON.parse(mockStorage.get(NOYA_PRODUCT_TOUR_STORAGE_KEY))).toEqual(migrated);
    expect(mockStorage.has(NOYA_PRODUCT_TOUR_V2_STORAGE_KEY)).toBe(true);
  });

  it('migrates v1 directly when v2 is absent', async () => {
    mockStorage.set(NOYA_PRODUCT_TOUR_LEGACY_STORAGE_KEY, JSON.stringify({
      version: 1,
      mainTour: { status: 'completed', stepIndex: 5 },
      recommendationGuide: { status: 'completed', stepIndex: 2 },
      routeGuide: { status: 'dismissed', stepIndex: 1 },
    }));

    const migrated = await loadNoyaProductTourState();

    expect(NOYA_PRODUCT_TOUR_VERSION).toBe(3);
    expect(migrated).toEqual({
      version: 3,
      mainTour: { status: 'unseen', stepIndex: 0 },
      recommendationGuide: { status: 'completed', stepIndex: 2 },
      routeGuide: { status: 'dismissed', stepIndex: 1 },
    });
    expect(JSON.parse(mockStorage.get(NOYA_PRODUCT_TOUR_STORAGE_KEY))).toEqual(migrated);
    expect(mockStorage.has(NOYA_PRODUCT_TOUR_LEGACY_STORAGE_KEY)).toBe(true);
  });

  it('preserves completed v3 progress instead of rerunning it again', async () => {
    mockStorage.set(NOYA_PRODUCT_TOUR_STORAGE_KEY, JSON.stringify({
      version: 3,
      mainTour: { status: 'completed', stepIndex: 12 },
    }));

    await expect(loadNoyaProductTourState()).resolves.toEqual(expect.objectContaining({
      mainTour: { status: 'completed', stepIndex: 12 },
    }));
  });

  it('persists the active step so a tour can resume after closing the app', async () => {
    await saveNoyaProductTourProgress(NOYA_TOUR_IDS.main, { status: 'active', stepIndex: 3 });
    __resetNoyaProductTourStorageForTests();
    await expect(loadNoyaProductTourState()).resolves.toEqual(expect.objectContaining({
      mainTour: { status: 'active', stepIndex: 3 },
    }));
  });

  it('restarts only the main tour', async () => {
    await saveNoyaProductTourProgress(NOYA_TOUR_IDS.main, { status: 'dismissed', stepIndex: 2 });
    await saveNoyaProductTourProgress(NOYA_TOUR_IDS.recommendation, { status: 'completed', stepIndex: 2 });
    await resetMainNoyaProductTour();
    const state = JSON.parse(mockStorage.get(NOYA_PRODUCT_TOUR_STORAGE_KEY));
    expect(state.mainTour).toEqual({ status: 'unseen', stepIndex: 0 });
    expect(state.recommendationGuide).toEqual({ status: 'completed', stepIndex: 2 });
  });

  it('normalizes corrupt progress without blocking the app', async () => {
    mockStorage.set(NOYA_PRODUCT_TOUR_STORAGE_KEY, '{not-json');
    __resetNoyaProductTourStorageForTests();
    await expect(loadNoyaProductTourState()).resolves.toEqual(expect.objectContaining({
      mainTour: { status: 'unseen', stepIndex: 0 },
    }));
  });
});
