import React from 'react';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { FlatList, StyleSheet } from 'react-native';

import RoutesScreen from '../src/features/roadtrip/screens/RoutesScreen';
import { loadRouteDetails, requestRoutes } from '../src/services/RouteService';
import { routesScreenStyles } from '../src/styles';

let mockUser = null;
let mockFocusEffect = null;
let mockTabRefresh = null;

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};
const routeAttempt = (promise) => ({
  requested: true,
  source: 'network',
  promise: Promise.resolve(promise),
});

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
  requestRoutes: jest.fn(),
  loadRouteDetails: jest.fn(),
}));

jest.mock('../src/services/SocialService', () => ({
  deleteContent: jest.fn(),
}));

jest.mock('../src/components/PageHeader', () => {
  const ReactModule = require('react');
  const { Text, View } = require('react-native');
  return ({ children, title, renderStart, renderEnd, ...props }) => ReactModule.createElement(
    View,
    props,
    renderStart?.(),
    title ? ReactModule.createElement(Text, null, title) : null,
    renderEnd?.(),
    children
  );
});

jest.mock('../src/components/RoutesFilterModal', () => () => null);
jest.mock('../src/components/FabButton', () => () => null);
jest.mock('../src/features/roadtrip/components/RouteCard', () => {
  const ReactModule = require('react');
  const { Pressable, Text, View } = require('react-native');
  return {
    RouteCard: ({ item, topContentInset, onPress, onEdit }) => ReactModule.createElement(
      View,
      { testID: `route-${item.id}`, topContentInset },
      ReactModule.createElement(Text, null, item.id),
      ReactModule.createElement(Pressable, { testID: `open-${item.id}`, onPress }),
      ReactModule.createElement(Pressable, { testID: `edit-${item.id}`, onPress: onEdit })
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
    requestRoutes.mockReset();
    requestRoutes.mockImplementation(() => ({
      requested: true,
      source: 'network',
      promise: Promise.resolve({ items: [] }),
    }));
    loadRouteDetails.mockReset();
  });

  it.each([
    ['guest', null],
    ['signed-in user', { uid: 'traveler-1' }],
  ])('renders for a %s without relying on a global auth variable', (_label, user) => {
    mockUser = user;
    expect(() => render(<RoutesScreen navigation={{ navigate: jest.fn() }} />)).not.toThrow();
  });

  it('uses the shared request path on focus and refresh, and preserves rendered routes on error', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const consoleInfo = jest.spyOn(console, 'info').mockImplementation(() => {});
    requestRoutes
      .mockImplementationOnce(() => routeAttempt({ items: [{ id: 'route-1' }] }))
      .mockImplementationOnce(() => routeAttempt(Promise.reject(Object.assign(new Error('resource-exhausted'), {
        code: 'functions/resource-exhausted',
      }))));
    const screen = render(<RoutesScreen navigation={{ navigate: jest.fn() }} />);

    await act(async () => {
      await mockFocusEffect();
    });
    expect(requestRoutes).toHaveBeenLastCalledWith(
      expect.objectContaining({ sort: 'popular', limit: 30 })
    );
    await waitFor(() => expect(screen.getByTestId('route-route-1')).toBeTruthy());

    await act(async () => {
      await mockTabRefresh();
    });
    expect(requestRoutes).toHaveBeenLastCalledWith(
      expect.objectContaining({ sort: 'popular', limit: 30 })
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
    requestRoutes
      .mockImplementationOnce(() => routeAttempt({ items: [{ id: 'user-1-route' }] }))
      .mockImplementationOnce(() => routeAttempt(Promise.reject(new Error('load failed'))));
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

  it('reports route open failures instead of leaving a dead tap', async () => {
    const consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const alert = jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(() => {});
    requestRoutes.mockImplementationOnce(() => routeAttempt({ items: [{ id: 'route-1' }] }));
    loadRouteDetails.mockRejectedValueOnce(Object.assign(new Error('offline'), { code: 'functions/unavailable' }));
    const screen = render(<RoutesScreen navigation={{ navigate: jest.fn() }} />);
    await act(async () => { await mockFocusEffect(); });
    await waitFor(() => expect(screen.getByTestId('open-route-1')).toBeTruthy());
    await act(async () => { fireEvent.press(screen.getByTestId('open-route-1')); });
    await waitFor(() => expect(alert).toHaveBeenCalledWith(
      'לא הצלחנו לפתוח את המסלול', 'אפשר לנסות שוב בעוד רגע.'
    ));
    consoleWarn.mockRestore();
    alert.mockRestore();
  });

  it('centers the empty state in the available feed body', async () => {
    const screen = render(<RoutesScreen navigation={{ navigate: jest.fn() }} />);
    await act(async () => {
      await mockFocusEffect();
    });

    const list = screen.UNSAFE_getByType(FlatList);
    const contentStyle = StyleSheet.flatten(list.props.contentContainerStyle);
    const emptyStyle = StyleSheet.flatten(screen.getByTestId('routes-empty-state').props.style);

    expect(contentStyle).toMatchObject({ flexGrow: 1 });
    expect(StyleSheet.flatten(list.props.style).backgroundColor).toBe('#28486D');
    expect(list.props.ListHeaderComponent).toBeTruthy();
    expect(list.props.stickyHeaderIndices).toBeUndefined();
    expect(screen.getByTestId('routes-tab-header').props.overlapNext).toBe(true);
    expect(within(list).queryByTestId('routes-tab-header')).toBeNull();
    expect(emptyStyle).toMatchObject({ marginTop: 0, justifyContent: 'center' });
  });

  it('matches the Community labeled-action geometry', () => {
    const screen = render(<RoutesScreen navigation={{ navigate: jest.fn() }} />);
    expect(StyleSheet.flatten(routesScreenStyles.filtersAfterOverlappingHeader).paddingTop).toBe(36);
    expect(StyleSheet.flatten(screen.getByTestId('routes-sort-button').props.style)).toMatchObject({
      width: 80,
      height: 44,
    });
    expect(StyleSheet.flatten(screen.getByTestId('routes-filter-button').props.style)).toMatchObject({
      width: 44,
      height: 44,
    });
    expect(StyleSheet.flatten(screen.getByTestId('routes-search-row').props.style)).toMatchObject({
      width: '100%',
      marginTop: 12,
      gap: 8,
    });
    expect(StyleSheet.flatten(screen.getByTestId('routes-search-field').props.style)).toMatchObject({
      width: '100%',
      height: 48,
      borderRadius: 16,
      paddingHorizontal: 14,
      flexDirection: 'row-reverse',
      gap: 9,
    });
    expect(StyleSheet.flatten(screen.getByTestId('routes-search-input').props.style)).toMatchObject({
      height: '100%',
      fontSize: 15,
      paddingLeft: 0,
      paddingRight: 0,
      textAlign: 'right',
    });
  });

  it('replaces retained routes with a centered state only while refresh is pending', async () => {
    const pendingRefresh = deferred();
    requestRoutes
      .mockImplementationOnce(() => routeAttempt({ items: [{ id: 'route-1' }] }))
      .mockImplementationOnce(() => routeAttempt(pendingRefresh.promise));
    const screen = render(<RoutesScreen navigation={{ navigate: jest.fn() }} />);
    await act(async () => {
      await mockFocusEffect();
    });
    await waitFor(() => expect(screen.getByTestId('route-route-1')).toBeTruthy());

    let refreshPromise;
    act(() => {
      refreshPromise = mockTabRefresh();
    });
    expect(screen.getByTestId('routes-refresh-state')).toBeTruthy();
    expect(screen.queryByTestId('route-route-1')).toBeNull();

    await act(async () => {
      pendingRefresh.resolve({ items: [{ id: 'route-2' }] });
      await refreshPromise;
    });
    expect(screen.getByTestId('route-route-2')).toBeTruthy();
    expect(screen.getByTestId('route-route-2').props.topContentInset).toBe(28);
  });
});
