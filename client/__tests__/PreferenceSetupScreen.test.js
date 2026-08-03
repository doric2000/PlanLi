import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import PreferenceSetupScreen from '../src/features/profile/screens/PreferenceSetupScreen';
import { getDoc } from 'firebase/firestore';

jest.mock('@expo/vector-icons', () => {
  const ReactModule = require('react');
  const MockIcon = (props) => <mock-icon {...props} />;
  return { Ionicons: MockIcon };
});

jest.mock('../src/config/firebase', () => ({
  auth: { currentUser: { uid: 'legacy-user' } },
  db: { kind: 'db' },
}));

jest.mock('firebase/firestore', () => ({
  doc: jest.fn(() => ({ kind: 'user-ref' })),
  getDoc: jest.fn(() => Promise.resolve({
    data: () => ({
      smartProfile: {
        setupRequired: false,
        interests: [
          'nature', 'museums', 'shopping', 'אוכל רחוב', 'טיול רגלי',
          'obsolete-1', 'obsolete-2', 'obsolete-3', 'obsolete-4',
        ],
        budget: '₪₪',
        travelStyleTag: 'זוגות',
      },
    }),
  })),
}));

jest.mock('../src/services/ProfileService', () => ({
  saveProfile: jest.fn(() => Promise.resolve()),
}));

describe('PreferenceSetupScreen', () => {
  it('does not let invisible legacy values consume visible selection slots', async () => {
    const screen = render(<PreferenceSetupScreen navigation={{ goBack: jest.fn(), reset: jest.fn() }} />);
    await waitFor(() => expect(getDoc).toHaveBeenCalledTimes(1));
    const selectable = await waitFor(
      () => screen.getByTestId('preference-interest-photography_viewpoints'),
      { timeout: 5_000 }
    );

    expect(selectable.props.accessibilityState.selected).toBe(false);
    fireEvent.press(selectable);
    expect(screen.getByTestId('preference-interest-photography_viewpoints').props.accessibilityState.selected).toBe(true);
  });
});
