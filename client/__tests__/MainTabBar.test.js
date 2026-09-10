import React from 'react';
import { Keyboard, StyleSheet } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import MainTabBar from '../src/navigation/MainTabBar';
import { getVisibleMainTabNames } from '../src/navigation/mainTabOrder';
import { mainNavigationStyles as styles } from '../src/styles/mainNavigationStyles';
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('../src/components/CachedImage', () => 'CachedImage');
jest.mock('../src/navigation/TabConfigs', () => ({ tabConfigs: {
  Profile: { icon: 'person', label: 'פרופיל' }, Auth: { icon: 'log-in', label: 'התחברות' },
  Favorites: { icon: 'bookmark', label: 'מועדפים' }, Community: { icon: 'people', label: 'קהילה' }, Home: { icon: 'home', label: 'בית' },
} }));
jest.mock('../src/navigation/SwipeableTabBarButton', () => {
  const { Pressable } = require('react-native');
  return ({ tourTargetId, onSwipe, ...props }) => <Pressable {...props} />;
});
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 34 }) }));
function setup(authed = true, unreadCount = 0) {
  const state = { index: 3, routes: getVisibleMainTabNames(authed).map((name) => ({ name, key: name })) };
  const navigation = { navigate: jest.fn(), emit: jest.fn(() => ({ defaultPrevented: false })) };
  return { ...render(<MainTabBar state={state} navigation={navigation} unreadCount={unreadCount} />), state, navigation };
}
it('updates the profile unread count and removes the badge when all notifications are read', () => {
  const s = setup(true, 1);
  expect(s.getByText('1')).toBeTruthy();
  expect(s.getByRole('tab', { name: 'פרופיל, התראה אחת שלא נקראה' })).toBeTruthy();
  s.rerender(<MainTabBar state={s.state} navigation={s.navigation} unreadCount={12} />);
  expect(s.getByText('12')).toBeTruthy();
  expect(s.getByRole('tab', { name: 'פרופיל, 12 התראות שלא נקראו' })).toBeTruthy();
  fireEvent.press(s.getByTestId('main-tab-profile'));
  expect(s.navigation.navigate).toHaveBeenCalledWith('Profile');
  s.rerender(<MainTabBar state={s.state} navigation={s.navigation} unreadCount={0} />);
  expect(s.queryByTestId('profile-unread-badge')).toBeNull();
  expect(s.getByRole('tab', { name: 'פרופיל' })).toBeTruthy();
});
it('caps the visible badge while keeping the full count accessible', () => {
  const s = setup(true, 123);
  expect(s.getByText('99+')).toBeTruthy();
  expect(s.getByRole('tab', { name: 'פרופיל, 123 התראות שלא נקראו' })).toBeTruthy();
});
it('does not show a previous unread count on the guest sign-in tab', () => {
  const s = setup(false, 12);
  expect(s.queryByTestId('profile-unread-badge')).toBeNull();
  expect(s.getByRole('tab', { name: 'התחברות' })).toBeTruthy();
});
it.each([true, false])('has four destinations and a center action, authenticated=%s', (authed) => {
  const s = setup(authed);
  expect(s.getAllByRole('tab')).toHaveLength(4);
  expect(s.getAllByRole('button')).toHaveLength(1);
  fireEvent.press(s.getByTestId('main-create-button'));
  expect(s.navigation.navigate).toHaveBeenCalledWith('CreateMenu');
  expect(s.navigation.emit).not.toHaveBeenCalled();
  expect(s.getByRole('tab', { name: 'בית' }).props.accessibilityState.selected).toBe(true);
  expect(s.queryByTestId('main-tab-routes')).toBeNull();
  expect(s.queryByTestId('main-tab-notifications')).toBeNull();
});
it('keeps preventable tab press and re-press behavior', () => {
  const s = setup();
  fireEvent.press(s.getByTestId('main-tab-home'));
  expect(s.navigation.emit).toHaveBeenCalledWith({ type: 'tabPress', target: 'Home', canPreventDefault: true });
  expect(s.navigation.navigate).not.toHaveBeenCalled();
  s.navigation.emit.mockReturnValue({ defaultPrevented: true });
  fireEvent.press(s.getByTestId('main-tab-community'));
  expect(s.navigation.navigate).not.toHaveBeenCalled();
  s.navigation.emit.mockReturnValue({ defaultPrevented: false });
  fireEvent.press(s.getByTestId('main-tab-community'));
  expect(s.navigation.navigate).toHaveBeenCalledWith('Community');
});
it('hides for keyboard and removes subscriptions', () => {
  const handlers = {}; const remove = jest.fn();
  const spy = jest.spyOn(Keyboard, 'addListener').mockImplementation((event, fn) => { handlers[event] = fn; return { remove }; });
  const s = setup();
  act(() => handlers.keyboardDidShow());
  expect(s.queryByTestId('main-tab-bar')).toBeNull();
  act(() => handlers.keyboardDidHide());
  expect(s.getByTestId('main-tab-bar')).toBeTruthy();
  s.unmount(); expect(remove).toHaveBeenCalledTimes(2); spy.mockRestore();
});
it.each([320, 390])('fits touch targets and plus within %spx', (width) => {
  const bar = StyleSheet.flatten(styles.bar); const slot = StyleSheet.flatten(styles.slot); const plus = StyleSheet.flatten(styles.create);
  const available = (width - bar.left - bar.right - bar.paddingHorizontal * 2) / 5;
  expect(available).toBeGreaterThanOrEqual(44); expect(slot.height).toBeGreaterThanOrEqual(44);
  expect(plus.width).toBeLessThanOrEqual(available); expect(plus.height).toBeLessThanOrEqual(slot.height);
  expect(slot.height + bar.paddingVertical * 2).toBe(bar.height);
});
