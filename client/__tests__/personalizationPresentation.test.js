import React from 'react';
import { render } from '@testing-library/react-native';

import PreferenceContextLine from '../src/components/PreferenceContextLine';
import { getPersonalizationReasonPresentation } from '../src/constants/travelPresentation';

jest.mock('@expo/vector-icons', () => {
  const ReactModule = require('react');
  const { Text } = require('react-native');
  return {
    MaterialIcons: ({ name }) => ReactModule.createElement(Text, { testID: `reason-icon-${name}` }, name),
  };
});

describe('personalization reason presentation', () => {
  it.each([
    ['interest:nature_scenery', { label: 'טבע ונופים', icon: 'landscape' }],
    ['budget', { label: 'תקציב מועדף', icon: 'account-balance-wallet' }],
    ['party:couple', { label: 'זוג', icon: 'groups' }],
    ['style:backpacker', { label: 'תרמילאות', icon: 'explore' }],
  ])('maps %s to neutral copy and a semantic icon', (reasonCode, expected) => {
    expect(getPersonalizationReasonPresentation(reasonCode)).toEqual(expected);
  });

  it('renders the preference itself without generated matching copy', () => {
    const screen = render(<PreferenceContextLine reasonCode="interest:nature_scenery" />);

    expect(screen.getByText('טבע ונופים')).toBeTruthy();
    expect(screen.getByTestId('reason-icon-landscape')).toBeTruthy();
    expect(screen.queryByText(/מתאים ל/)).toBeNull();
  });

  it('hides unknown reasons cleanly', () => {
    const screen = render(<PreferenceContextLine reasonCode="unknown:value" />);
    expect(screen.queryByTestId('preference-context-line')).toBeNull();
  });
});
