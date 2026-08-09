import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';

import CompactChip from '../src/components/CompactChip';
import FlatDisclosureRow from '../src/components/FlatDisclosureRow';

jest.mock('@expo/vector-icons', () => {
  const ReactModule = require('react');
  const { Text } = require('react-native');
  const Icon = ({ name }) => ReactModule.createElement(Text, { testID: `icon-${name}` }, name);
  return { Ionicons: Icon, MaterialIcons: Icon };
});

describe('compact presentation primitives', () => {
  it('wraps chip content without a forced column width and keeps accessible selection', () => {
    const onPress = jest.fn();
    const screen = render(
      <CompactChip
        label="טבע ונופים"
        icon="landscape"
        selected
        onPress={onPress}
        testID="compact-chip"
      />
    );
    const chip = screen.getByTestId('compact-chip');
    const style = StyleSheet.flatten(chip.props.style);

    expect(style.flexGrow).toBeUndefined();
    expect(style.flexBasis).toBeUndefined();
    expect(style).toMatchObject({ minHeight: 38, borderRadius: 19, backgroundColor: '#EEF3F8' });
    expect(chip.props.accessibilityRole).toBe('checkbox');
    expect(chip.props.accessibilityState).toEqual({ checked: true, disabled: false });
    expect(screen.getByTestId('icon-landscape')).toBeTruthy();

    fireEvent.press(chip);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders a flat disclosure row with RTL copy and expanded state', () => {
    const screen = render(
      <FlatDisclosureRow
        title="קהל ורמת מחיר"
        summary="לא נבחר"
        expanded={false}
        onPress={jest.fn()}
        testID="flat-disclosure"
      />
    );
    const row = screen.getByTestId('flat-disclosure');
    const titleStyle = StyleSheet.flatten(screen.getByText('קהל ורמת מחיר').props.style);

    expect(row.props.accessibilityState).toEqual({ expanded: false });
    expect(titleStyle.writingDirection).toBe('rtl');
    expect(screen.getByTestId('icon-chevron-down')).toBeTruthy();
  });
});
