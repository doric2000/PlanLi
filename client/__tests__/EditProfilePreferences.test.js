import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockSaveProfile = jest.fn();
const mockGetDoc = jest.fn();

jest.mock('@expo/vector-icons', () => {
  const ReactModule = require('react');
  const { View } = require('react-native');
  const MockIcon = (props) => ReactModule.createElement(View, props);
  return { Ionicons: MockIcon, MaterialIcons: MockIcon };
});

jest.mock('../src/config/firebase', () => ({
  auth: { currentUser: { uid: 'traveler-1' } },
  db: { kind: 'db' },
}));

jest.mock('firebase/firestore', () => ({
  doc: jest.fn(() => ({ kind: 'user-ref' })),
  getDoc: (...args) => mockGetDoc(...args),
}));

jest.mock('../src/services/ProfileService', () => ({
  saveProfile: (...args) => mockSaveProfile(...args),
}));

const { auth: mockedAuth } = require('../src/config/firebase');
const EditProfileScreen = require('../src/features/profile/screens/EditProfileScreen').default;

function navigation() {
  return {
    addListener: jest.fn(() => jest.fn()),
    dispatch: jest.fn(),
    goBack: jest.fn(),
    setOptions: jest.fn(),
  };
}

describe('EditProfileScreen travel preferences', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAuth.currentUser = { uid: 'traveler-1' };
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockGetDoc.mockResolvedValue({
      data: () => ({
        smartProfile: {
          interests: ['cafes', 'hiking'],
          budget: 'balanced',
          travelParties: ['couple'],
          needs: ['vegetarian'],
          vibe: ['relaxed'],
          travelerStyles: ['local'],
          pace: 'balanced',
        },
      }),
    });
    mockSaveProfile.mockResolvedValue({});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('normalizes legacy interests into the short V2 form and saves only the active answers', async () => {
    const screen = render(<EditProfileScreen navigation={navigation()} />);

    await waitFor(() => expect(screen.getByTestId('edit-preferences-save')).toBeTruthy());
    expect(screen.getByTestId('edit-interest-food').props.accessibilityState.checked).toBe(true);
    expect(screen.getByTestId('edit-interest-nature_scenery').props.accessibilityState.checked).toBe(true);
    expect(screen.queryByText('אווירה')).toBeNull();
    expect(screen.queryByText('סגנון טיול')).toBeNull();
    expect(screen.queryByText('קצב מועדף')).toBeNull();

    fireEvent.press(screen.getByTestId('edit-preferences-save'));

    await waitFor(() => expect(mockSaveProfile).toHaveBeenCalledWith({
      smartProfile: {
        interests: ['nature_scenery', 'food'],
        budget: 'balanced',
        travelParties: ['couple'],
        needs: ['vegetarian'],
        onboardingVersion: 2,
      },
    }, { completeSmartProfile: true }));
  });
});
