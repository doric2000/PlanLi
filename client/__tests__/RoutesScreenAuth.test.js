import React from 'react';
import { render } from '@testing-library/react-native';

import RoutesScreen from '../src/features/roadtrip/screens/RoutesScreen';

let mockUser = null;

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(),
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
  useAuthUser: () => ({ user: mockUser, requireCapability: jest.fn() }),
}));

jest.mock('../src/hooks/useTabPressScrollOrRefresh', () => ({
  useTabPressScrollOrRefresh: () => ({ onScroll: jest.fn() }),
}));

jest.mock('../src/hooks/useSmartProfile', () => ({
  useSmartProfile: () => ({ smartProfile: null, completed: false, loading: false }),
}));

jest.mock('../src/features/publishing/ContentPublishContext', () => ({
  useContentPublish: () => ({ completedVersionByType: {} }),
}));

jest.mock('../src/services/RouteService', () => ({
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
jest.mock('../src/features/roadtrip/components/RouteCard', () => ({ RouteCard: () => null }));
jest.mock('../src/components/CommentsModal', () => ({ CommentsModal: () => null }));
jest.mock('../src/features/roadtrip/components/ActiveRouteFiltersList', () => () => null);
jest.mock('../src/features/community/components/SortMenuModal', () => ({ SortMenuModal: () => null }));

describe('RoutesScreen authentication state', () => {
  it.each([
    ['guest', null],
    ['signed-in user', { uid: 'traveler-1' }],
  ])('renders for a %s without relying on a global auth variable', (_label, user) => {
    mockUser = user;
    expect(() => render(<RoutesScreen navigation={{ navigate: jest.fn() }} />)).not.toThrow();
  });
});
