const mockStorage = new Map();

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn((key) => Promise.resolve(mockStorage.get(key) || null)),
  setItem: jest.fn((key, value) => { mockStorage.set(key, value); return Promise.resolve(); }),
}));

import {
  __resetNoyaProductTourStorageForTests,
  NOYA_PRODUCT_TOUR_STORAGE_KEY,
  NOYA_TOUR_IDS,
  loadNoyaProductTourState,
  resetMainNoyaProductTour,
  saveNoyaProductTourProgress,
} from '../src/features/noya/services/NoyaProductTourStorage';

describe('NoyaProductTourStorage', () => {
  beforeEach(() => {
    mockStorage.clear();
    __resetNoyaProductTourStorageForTests();
  });

  it('starts each tour independently for existing and new installations', async () => {
    await expect(loadNoyaProductTourState()).resolves.toEqual(expect.objectContaining({
      mainTour: { status: 'unseen', stepIndex: 0 },
      recommendationGuide: { status: 'unseen', stepIndex: 0 },
      routeGuide: { status: 'unseen', stepIndex: 0 },
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
