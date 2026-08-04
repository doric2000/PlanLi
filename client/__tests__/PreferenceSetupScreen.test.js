import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import PreferenceSetupScreen from '../src/features/profile/screens/PreferenceSetupScreen';
import { getDoc } from 'firebase/firestore';
import { Alert } from 'react-native';

const mockSaveProfile = jest.fn(() => Promise.resolve());

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
  saveProfile: (...args) => mockSaveProfile(...args),
}));

describe('PreferenceSetupScreen', () => {
  beforeEach(() => {
    mockSaveProfile.mockReset();
    mockSaveProfile.mockResolvedValue();
  });

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

  it('advances after saving a valid in-progress draft without strict read-back verification', async () => {
    getDoc.mockResolvedValueOnce({
      data: () => ({
        smartProfile: {
          setupRequired: true,
          interests: ['food', 'cafes', 'nature_scenery'],
        },
      }),
    });

    const screen = render(<PreferenceSetupScreen navigation={{ goBack: jest.fn(), reset: jest.fn() }} />);
    await waitFor(() => expect(screen.getByTestId('preference-budget-balanced')).toBeTruthy());

    fireEvent.press(screen.getByTestId('preference-budget-balanced'));
    fireEvent.press(screen.getByTestId('preference-party-solo'));
    fireEvent.press(screen.getByTestId('preference-next'));

    await waitFor(() => expect(screen.getByTestId('preference-review')).toBeTruthy());
    expect(mockSaveProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        smartProfile: expect.objectContaining({
          budget: 'balanced',
          travelParties: ['solo'],
        }),
      }),
      { completeSmartProfile: false, verifySmartProfile: false }
    );
  });

  it('does not leave setup when the server read-back reports dropped fields', async () => {
    getDoc.mockResolvedValueOnce({
      data: () => ({
        smartProfile: {
          setupRequired: true,
          interests: ['food', 'cafes', 'nature_scenery'],
          budget: 'balanced',
          travelParties: ['couple'],
        },
      }),
    });
    const error = new Error('השרת לא שמר את כל ההעדפות.');
    error.code = 'profile/persistence-mismatch';
    mockSaveProfile.mockRejectedValueOnce(error);
    const reset = jest.fn();
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    const screen = render(<PreferenceSetupScreen navigation={{ goBack: jest.fn(), reset }} />);
    await waitFor(() => expect(screen.getByTestId('preference-review')).toBeTruthy());
    fireEvent.press(screen.getByTestId('preference-next'));

    await waitFor(() => expect(alert).toHaveBeenCalledWith('לא הצלחנו לשמור', error.message));
    expect(reset).not.toHaveBeenCalled();
    alert.mockRestore();
  });
});
