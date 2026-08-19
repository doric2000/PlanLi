import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useMapRecommendations } from '../src/hooks/useMapRecommendations';
import { getMapRecommendations } from '../src/services/MapRecommendationsService';

let mockUser = { uid: 'traveler-1' };

jest.mock('../src/services/MapRecommendationsService', () => ({
  getMapRecommendations: jest.fn(),
}));

jest.mock('../src/hooks/useAuthUser', () => ({
  useAuthUser: () => ({ user: mockUser }),
}));

const viewport = { north: 33, south: 32, west: 34, east: 35, zoom: 12 };

describe('useMapRecommendations', () => {
  beforeEach(() => {
    mockUser = { uid: 'traveler-1' };
    getMapRecommendations.mockReset();
  });

  it('keeps map requests independent from feed sort and forwards viewport filters', async () => {
    getMapRecommendations.mockResolvedValue({
      items: [{ id: 'one' }], count: 1, truncated: false, zoomInRequired: false,
    });
    const request = { query: 'קפה', filters: { categoryIds: ['food'] } };
    const { result } = renderHook(() => useMapRecommendations({ enabled: true, request }));

    await act(async () => result.current.searchViewport(viewport));

    expect(getMapRecommendations).toHaveBeenCalledWith(
      { ...request, viewport },
      { forceRefresh: false }
    );
    expect(getMapRecommendations.mock.calls[0][0].sort).toBeUndefined();
    expect(result.current.items).toEqual([{ id: 'one' }]);
  });

  it('ignores stale responses when a newer viewport finishes first', async () => {
    const resolvers = [];
    getMapRecommendations.mockImplementation(() => new Promise((resolve) => resolvers.push(resolve)));
    const { result } = renderHook(() => useMapRecommendations({ enabled: true, request: {} }));

    let first;
    let second;
    act(() => {
      first = result.current.searchViewport(viewport);
      second = result.current.searchViewport({ ...viewport, west: 34.2, east: 35.2 });
    });

    await act(async () => {
      resolvers[1]({ items: [{ id: 'new' }], count: 1 });
      await second;
    });
    await waitFor(() => expect(result.current.items).toEqual([{ id: 'new' }]));

    await act(async () => {
      resolvers[0]({ items: [{ id: 'old' }], count: 1 });
      await first;
    });
    expect(result.current.items).toEqual([{ id: 'new' }]);
  });

  it('invalidates an in-flight request when map mode closes', async () => {
    let resolveRequest;
    getMapRecommendations.mockImplementation(() => new Promise((resolve) => {
      resolveRequest = resolve;
    }));
    const { result, rerender } = renderHook(
      ({ enabled }) => useMapRecommendations({ enabled, request: {} }),
      { initialProps: { enabled: true } }
    );
    let pending;
    act(() => {
      pending = result.current.searchViewport(viewport);
    });
    rerender({ enabled: false });
    await act(async () => {
      resolveRequest({ items: [{ id: 'late' }] });
      await pending;
    });
    expect(result.current.items).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('keeps the last successful viewport visible when a refresh fails', async () => {
    getMapRecommendations
      .mockResolvedValueOnce({ items: [{ id: 'stable' }], truncated: true })
      .mockRejectedValueOnce(new Error('network unavailable'));
    const { result } = renderHook(() => useMapRecommendations({ enabled: true, request: {} }));

    await act(async () => result.current.searchViewport(viewport));
    expect(result.current.items).toEqual([{ id: 'stable' }]);
    expect(result.current.truncated).toBe(true);

    await act(async () => result.current.searchViewport({ ...viewport, east: 35.2 }));
    expect(result.current.items).toEqual([{ id: 'stable' }]);
    expect(result.current.truncated).toBe(true);
    expect(result.current.error).toEqual(expect.any(Error));
  });

  it('keeps map results without an eager request across a mode toggle', async () => {
    getMapRecommendations.mockResolvedValue({
      items: [{ id: 'cached' }], count: 1, truncated: false, zoomInRequired: false,
    });
    const { result, rerender } = renderHook(
      ({ enabled }) => useMapRecommendations({ enabled, request: {} }),
      { initialProps: { enabled: true } }
    );

    await act(async () => result.current.searchViewport(viewport));
    rerender({ enabled: false });
    expect(result.current.items).toEqual([{ id: 'cached' }]);

    rerender({ enabled: true });

    expect(result.current.items).toEqual([{ id: 'cached' }]);
    expect(getMapRecommendations).toHaveBeenCalledTimes(1);
  });

  it('bypasses cached map data only for an explicit retry', async () => {
    getMapRecommendations
      .mockResolvedValueOnce({ items: [{ id: 'first' }] })
      .mockResolvedValueOnce({ items: [{ id: 'retried' }] });
    const { result } = renderHook(() => useMapRecommendations({ enabled: true, request: {} }));
    await act(async () => result.current.searchViewport(viewport));
    await act(async () => result.current.searchViewport(viewport, { forceRefresh: true }));

    expect(result.current.items).toEqual([{ id: 'retried' }]);
    expect(getMapRecommendations).toHaveBeenLastCalledWith(
      { viewport },
      { forceRefresh: true }
    );
  });

  it('clears retained map results and refetches when the principal changes', async () => {
    getMapRecommendations
      .mockResolvedValueOnce({ items: [{ id: 'user-1-map' }] })
      .mockResolvedValueOnce({ items: [{ id: 'user-2-map' }] });
    const { result, rerender } = renderHook(() => (
      useMapRecommendations({ enabled: true, request: {} })
    ));
    await act(async () => result.current.searchViewport(viewport));
    expect(result.current.items).toEqual([{ id: 'user-1-map' }]);

    mockUser = { uid: 'traveler-2' };
    rerender({});

    expect(result.current.items).toEqual([]);
    await waitFor(() => expect(result.current.items).toEqual([{ id: 'user-2-map' }]));
    expect(getMapRecommendations).toHaveBeenCalledTimes(2);
  });
});
