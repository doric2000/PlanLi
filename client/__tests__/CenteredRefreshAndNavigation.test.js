import React from 'react';
import { RefreshControl, StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';

import BackButton, { BackLabel } from '../src/components/BackButton';
import RtlBackButton from '../src/components/RtlBackButton';
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
    expect(back.getByTestId('icon-chevron-forward', { includeHiddenElements: true })).toBeTruthy();
    fireEvent.press(back.getByRole('button'));
    expect(mockGoBack).toHaveBeenCalledTimes(1);

    const disclosure = render(<NavigationChevron testID="disclosure-chevron" />);
    expect(disclosure.getByText('chevron-forward', { includeHiddenElements: true })).toBeTruthy();
  });

  it.each(['solid', 'overlay', 'ghost'])('keeps a circular target and the same chevron for %s', (variant) => {
    const screen = render(<BackButton onPress={jest.fn()} variant={variant} testID="back" />);
    expect(StyleSheet.flatten(screen.getByTestId('back').props.style)).toMatchObject({
      width: 44, height: 44, borderRadius: 22,
    });
    expect(screen.getByTestId('icon-chevron-forward', { includeHiddenElements: true }).props.size).toBe(24);
    expect(screen.getByRole('button', { name: 'חזרה' })).toBeTruthy();
  });

  it('preserves disabled/busy state and the destination label', () => {
    const onPress = jest.fn();
    const screen = render(<RtlBackButton onPress={onPress} disabled
      accessibilityState={{ busy: true }} accessibilityLabel="חזרה לטיולים שלי" testID="back" />);
    expect(screen.getByTestId('back').props.accessibilityState).toMatchObject({ disabled: true, busy: true });
    fireEvent.press(screen.getByRole('button', { name: 'חזרה לטיולים שלי' }));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('keeps the destination text and hides the decorative chevron from accessibility', () => {
    const screen = render(<BackLabel style={{ color: '#FFFFFF' }}>חזרה להתחברות</BackLabel>);
    expect(screen.getByText('חזרה להתחברות')).toBeTruthy();
    const icon = screen.getByTestId('icon-chevron-forward', { includeHiddenElements: true });
    expect(icon.props).toMatchObject({ color: '#FFFFFF', size: 24, accessibilityElementsHidden: true });
  });

  it('installs a balanced right-side stack-header button and preserves its callback', () => {
    const navigation = { setOptions: jest.fn(), goBack: jest.fn() };
    const onPress = jest.fn();
    const harness = render(<BackButtonHarness navigation={navigation} onPress={onPress} />);

    const options = navigation.setOptions.mock.calls.at(-1)[0];
    expect(options).toMatchObject({
      headerShown: true,
      headerTitleAlign: 'center',
      headerBackVisible: false,
    });

    const left = render(options.headerLeft());
    expect(StyleSheet.flatten(left.toJSON().props.style).width).toBe(54);

    const right = render(options.headerRight());
    expect(right.getByTestId('icon-chevron-forward', { includeHiddenElements: true })).toBeTruthy();
    fireEvent.press(right.getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(navigation.goBack).not.toHaveBeenCalled();
    const nextHandler = jest.fn();
    harness.rerender(<BackButtonHarness navigation={navigation} onPress={nextHandler} />);
    fireEvent.press(right.getByRole('button'));
    expect(nextHandler).toHaveBeenCalledTimes(1);
    harness.rerender(<BackButtonHarness navigation={navigation} />);
    fireEvent.press(right.getByRole('button'));
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });
});
