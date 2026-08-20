import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useRecommendations } from '../src/hooks/useRecommendations';
import {
  clearPersonalizationDiscoveryCache,
  requestPersonalizedRecommendations,
} from '../src/services/PersonalizationService';

let focusEffect;
let mockUser = { uid: 'traveler-1' };

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback) => {
    focusEffect = callback;
  },
}));

jest.mock('../src/services/PersonalizationService', () => ({
  clearPersonalizationDiscoveryCache: jest.fn(),
  requestPersonalizedRecommendations: jest.fn(),
}));

jest.mock('../src/features/moderation/BlockedUsersContext', () => ({
  useBlockedUsers: () => ({ isBlocked: (uid) => uid === 'blocked-user' }),
}));

jest.mock('../src/hooks/useAuthUser', () => ({
  useAuthUser: () => ({ user: mockUser }),
}));

describe('useRecommendations request behavior', () => {
  beforeEach(() => {
    focusEffect = null;
    mockUser = { uid: 'traveler-1' };
    requestPersonalizedRecommendations.mockReset();
    clearPersonalizationDiscoveryCache.mockReset();
  });

  it('uses the same coordinated request path on focus and explicit refresh', async () => {
    requestPersonalizedRecommendations.mockImplementation(() => ({
      requested: true,
      source: 'network',
      promise: Promise.resolve({ items: [{ id: 'rec-1', ownerId: 'visible-user' }] }),
    }));
    const { result } = renderHook(() => useRecommendations());

    await act(async () => {
      await focusEffect();
    });
    expect(requestPersonalizedRecommendations).toHaveBeenLastCalledWith(
      expect.objectContaining({ sort: 'popular', limit: 30 })
    );
    await waitFor(() => expect(result.current.data).toHaveLength(1));

    await act(async () => {
      await result.current.refresh();
    });
    expect(requestPersonalizedRecommendations).toHaveBeenLastCalledWith(
      expect.objectContaining({ sort: 'popular', limit: 30 })
    );
  });

  it('preserves rendered data when an explicit refresh fails', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const consoleInfo = jest.spyOn(console, 'info').mockImplementation(() => {});
    requestPersonalizedRecommendations
      .mockImplementationOnce(() => ({
        requested: true,
        source: 'network',
        promise: Promise.resolve({ items: [{ id: 'rec-1', ownerId: 'visible-user' }] }),
      }))
      .mockImplementationOnce(() => ({
        requested: true,
        source: 'network',
        promise: Promise.reject(Object.assign(new Error('resource-exhausted'), {
        code: 'functions/resource-exhausted',
        })),
      }));
    const { result } = renderHook(() => useRecommendations());
    await act(async () => {
      await focusEffect();
    });
    await waitFor(() => expect(result.current.data).toHaveLength(1));

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.data).toEqual([{ id: 'rec-1', ownerId: 'visible-user' }]);
    expect(result.current.error).toEqual(expect.any(Error));
    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleInfo).toHaveBeenCalledWith(
      'discovery_request_throttled',
      { surface: 'recommendations' }
    );
    consoleError.mockRestore();
    consoleInfo.mockRestore();
  });

  it('invalidates discovery and cancels an in-flight refresh after a local deletion', async () => {
    let resolveRefresh;
    requestPersonalizedRecommendations
      .mockImplementationOnce(() => ({
        requested: true,
        source: 'network',
        promise: Promise.resolve({ items: [{ id: 'rec-1', ownerId: 'visible-user' }] }),
      }))
      .mockImplementationOnce(() => ({
        requested: true,
        source: 'network',
        promise: new Promise((resolve) => { resolveRefresh = resolve; }),
      }));
    const { result } = renderHook(() => useRecommendations());
    await act(async () => {
      await focusEffect();
    });

    let refreshRequest;
    act(() => {
      refreshRequest = result.current.refresh();
    });
    expect(result.current.refreshing).toBe(true);
    act(() => result.current.removeRecommendation('rec-1'));

    expect(clearPersonalizationDiscoveryCache).toHaveBeenCalledWith('recommendations');
    expect(result.current.refreshing).toBe(false);
    expect(result.current.data).toEqual([]);

    await act(async () => {
      resolveRefresh({ items: [{ id: 'stale-rec', ownerId: 'visible-user' }] });
      await refreshRequest;
    });
    expect(result.current.data).toEqual([]);
  });

  it('clears retained recommendations when the authenticated user changes', async () => {
    requestPersonalizedRecommendations
      .mockImplementationOnce(() => ({
        requested: true,
        source: 'network',
        promise: Promise.resolve({ items: [{ id: 'user-1-rec', ownerId: 'visible-user' }] }),
      }))
      .mockImplementationOnce(() => ({
        requested: true,
        source: 'network',
        promise: Promise.reject(new Error('load failed')),
      }));
    const { result, rerender } = renderHook(() => useRecommendations());
    await act(async () => {
      await focusEffect();
    });
    await waitFor(() => expect(result.current.data).toHaveLength(1));

    mockUser = { uid: 'traveler-2' };
    rerender({});
    expect(result.current.data).toEqual([]);

    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    await act(async () => {
      await focusEffect();
    });
    expect(result.current.data).toEqual([]);
    consoleError.mockRestore();
  });
});
