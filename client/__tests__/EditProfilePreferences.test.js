import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

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

    await act(async () => {});
    await waitFor(() => expect(screen.getByTestId('edit-preferences-save')).toBeTruthy());
    expect(screen.getByTestId('edit-interest-food').props.accessibilityState.checked).toBe(true);
    expect(screen.getByTestId('edit-interest-nature_scenery').props.accessibilityState.checked).toBe(true);
    expect(screen.queryByText('אווירה')).toBeNull();
    expect(screen.queryByText('סגנון טיול')).toBeNull();
    expect(screen.queryByText('קצב מועדף')).toBeNull();

    fireEvent.press(screen.getByTestId('edit-preferences-save'));

    await act(async () => {});
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
  it('keeps the header back action and cancelled discard on the current edited page', async () => {
    const nav = navigation();
    const s = render(<EditProfileScreen navigation={nav} />);
    await act(async () => {});
    await waitFor(() => expect(s.getByTestId('edit-preferences-save')).toBeTruthy());
    fireEvent.press(s.getByTestId('edit-budget-economy'));
    act(() => nav.setOptions.mock.calls.at(-1)[0].headerRight().props.onPress());
    expect(s.getByTestId('edit-profile-unsaved-modal')).toBeTruthy();
    fireEvent.press(s.getByTestId('edit-profile-unsaved-cancel'));
    expect(nav.goBack).not.toHaveBeenCalled();
    expect(s.getByTestId('edit-budget-economy').props.accessibilityState.checked).toBe(true);
    act(() => nav.setOptions.mock.calls.at(-1)[0].headerRight().props.onPress());
    fireEvent.press(s.getByTestId('edit-profile-unsaved-confirm'));
    expect(nav.goBack).toHaveBeenCalledTimes(1);
  });

  it('guards a swipe-back POP, supports cancellation and dispatches the original action after confirmation', async () => {
    const nav = navigation();
    const s = render(<EditProfileScreen navigation={nav} />);
    await act(async () => {});
    await waitFor(() => expect(s.getByTestId('edit-preferences-save')).toBeTruthy());
    fireEvent.press(s.getByTestId('edit-budget-economy'));
    const beforeRemove = nav.addListener.mock.calls.find(([name]) => name === 'beforeRemove')[1];
    const action = { type: 'POP', payload: { count: 1 }, source: 'edit-profile' };
    const event = { preventDefault: jest.fn(), data: { action } };
    act(() => beforeRemove(event));
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    fireEvent.press(s.getByTestId('edit-profile-unsaved-cancel'));
    expect(nav.dispatch).not.toHaveBeenCalled();
    expect(s.queryByTestId('edit-profile-unsaved-modal')).toBeNull();
    act(() => beforeRemove(event));
    fireEvent.press(s.getByTestId('edit-profile-unsaved-confirm'));
    expect(nav.dispatch).toHaveBeenCalledWith(action);
  });

});
