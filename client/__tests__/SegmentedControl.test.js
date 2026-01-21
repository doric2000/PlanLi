import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import SegmentedControl from '../src/features/community/components/SegmentedControl';

/**
 * Simple unit test (no mocks).
 *
 * Goal:
 * - Make sure SegmentedControl renders options
 * - Make sure pressing an option calls onSelect(option)
 *
 * Note:
 * - We intentionally do NOT test styling here; this is a behavior test.
 */

describe('SegmentedControl (unit)', () => {
  it('renders options and calls onSelect when an option is pressed', () => {
    const onSelect = jest.fn();

    const { getByText } = render(
      <SegmentedControl
        label="תקציב"
        items={["₪", "₪₪", "₪₪₪"]}
        selectedValue=""
        onSelect={onSelect}
      />
    );

    // Label and options render
    expect(getByText('תקציב')).toBeTruthy();
    expect(getByText('₪')).toBeTruthy();
    expect(getByText('₪₪')).toBeTruthy();
    expect(getByText('₪₪₪')).toBeTruthy();

    // Pressing an option calls onSelect with the option value
    fireEvent.press(getByText('₪₪'));
    expect(onSelect).toHaveBeenCalledWith('₪₪');
  });

  it('works with a pre-selected value (still calls onSelect on press)', () => {
    const onSelect = jest.fn();

    const { getByText } = render(
      <SegmentedControl
        label="תקציב"
        items={["חינמי", "₪", "₪₪"]}
        selectedValue="₪"
        onSelect={onSelect}
      />
    );

    fireEvent.press(getByText('חינמי'));
    expect(onSelect).toHaveBeenCalledWith('חינמי');
  });
});
