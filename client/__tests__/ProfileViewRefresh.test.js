import React from 'react';
import { FlatList, StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';

import ProfileView from '../src/features/profile/components/ProfileView';

jest.mock('../src/components/ContentTile', () => ({
  getContentGridColumns: () => 3,
}));

jest.mock('../src/hooks/useTabPressScrollOrRefresh', () => ({
  useTabPressScrollOrRefresh: () => ({ onScroll: jest.fn() }),
}));

jest.mock('../src/features/profile/components/ProfileHeader', () => {
  const ReactModule = require('react');
  const { View: MockView } = require('react-native');
  return () => ReactModule.createElement(MockView, { testID: 'profile-identity-header' });
});

jest.mock('../src/features/profile/components/ProfileContentGrid', () => {
  const ReactModule = require('react');
  const { Text: MockText, View: MockView } = require('react-native');
  return {
    ProfileContentHeader: () => ReactModule.createElement(MockView, { testID: 'profile-content-tabs' }),
    ProfileContentEmpty: () => ReactModule.createElement(MockView, { testID: 'profile-content-empty' }),
    ProfileGridTile: ({ item }) => ReactModule.createElement(
      MockText,
      { testID: `profile-item-${item.id}` },
      item.id
    ),
  };
});

jest.mock('../src/features/profile/components/ProfileBioModal', () => () => null);
jest.mock('../src/features/moderation/components/ReportButton', () => () => null);
jest.mock('../src/features/profile/utils/profileMetrics', () => ({
  selectProfileHeroMedia: () => [],
}));

jest.mock('react-native-safe-area-context', () => {
  const ReactModule = require('react');
  const { View: MockView } = require('react-native');
  return {
    SafeAreaView: ({ children, ...props }) => ReactModule.createElement(MockView, props, children),
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  };
});

jest.mock('@expo/vector-icons', () => {
  const ReactModule = require('react');
  const { Text: MockText } = require('react-native');
  return { MaterialIcons: ({ name }) => ReactModule.createElement(MockText, null, name) };
});

const baseProps = {
  navigation: { navigate: jest.fn() },
  userData: { displayName: 'Dana' },
  stats: { recommendations: 1, routes: 0 },
  statsLoading: false,
  recommendations: [{ id: 'rec-1' }],
  routes: [],
  contentLoading: false,
  isOwner: true,
  onRefresh: jest.fn(),
};

describe('ProfileView refresh behavior', () => {
  it('keeps the list and identity header mounted while replacing only the grid body', () => {
    const screen = render(<ProfileView {...baseProps} refreshing />);
    const list = screen.UNSAFE_getByType(FlatList);

    expect(list.props.ListHeaderComponent).toBeTruthy();
    expect(list.props.stickyHeaderIndices).toBeUndefined();
    expect(StyleSheet.flatten(list.props.style).backgroundColor).toBe('#28486D');
    expect(StyleSheet.flatten(list.props.contentContainerStyle).backgroundColor).toBe('#F4F5F9');
    expect(screen.getByTestId('profile-identity-header')).toBeTruthy();
    expect(screen.getByTestId('profile-content-tabs')).toBeTruthy();
    expect(screen.getByTestId('profile-refresh-state')).toBeTruthy();
    expect(screen.queryByTestId('profile-item-rec-1')).toBeNull();
  });

  it('retains cached content on an error and shows an error only without content', () => {
    const cached = render(<ProfileView {...baseProps} contentError={new Error('offline')} />);
    expect(cached.getByTestId('profile-item-rec-1')).toBeTruthy();
    expect(cached.queryByTestId('profile-content-error-state')).toBeNull();

    const empty = render(
      <ProfileView
        {...baseProps}
        recommendations={[]}
        contentError={new Error('offline')}
      />
    );
    expect(empty.getByTestId('profile-content-error-state')).toBeTruthy();
  });
});
