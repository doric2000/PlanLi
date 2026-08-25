import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import FabButton from '../src/components/FabButton';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

describe('FabButton', () => {
  it('preserves its action while exposing exact tour measurement props', () => {
    const onLayout = jest.fn();
    const onPress = jest.fn();
    const screen = render(
      <FabButton
        accessibilityLabel="הוספת המלצה"
        onLayout={onLayout}
        onPress={onPress}
        testID="add-recommendation"
      />,
    );

    const button = screen.getByTestId('add-recommendation');
    expect(button.props.accessibilityRole).toBe('button');
    expect(button.props.accessibilityLabel).toBe('הוספת המלצה');
    expect(button.props.collapsable).toBe(false);
    fireEvent(button, 'layout', { nativeEvent: { layout: {} } });
    fireEvent.press(button);
    expect(onLayout).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
