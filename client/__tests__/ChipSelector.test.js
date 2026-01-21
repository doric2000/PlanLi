import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ChipSelector from '../src/features/community/components/ChipSelector';

/**
 * Simple unit test (no mocks).
 *
 * Goal:
 * - Make sure ChipSelector renders the label + items
 * - Make sure pressing a chip calls onSelect(item)
 *
 * Why this is easy:
 * - ChipSelector is a pure UI component: it does not call Firebase, navigation, or network.
 */

describe('ChipSelector (unit)', () => {
  it('renders items and calls onSelect when a chip is pressed', () => {
    const onSelect = jest.fn();

    const { getByText } = render(
      <ChipSelector
        label="קטגוריה"
        items={["אוכל ובילויים", "טבע ומסלולים"]}
        selectedValue=""
        onSelect={onSelect}
        multiSelect={false}
      />
    );

    // The label is shown
    expect(getByText('קטגוריה')).toBeTruthy();

    // Items are shown
    expect(getByText('אוכל ובילויים')).toBeTruthy();
    expect(getByText('טבע ומסלולים')).toBeTruthy();

    // Pressing a chip calls onSelect with the exact item
    fireEvent.press(getByText('אוכל ובילויים'));
    expect(onSelect).toHaveBeenCalledWith('אוכל ובילויים');
  });

  it('supports multiSelect: pressing a chip still calls onSelect with the tag', () => {
    const onSelect = jest.fn();

    const { getByText } = render(
      <ChipSelector
        label="תגיות"
        items={["מסעדה", "בר"]}
        selectedValue={["מסעדה"]}
        onSelect={onSelect}
        multiSelect={true}
      />
    );

    // A second press should still call onSelect - the parent decides add/remove.
    fireEvent.press(getByText('מסעדה'));
    expect(onSelect).toHaveBeenCalledWith('מסעדה');
  });
});
