const mockCallable = jest.fn();
const mockHttpsCallable = jest.fn(() => mockCallable);

jest.mock('firebase/functions', () => ({
  httpsCallable: (...args) => mockHttpsCallable(...args),
}));
jest.mock('../src/config/firebase', () => ({ cloudFunctions: { id: 'functions' } }));

import { listMyPendingContent } from '../src/services/PendingContentService';

describe('PendingContentService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loads a bounded owner-only page and preserves its cursor', async () => {
    mockCallable.mockResolvedValue({
      data: {
        items: [{ id: 'rec-1', contentType: 'recommendation', publicationStatus: 'moderation_hold' }],
        nextCursor: { recommendationId: 'rec-1', routeId: null },
      },
    });
    const result = await listMyPendingContent({
      limit: 20,
      cursor: { recommendationId: 'rec-0', routeId: null },
    });
    expect(mockHttpsCallable).toHaveBeenCalledWith({ id: 'functions' }, 'listMyPendingContent');
    expect(mockCallable).toHaveBeenCalledWith({
      limit: 20,
      cursor: { recommendationId: 'rec-0', routeId: null },
    });
    expect(result.items[0].publicationStatus).toBe('moderation_hold');
    expect(result.nextCursor.recommendationId).toBe('rec-1');
  });

  it('normalizes a malformed empty response', async () => {
    mockCallable.mockResolvedValue({ data: null });
    await expect(listMyPendingContent()).resolves.toEqual({ items: [], nextCursor: null });
  });
});
