import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  GUEST_PERSONALIZATION_STORAGE_KEY,
  __resetGuestPersonalizationStorageForTests,
  clearGuestPersonalizationAfterMerge,
  loadGuestBehaviorContext,
  loadPendingGuestPersonalizationMerge,
  recordGuestPersonalizationEvent,
} from '../src/features/profile/services/GuestPersonalizationStorage';

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => `uuid-${Math.random()}`),
}));

const item = {
  id: 'rec-1',
  facets: { interests: ['cafes'] },
  destination: { countryId: 'thailand', cityId: 'chiang-mai' },
};
const NOW = Date.now();

describe('GuestPersonalizationStorage', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    __resetGuestPersonalizationStorageForTests();
  });

  it('counts a meaningful view once per target in 24 hours', async () => {
    const first = await recordGuestPersonalizationEvent({
      action: 'meaningful_view', target: { type: 'recommendation', id: item.id }, item, nowMs: NOW,
    });
    const duplicate = await recordGuestPersonalizationEvent({
      action: 'meaningful_view', target: { type: 'recommendation', id: item.id }, item, nowMs: NOW + 1_000,
    });
    expect(first.recorded).toBe(true);
    expect(duplicate.recorded).toBe(false);
    const context = await loadGuestBehaviorContext(NOW + 1_000);
    expect(context.facetScores.interests.food).toBeGreaterThan(0);
    expect(context.facetEvidence.interests.food.meaningfulViews).toBe(1);
  });

  it('keeps an in-flight batch stable and preserves events added while it is merging', async () => {
    await recordGuestPersonalizationEvent({
      action: 'less', target: { type: 'recommendation', id: item.id }, item, nowMs: NOW,
    });
    let context = await loadGuestBehaviorContext(NOW + 1_000);
    expect(context.suppressedPaths).toEqual(['recommendations/rec-1']);
    expect(context.negativeFacetScores.interests.food).toBeGreaterThan(0);

    const firstMerge = await loadPendingGuestPersonalizationMerge();
    const secondMerge = await loadPendingGuestPersonalizationMerge();
    expect(secondMerge.mergeId).toBe(firstMerge.mergeId);

    await recordGuestPersonalizationEvent({
      action: 'undo_less', target: { type: 'recommendation', id: item.id }, item, nowMs: NOW + 2_000,
    });
    context = await loadGuestBehaviorContext(NOW + 3_000);
    expect(context.suppressedPaths).toEqual([]);
    expect(context.negativeFacetScores.interests.food).toBeUndefined();

    expect(await clearGuestPersonalizationAfterMerge(firstMerge.mergeId)).toBe(true);
    const nextMerge = await loadPendingGuestPersonalizationMerge();
    expect(nextMerge.mergeId).not.toBe(firstMerge.mergeId);
    expect(nextMerge.events).toEqual([
      expect.objectContaining({ action: 'undo_less', target: { type: 'recommendation', id: item.id } }),
    ]);
    expect(await clearGuestPersonalizationAfterMerge(nextMerge.mergeId)).toBe(true);
    const stored = JSON.parse(await AsyncStorage.getItem(GUEST_PERSONALIZATION_STORAGE_KEY));
    expect(stored.events).toEqual([]);
    expect(stored.inFlight).toBeNull();
  });
});
