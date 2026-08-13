import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import RtlChoiceGroup from '../src/components/RtlChoiceGroup';

describe('RtlChoiceGroup', () => {
  it('renders horizontal categories in RTL order and toggles a choice', () => {
    const onToggle = jest.fn();
    const { getByTestId } = render(
      <RtlChoiceGroup
        options={[{ id: 'one', label: 'ראשון' }, { id: 'two', label: 'שני' }]}
        selectedIds={['one']}
        onToggle={onToggle}
        layout="rail"
        testIDPrefix="rtl-choice"
      />
    );

    const rail = getByTestId('rtl-choice-rail');
    expect(rail.props.horizontal).toBe(true);
    expect(StyleSheet.flatten(rail.props.contentContainerStyle).flexDirection).toBe('row-reverse');
    fireEvent.press(getByTestId('rtl-choice-1'));
    expect(onToggle).toHaveBeenCalledWith('two');
  });

  it('disables additional choices after the maximum is reached', () => {
    const { getByTestId } = render(
      <RtlChoiceGroup
        options={['א', 'ב']}
        selectedIds={['א']}
        onToggle={jest.fn()}
        maxSelected={1}
        testIDPrefix="limited-choice"
      />
    );

    expect(getByTestId('limited-choice-1').props.accessibilityState.disabled).toBe(true);
  });
});
