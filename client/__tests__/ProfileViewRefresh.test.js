import React from 'react';
import { Dimensions, FlatList, StyleSheet } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { NavigationContext } from '@react-navigation/native';

import ProfileView from '../src/features/profile/components/ProfileView';

jest.mock('../src/components/ContentTile', () => ({
  getContentGridColumns: () => 3,
}));

jest.mock('../src/features/profile/components/ProfileHeader', () => {
  const ReactModule = require('react');
  const { View: MockView } = require('react-native');
  return () => ReactModule.createElement(MockView, { testID: 'profile-identity-header' });
});

jest.mock('../src/features/profile/components/ProfileContentGrid', () => {
  const ReactModule = require('react');
  const { Text: MockText, View: MockView, Pressable: MockPressable } = require('react-native');
  return {
    ProfileContentHeader: ({ contentTab, onChangeTab, showPending }) => ReactModule.createElement(
      MockView,
      { testID: 'profile-content-tabs' },
      (showPending ? ['recommendations', 'routes', 'pending'] : ['recommendations', 'routes']).map((tab) => (
        ReactModule.createElement(MockPressable, {
          key: tab,
          accessibilityRole: 'tab',
          accessibilityLabel: tab,
          accessibilityState: { selected: tab === contentTab },
          onPress: () => onChangeTab(tab),
        })
      ))
    ),
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
  return { MaterialIcons: ({ name }) => ReactModule.createElement(MockText, null, name), Ionicons: ({ name }) => ReactModule.createElement(MockText, null, name) };
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
  afterEach(() => jest.restoreAllMocks());

  it.each([true, false])('preserves the list across content switches (owner: %s)', (isOwner) => {
    const scroll = jest.spyOn(FlatList.prototype, 'scrollToOffset').mockImplementation(() => {});
    const screen = render(<ProfileView {...baseProps} isOwner={isOwner} routes={[{ id: 'route-1' }]} />);
    const list = screen.UNSAFE_getByType(FlatList).instance;
    const header = screen.getByTestId('profile-identity-header');
    fireEvent(screen.UNSAFE_getByType(FlatList), 'layout', { nativeEvent: { layout: { height: 600 } } });
    fireEvent.scroll(screen.UNSAFE_getByType(FlatList), { nativeEvent: { contentOffset: { y: 250 } } });
    fireEvent.press(screen.getByRole('tab', { name: 'routes' }));

    expect(screen.UNSAFE_getByType(FlatList).instance).toBe(list);
    expect(screen.getByTestId('profile-identity-header')).toBe(header);
    expect(screen.getByTestId('profile-item-route-1')).toBeTruthy();
    expect(screen.queryByTestId('profile-item-rec-1')).toBeNull();
    expect(StyleSheet.flatten(screen.UNSAFE_getByType(FlatList).props.contentContainerStyle).minHeight).toBe(850);

    if (isOwner) {
      fireEvent.press(screen.getByRole('tab', { name: 'pending' }));
      expect(screen.getByTestId('profile-content-empty')).toBeTruthy();
      expect(StyleSheet.flatten(screen.UNSAFE_getByType(FlatList).props.contentContainerStyle).minHeight).toBe(850);
    }
    fireEvent.press(screen.getByRole('tab', { name: 'recommendations' }));
    expect(screen.getByTestId('profile-item-rec-1')).toBeTruthy();
    expect(screen.UNSAFE_getByType(FlatList).instance).toBe(list);
    expect(scroll).not.toHaveBeenCalled();
  });

  it('recalculates space only on a different category and clamps negative bounce offsets', () => {
    const screen = render(<ProfileView {...baseProps} />);
    const list = () => screen.UNSAFE_getByType(FlatList);
    const minHeight = () => StyleSheet.flatten(list().props.contentContainerStyle).minHeight;
    fireEvent(list(), 'layout', { nativeEvent: { layout: { height: 600 } } });
    fireEvent.scroll(list(), { nativeEvent: { contentOffset: { y: 250 } } });
    fireEvent.press(screen.getByRole('tab', { name: 'routes' }));
    expect(minHeight()).toBe(850);
    fireEvent.scroll(list(), { nativeEvent: { contentOffset: { y: 100 } } });
    fireEvent.press(screen.getByRole('tab', { name: 'routes' }));
    expect(minHeight()).toBe(850);
    fireEvent.press(screen.getByRole('tab', { name: 'pending' }));
    expect(minHeight()).toBe(700);
    fireEvent.scroll(list(), { nativeEvent: { contentOffset: { y: -20 } } });
    fireEvent.press(screen.getByRole('tab', { name: 'recommendations' }));
    expect(minHeight()).toBe(600);
  });

  it('clears preserved space when the window changes size', () => {
    const originalWindow = Dimensions.get('window');
    const originalScreen = Dimensions.get('screen');
    const screen = render(<ProfileView {...baseProps} />);
    fireEvent(screen.UNSAFE_getByType(FlatList), 'layout', { nativeEvent: { layout: { height: 600 } } });
    fireEvent.scroll(screen.UNSAFE_getByType(FlatList), { nativeEvent: { contentOffset: { y: 250 } } });
    fireEvent.press(screen.getByRole('tab', { name: 'routes' }));
    try {
      act(() => Dimensions.set({ window: { ...originalWindow, width: originalWindow.width + 100 } }));
      expect(StyleSheet.flatten(screen.UNSAFE_getByType(FlatList).props.contentContainerStyle).minHeight).toBe(0);
    } finally {
      act(() => Dimensions.set({ window: originalWindow, screen: originalScreen }));
    }
  });

  it('still scrolls to top on a main-tab re-press after changing category, then refreshes at top', () => {
    let pressTab;
    const navigation = {
      isFocused: () => true,
      addListener: (event, handler) => { pressTab = handler; return () => {}; },
    };
    const onRefresh = jest.fn();
    const scroll = jest.spyOn(FlatList.prototype, 'scrollToOffset').mockImplementation(() => {});
    const screen = render(
      <NavigationContext.Provider value={navigation}>
        <ProfileView {...baseProps} onRefresh={onRefresh} />
      </NavigationContext.Provider>
    );
    fireEvent.scroll(screen.UNSAFE_getByType(FlatList), { nativeEvent: { contentOffset: { y: 250 } } });
    fireEvent.press(screen.getByRole('tab', { name: 'routes' }));
    expect(scroll).not.toHaveBeenCalled();
    act(() => pressTab());
    expect(scroll).toHaveBeenCalledWith({ offset: 0, animated: true });
    expect(onRefresh).not.toHaveBeenCalled();
    fireEvent.scroll(screen.UNSAFE_getByType(FlatList), { nativeEvent: { contentOffset: { y: 0 } } });
    act(() => pressTab());
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('routes the visible toolbar to the owner menu or public-profile back action', () => {
    const menu = jest.fn();
    const back = jest.fn();
    const screen = render(<ProfileView {...baseProps} onMenuPress={menu} onBackPress={back} />);
    fireEvent.press(screen.getByRole('button', { name: 'פתיחת תפריט פרופיל' }));
    expect(menu).toHaveBeenCalledTimes(1);
    expect(back).not.toHaveBeenCalled();
    screen.rerender(<ProfileView {...baseProps} isOwner={false} onMenuPress={menu} onBackPress={back} />);
    expect(screen.queryByRole('button', { name: 'פתיחת תפריט פרופיל' })).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'חזרה' }));
    expect(back).toHaveBeenCalledTimes(1);
  });

  it('keeps the list and identity header mounted while replacing only the grid body', () => {
    const screen = render(<ProfileView {...baseProps} refreshing />);
    const list = screen.UNSAFE_getByType(FlatList);

    expect(list.props.ListHeaderComponent).toBeTruthy();
    expect(list.props.stickyHeaderIndices).toBeUndefined();
    expect(StyleSheet.flatten(list.props.style).backgroundColor).toBe('#FAF7F2');
    expect(StyleSheet.flatten(list.props.contentContainerStyle).backgroundColor).toBe('#FAF7F2');
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
