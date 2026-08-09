import React from 'react';
import { StyleSheet, TextInput } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';

import SearchFilterRow from '../src/components/SearchFilterRow';

jest.mock('@expo/vector-icons', () => {
  const ReactModule = require('react');
  const { Text } = require('react-native');
  return {
    Ionicons: ({ name, color }) => ReactModule.createElement(
      Text,
      { testID: `icon-${name}`, accessibilityValue: { text: color } },
      name
    ),
  };
});

describe('SearchFilterRow', () => {
  it('keeps an unwrapped filter action on the RTL search row', () => {
    const onFilterPress = jest.fn();
    const screen = render(
      <SearchFilterRow
        onFilterPress={onFilterPress}
        accessibilityLabel="סינון המלצות"
        filterTestID="filter-action"
        testID="search-filter-row"
      >
        <TextInput testID="search-input" />
      </SearchFilterRow>
    );

    const rowStyle = StyleSheet.flatten(screen.getByTestId('search-filter-row').props.style);
    const button = screen.getByTestId('filter-action');
    const buttonStyle = StyleSheet.flatten(button.props.style);

    expect(rowStyle).toMatchObject({ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 });
    expect(buttonStyle).toMatchObject({ width: 44, height: 44 });
    expect(buttonStyle.backgroundColor).toBeUndefined();
    expect(buttonStyle.borderWidth).toBeUndefined();
    expect(buttonStyle.shadowColor).toBeUndefined();
    expect(buttonStyle.elevation).toBeUndefined();
    expect(button.props.accessibilityState).toEqual({ selected: false });
    expect(screen.getByTestId('icon-options-outline')).toBeTruthy();

    fireEvent.press(button);
    expect(onFilterPress).toHaveBeenCalledTimes(1);
  });

  it('marks active filters through the icon and accessibility label without a badge', () => {
    const screen = render(
      <SearchFilterRow
        onFilterPress={jest.fn()}
        activeFilterCount={3}
        accessibilityLabel="סינון מסלולים"
        filterTestID="filter-action"
      >
        <TextInput />
      </SearchFilterRow>
    );

    const button = screen.getByTestId('filter-action');
    expect(button.props.accessibilityLabel).toBe('סינון מסלולים, 3 מסננים פעילים');
    expect(button.props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByTestId('icon-options')).toBeTruthy();
  });
});
