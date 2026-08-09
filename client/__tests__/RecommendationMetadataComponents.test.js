import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';

import MetadataLine from '../src/components/MetadataLine';
import UsefulFactItem from '../src/components/UsefulFactItem';

jest.mock('@expo/vector-icons', () => {
  const ReactModule = require('react');
  const { Text } = require('react-native');
  const Icon = ({ name }) => ReactModule.createElement(Text, { testID: `icon-${name}` }, name);
  return { MaterialIcons: Icon };
});

describe('recommendation metadata presentation', () => {
  it('renders read-only metadata as text without button affordances', () => {
    const screen = render(
      <MetadataLine
        icon="local-offer"
        values={['מלון', 'לינה ואירוח']}
        testID="metadata-line"
      />
    );

    const line = screen.getByTestId('metadata-line');
    const style = StyleSheet.flatten(line.props.style);
    expect(line.props.accessibilityRole).toBeUndefined();
    expect(line.props.onPress).toBeUndefined();
    expect(line.props.accessibilityLabel).toBe('מלון · לינה ואירוח');
    expect(style.backgroundColor).toBeUndefined();
    expect(style.borderWidth).toBeUndefined();
  });

  it('renders a useful fact as an open semantic block', () => {
    const screen = render(
      <UsefulFactItem
        icon="account-balance-wallet"
        title="רמת מחיר"
        value="₪₪"
        testID="useful-fact"
      />
    );

    const fact = screen.getByTestId('useful-fact');
    const style = StyleSheet.flatten(fact.props.style);
    expect(fact.props.accessibilityLabel).toBe('רמת מחיר: ₪₪');
    expect(style.backgroundColor).toBeUndefined();
    expect(style.borderWidth).toBeUndefined();
    expect(screen.getByText('רמת מחיר')).toBeTruthy();
    expect(screen.getByText('₪₪')).toBeTruthy();
  });
});
