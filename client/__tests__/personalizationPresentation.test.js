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

  it('explains declared and learned reasons in plain Hebrew without exposing scores', () => {
    expect(getPersonalizationReasonPresentation({
      code: 'declared_interest', value: 'food',
    })).toEqual(expect.objectContaining({
      label: 'כי בחרת בתחום אוכל וקולינריה',
      icon: 'restaurant',
    }));
    const learned = getPersonalizationReasonPresentation({
      code: 'learned_interest', value: 'food', evidence: { favorites: 1 },
    });
    expect(learned.label).toBe('כי שמרת מקומות דומים');
    expect(JSON.stringify(learned)).not.toMatch(/score|ציון/iu);
    expect(getPersonalizationReasonPresentation({
      code: 'learned_interest', value: 'food',
    }).label).toBe('כי הפעילות שלך במקומות דומים');
    expect(getPersonalizationReasonPresentation({
      code: 'learned_interest', value: 'food', evidence: { source: 'meaningful_view' },
    }).label).toBe('כי צפית במקומות דומים');
  });
});

jest.mock('../src/features/profile/context/PersonalizationFeedbackContext', () => ({
  usePersonalizationFeedback: () => ({ hide: jest.fn(), isHidden: () => false }),
}));
