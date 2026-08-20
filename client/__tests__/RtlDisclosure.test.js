import React from 'react';
import { TouchableOpacity } from 'react-native';
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
  it('places a right-pointing profile-menu chevron first on a row-reverse layout', () => {
    const screen = render(
      <ProfileMenuList
        items={[{ key: 'settings', label: 'הגדרות', icon: 'settings-outline' }]}
        onPressItem={jest.fn()}
        notificationBadge={0}
      />
    );
    const row = screen.UNSAFE_getByType(TouchableOpacity);
    const chevron = row.props.children[0];

    expect(chevron.props.testID).toBe('profile-menu-chevron-settings');
    expect(screen.getByText('chevron-forward', { includeHiddenElements: true })).toBeTruthy();
  });
});
