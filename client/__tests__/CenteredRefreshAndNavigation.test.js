import React from 'react';
import { RefreshControl, StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';

import BackButton from '../src/components/BackButton';
import {
  CenteredRefreshControl,
  CenteredRefreshState,
} from '../src/components/CenteredRefresh';
import NavigationChevron from '../src/components/NavigationChevron';
import { useBackButton } from '../src/hooks/useBackButton';

const mockGoBack = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack }),
}));

jest.mock('@expo/vector-icons', () => {
  const ReactRuntime = require('react');
  const { Text } = require('react-native');
  return {
    Ionicons: ({ name, ...props }) => ReactRuntime.createElement(
      Text,
      { ...props, testID: props.testID || `icon-${name}` },
      name
    ),
  };
});

function BackButtonHarness({ navigation, onPress }) {
  useBackButton(navigation, { title: 'כותרת', onPress });
  return null;
}

describe('centered pull-to-refresh primitives', () => {
  it('keeps the pull gesture while hiding the native top-edge indicator', () => {
    const onRefresh = jest.fn();
    const screen = render(
      <CenteredRefreshControl refreshing onRefresh={onRefresh} />
    );
    const control = screen.UNSAFE_getByType(RefreshControl);

    expect(control.props).toMatchObject({
      refreshing: true,
      tintColor: 'transparent',
      progressBackgroundColor: 'transparent',
      colors: ['transparent'],
    });
    control.props.onRefresh();
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('renders an accessible centered progress state', () => {
    const screen = render(<CenteredRefreshState testID="refresh-state" />);
    const state = screen.getByTestId('refresh-state');
    const style = StyleSheet.flatten(state.props.style);

    expect(state.props.accessibilityRole).toBe('progressbar');
    expect(style).toMatchObject({ flex: 1, alignItems: 'center', justifyContent: 'center' });
  });
});

describe('RTL navigation primitives', () => {
  beforeEach(() => {
    mockGoBack.mockClear();
  });

  it('uses a right-pointing icon by default for back and disclosure controls', () => {
    const back = render(<BackButton />);
    expect(back.getByTestId('icon-chevron-forward')).toBeTruthy();
    fireEvent.press(back.getByRole('button'));
    expect(mockGoBack).toHaveBeenCalledTimes(1);

    const disclosure = render(<NavigationChevron testID="disclosure-chevron" />);
    expect(disclosure.getByText('chevron-forward', { includeHiddenElements: true })).toBeTruthy();
  });

  it('installs a balanced right-side stack-header button and preserves its callback', () => {
    const navigation = { setOptions: jest.fn(), goBack: jest.fn() };
    const onPress = jest.fn();
    render(<BackButtonHarness navigation={navigation} onPress={onPress} />);

    const options = navigation.setOptions.mock.calls.at(-1)[0];
    expect(options).toMatchObject({
      headerShown: true,
      headerTitleAlign: 'center',
      headerBackVisible: false,
    });

    const left = render(options.headerLeft());
    expect(StyleSheet.flatten(left.toJSON().props.style).width).toBe(54);

    const right = render(options.headerRight());
    expect(right.getByTestId('icon-chevron-forward')).toBeTruthy();
    fireEvent.press(right.getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(navigation.goBack).not.toHaveBeenCalled();
  });
});
