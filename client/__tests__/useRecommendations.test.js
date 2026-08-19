import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useRecommendations } from '../src/hooks/useRecommendations';
import {
  clearPersonalizationDiscoveryCache,
  getPersonalizedRecommendations,
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
  getPersonalizedRecommendations: jest.fn(),
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
    getPersonalizedRecommendations.mockReset();
    clearPersonalizationDiscoveryCache.mockReset();
  });

  it('uses cache on focus and bypasses it only for explicit refresh', async () => {
    getPersonalizedRecommendations.mockResolvedValue({
      items: [{ id: 'rec-1', ownerId: 'visible-user' }],
    });
    const { result } = renderHook(() => useRecommendations());

    await act(async () => {
      await focusEffect();
    });
    expect(getPersonalizedRecommendations).toHaveBeenLastCalledWith(
      expect.objectContaining({ sort: 'popular', limit: 30 }),
      { forceRefresh: false }
    );
    await waitFor(() => expect(result.current.data).toHaveLength(1));

    await act(async () => {
      await result.current.refresh();
    });
    expect(getPersonalizedRecommendations).toHaveBeenLastCalledWith(
      expect.objectContaining({ sort: 'popular', limit: 30 }),
      { forceRefresh: true }
    );
  });

  it('preserves rendered data when an explicit refresh fails', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const consoleInfo = jest.spyOn(console, 'info').mockImplementation(() => {});
    getPersonalizedRecommendations
      .mockResolvedValueOnce({ items: [{ id: 'rec-1', ownerId: 'visible-user' }] })
      .mockRejectedValueOnce(Object.assign(new Error('resource-exhausted'), {
        code: 'functions/resource-exhausted',
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
    getPersonalizedRecommendations
      .mockResolvedValueOnce({ items: [{ id: 'rec-1', ownerId: 'visible-user' }] })
      .mockImplementationOnce(() => new Promise((resolve) => { resolveRefresh = resolve; }));
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
    getPersonalizedRecommendations
      .mockResolvedValueOnce({ items: [{ id: 'user-1-rec', ownerId: 'visible-user' }] })
      .mockRejectedValueOnce(new Error('load failed'));
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
