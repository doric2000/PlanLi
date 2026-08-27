const mockCallableInvocations = [];
const mockClearPersonalization = jest.fn();

jest.mock('firebase/functions', () => ({
  httpsCallable: jest.fn((_functions, name) => async (payload) => {
    mockCallableInvocations.push([name, payload]);
    if (name === 'getCurrentRecommendationDraft') return { data: { draft: { id: 'draft-1', version: 2 } } };
    if (name === 'saveRecommendationDraft') return { data: { draftId: 'draft-1', version: 3 } };
    if (name === 'discardRecommendationDraft') return { data: { discarded: true } };
    return { data: {
      recommendationId: 'rec-1', published: true,
      publicationStatus: 'active', publiclyVisible: true,
    } };
  }),
}));
jest.mock('../src/config/firebase', () => ({ cloudFunctions: { region: 'europe-west1' } }));
jest.mock('../src/services/PersonalizationService', () => ({
  clearPersonalizationDiscoveryCache: (...args) => mockClearPersonalization(...args),
}));

const {
  discardRecommendationDraft,
  getCurrentRecommendationDraft,
  publishRecommendationDraft,
  saveRecommendationDraft,
} = require('../src/services/RecommendationService');

test('recommendation draft service wraps the four private lifecycle callables', async () => {
  await expect(getCurrentRecommendationDraft()).resolves.toEqual({ id: 'draft-1', version: 2 });
  await expect(saveRecommendationDraft({
    draftId: 'draft-1', sourceRecommendationId: 'rec-1', expectedVersion: 2,
    saveRequestId: '123e4567-e89b-42d3-a456-426614174001',
    draft: { step: 3, title: 'טיוטה' },
  })).resolves.toEqual({ draftId: 'draft-1', version: 3 });
  await expect(discardRecommendationDraft('draft-1')).resolves.toEqual({ discarded: true });
  await expect(publishRecommendationDraft('draft-1', 3)).resolves.toEqual({
    recommendationId: 'rec-1', published: true,
    publicationStatus: 'active', publiclyVisible: true,
  });

  expect(mockCallableInvocations).toEqual([
    ['getCurrentRecommendationDraft', {}],
    ['saveRecommendationDraft', {
      draftId: 'draft-1', sourceRecommendationId: 'rec-1', expectedVersion: 2,
      saveRequestId: '123e4567-e89b-42d3-a456-426614174001',
      draft: { step: 3, title: 'טיוטה' },
    }],
    ['discardRecommendationDraft', { draftId: 'draft-1' }],
    ['publishRecommendationDraft', { draftId: 'draft-1', expectedVersion: 3 }],
  ]);
  expect(mockClearPersonalization).toHaveBeenCalledWith('recommendations');
});
