import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';

import ProfileMenuList from '../src/features/profile/components/ProfileMenuList';

jest.mock('@expo/vector-icons', () => {
  const ReactRuntime = require('react');
  const { Text } = require('react-native');
  return {
    Ionicons: ({ name, ...props }) => ReactRuntime.createElement(Text, props, name),
  };
});

describe('RTL disclosure rows', () => {
  it('lays out drawer rows explicitly from the RTL start with a left-facing chevron', () => {
    const screen = render(
      <ProfileMenuList
        items={[{ key: 'settings', label: 'הגדרות', icon: 'settings-outline' }]}
        onPressItem={jest.fn()}
        notificationBadge={0}
      />
    );
    const row = screen.getByTestId('drawer-menu-item-settings');
    const rowStyle = StyleSheet.flatten(row.props.style);

    expect(rowStyle).toEqual(expect.objectContaining({
      flexDirection: 'row-reverse',
      minHeight: 58,
    }));
    expect(StyleSheet.flatten(screen.getByText('הגדרות').props.style).writingDirection).toBe('rtl');
    expect(screen.getByText('chevron-back', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText('settings-outline', { includeHiddenElements: true })).toBeTruthy();
  });

  it('caps the notification badge and preserves a 44px-plus touch row', () => {
    const screen = render(
      <ProfileMenuList
        items={[{ key: 'notifications', label: 'התראות', icon: 'notifications-outline' }]}
        onPressItem={jest.fn()}
        notificationBadge={140}
      />
    );

    expect(screen.getByText('99+')).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByTestId('drawer-menu-item-notifications').props.style).minHeight)
      .toBeGreaterThanOrEqual(44);
  });
});
