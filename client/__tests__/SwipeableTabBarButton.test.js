import React from 'react';
import { Text, View } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';

import SwipeableTabBarButton from '../src/navigation/SwipeableTabBarButton';

describe('SwipeableTabBarButton', () => {
  it('preserves the existing tab press and long-press controls', () => {
    const onPress = jest.fn();
    const onLongPress = jest.fn();
    const screen = render(
      <NavigationContainer>
        <SwipeableTabBarButton
          onPress={onPress}
          onLongPress={onLongPress}
          testID="swipeable-bottom-tab"
          role="tab"
          tourTargetId="main-tab-home"
        >
          <Text>Tab</Text>
        </SwipeableTabBarButton>
      </NavigationContainer>,
    );

    const button = screen.getByTestId('swipeable-bottom-tab');
    fireEvent.press(button);
    fireEvent(button, 'longPress');

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onLongPress).toHaveBeenCalledTimes(1);
    const gestureSurface = screen.UNSAFE_getAllByType(View).find(
      (node) => typeof node.props.onMoveShouldSetResponderCapture === 'function',
    );
    expect(gestureSurface).toBeTruthy();
    expect(gestureSurface.props.collapsable).toBe(false);
    expect(gestureSurface.props.onLayout).toEqual(expect.any(Function));
  });
});
