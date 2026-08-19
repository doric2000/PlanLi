import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';

import RoutesScreen from '../src/features/roadtrip/screens/RoutesScreen';
import { discoverRoutes } from '../src/services/RouteService';

let mockUser = null;
let mockFocusEffect = null;
let mockTabRefresh = null;

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback) => {
    mockFocusEffect = callback;
  },
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

jest.mock('react-native-safe-area-context', () => {
  const ReactModule = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children, ...props }) => ReactModule.createElement(View, props, children),
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  };
});

jest.mock('../src/hooks/useAuthUser', () => ({
  useAuthUser: () => ({ user: mockUser, ensureCapability: jest.fn(async () => false) }),
}));

jest.mock('../src/hooks/useTabPressScrollOrRefresh', () => ({
  useTabPressScrollOrRefresh: ({ onRefresh }) => {
    mockTabRefresh = onRefresh;
    return { onScroll: jest.fn() };
  },
}));

jest.mock('../src/hooks/useSmartProfile', () => ({
  useSmartProfile: () => ({ smartProfile: null, completed: false, loading: false }),
}));

jest.mock('../src/features/publishing/ContentPublishContext', () => ({
  useContentPublish: () => ({ completedVersionByType: {} }),
}));

jest.mock('../src/services/RouteService', () => ({
  clearRouteDiscoveryCache: jest.fn(),
  discoverRoutes: jest.fn(),
  loadRouteDetails: jest.fn(),
}));

jest.mock('../src/services/SocialService', () => ({
  deleteContent: jest.fn(),
}));

jest.mock('../src/components/PageHeader', () => {
  const ReactModule = require('react');
  const { View } = require('react-native');
  return ({ children }) => ReactModule.createElement(View, null, children);
});

jest.mock('../src/components/SearchFilterRow', () => {
  const ReactModule = require('react');
  const { View } = require('react-native');
  return ({ children }) => ReactModule.createElement(View, null, children);
});

jest.mock('../src/components/RoutesFilterModal', () => () => null);
jest.mock('../src/components/FabButton', () => () => null);
jest.mock('../src/features/roadtrip/components/RouteCard', () => {
  const ReactModule = require('react');
  const { Text } = require('react-native');
  return {
    RouteCard: ({ item }) => ReactModule.createElement(
      Text,
      { testID: `route-${item.id}` },
      item.id
    ),
  };
});
jest.mock('../src/components/CommentsModal', () => ({ CommentsModal: () => null }));
jest.mock('../src/features/roadtrip/components/ActiveRouteFiltersList', () => () => null);
jest.mock('../src/features/community/components/SortMenuModal', () => ({ SortMenuModal: () => null }));

describe('RoutesScreen authentication state', () => {
  beforeEach(() => {
    mockUser = null;
    mockFocusEffect = null;
    mockTabRefresh = null;
    discoverRoutes.mockReset();
    discoverRoutes.mockResolvedValue({ items: [] });
  });

  it.each([
    ['guest', null],
    ['signed-in user', { uid: 'traveler-1' }],
  ])('renders for a %s without relying on a global auth variable', (_label, user) => {
    mockUser = user;
    expect(() => render(<RoutesScreen navigation={{ navigate: jest.fn() }} />)).not.toThrow();
  });

  it('uses cached discovery on focus, forces explicit refresh, and preserves rendered routes on error', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const consoleInfo = jest.spyOn(console, 'info').mockImplementation(() => {});
    discoverRoutes
      .mockResolvedValueOnce({ items: [{ id: 'route-1' }] })
      .mockRejectedValueOnce(Object.assign(new Error('resource-exhausted'), {
        code: 'functions/resource-exhausted',
      }));
    const screen = render(<RoutesScreen navigation={{ navigate: jest.fn() }} />);

    await act(async () => {
      await mockFocusEffect();
    });
    expect(discoverRoutes).toHaveBeenLastCalledWith(
      expect.objectContaining({ sort: 'popular', limit: 30 }),
      { forceRefresh: false }
    );
    await waitFor(() => expect(screen.getByTestId('route-route-1')).toBeTruthy());

    await act(async () => {
      await mockTabRefresh();
    });
    expect(discoverRoutes).toHaveBeenLastCalledWith(
      expect.objectContaining({ sort: 'popular', limit: 30 }),
      { forceRefresh: true }
    );
    expect(screen.getByTestId('route-route-1')).toBeTruthy();
    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleInfo).toHaveBeenCalledWith(
      'discovery_request_throttled',
      { surface: 'routes' }
    );
    consoleError.mockRestore();
    consoleInfo.mockRestore();
  });

  it('clears retained routes when the authenticated user changes', async () => {
    mockUser = { uid: 'traveler-1' };
    discoverRoutes
      .mockResolvedValueOnce({ items: [{ id: 'user-1-route' }] })
      .mockRejectedValueOnce(new Error('load failed'));
    const screen = render(<RoutesScreen navigation={{ navigate: jest.fn() }} />);
    await act(async () => {
      await mockFocusEffect();
    });
    await waitFor(() => expect(screen.getByTestId('route-user-1-route')).toBeTruthy());

    mockUser = { uid: 'traveler-2' };
    screen.rerender(<RoutesScreen navigation={{ navigate: jest.fn() }} />);
    expect(screen.queryByTestId('route-user-1-route')).toBeNull();

    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    await act(async () => {
      await mockFocusEffect();
    });
    expect(screen.queryByTestId('route-user-1-route')).toBeNull();
    consoleError.mockRestore();
  });
});
