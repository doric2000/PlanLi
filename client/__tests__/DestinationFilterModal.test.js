import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import DestinationFilterModal from '../src/components/DestinationFilterModal';

jest.mock('@expo/vector-icons', () => {
  const ReactModule = require('react');
  const { Text } = require('react-native');
  return {
    Ionicons: ({ name }) => ReactModule.createElement(Text, { testID: `icon-${name}` }, name),
  };
});

describe('DestinationFilterModal saved-only option', () => {
  const baseProps = {
    visible: true,
    onClose: jest.fn(),
    savedOnly: false,
    onSavedOnlyChange: jest.fn(),
    favoritesAvailable: true,
  };

  beforeEach(() => jest.clearAllMocks());

  it('uses the same selectable row pattern and toggles the whole row', () => {
    const screen = render(<DestinationFilterModal {...baseProps} />);
    const option = screen.getByTestId('destination-saved-only-filter');

    expect(option.props.accessibilityRole).toBe('checkbox');
    expect(option.props.accessibilityState).toEqual({ checked: false, disabled: false });
    expect(screen.getByTestId('icon-bookmark-outline')).toBeTruthy();
    fireEvent.press(option);
    expect(baseProps.onSavedOnlyChange).toHaveBeenCalledWith(true);
  });

  it('shows the selected bookmark/check state', () => {
    const screen = render(<DestinationFilterModal {...baseProps} savedOnly />);
    expect(screen.getByTestId('icon-bookmark')).toBeTruthy();
    expect(screen.getByTestId('icon-checkmark-circle')).toBeTruthy();
    expect(screen.getByTestId('destination-saved-only-filter').props.accessibilityState.checked).toBe(true);
  });

  it('is disabled with a short sign-in explanation for guests', () => {
    const screen = render(<DestinationFilterModal {...baseProps} favoritesAvailable={false} />);
    const option = screen.getByTestId('destination-saved-only-filter');

    expect(option.props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText('יש להתחבר כדי לסנן לפי מועדפים')).toBeTruthy();
    fireEvent.press(option);
    expect(baseProps.onSavedOnlyChange).not.toHaveBeenCalled();
  });
});
