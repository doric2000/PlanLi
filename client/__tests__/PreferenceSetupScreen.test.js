import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { getDoc } from 'firebase/firestore';

import PreferenceSetupScreen from '../src/features/profile/screens/PreferenceSetupScreen';

const mockSaveProfile = jest.fn();
const mockSaveStatus = jest.fn();
const mockSynchronizeUserDocument = jest.fn();
const mockLoadGuestProfile = jest.fn();
const mockSaveGuestProfile = jest.fn();
const mockGetPersonalizedRecommendations = jest.fn();
let mockHiddenRecommendationIds = new Set();

jest.mock('../src/features/auth/AuthContext', () => ({
  useAuth: () => ({ synchronizeUserDocument: mockSynchronizeUserDocument }),
}));

jest.mock('../src/features/profile/context/PersonalizationFeedbackContext', () => ({
  usePersonalizationFeedback: () => ({
    hide: jest.fn(),
    isHidden: (target) => mockHiddenRecommendationIds.has(target?.id),
  }),
}));

jest.mock('@expo/vector-icons', () => {
  const ReactModule = require('react');
  const MockIcon = (props) => <mock-icon {...props} />;
  return { Ionicons: MockIcon, MaterialIcons: MockIcon };
});

jest.mock('../src/components/CachedImage', () => {
  const ReactModule = require('react');
  const { View } = require('react-native');
  return (props) => <View {...props} />;
});

jest.mock('../src/config/firebase', () => ({
  auth: { currentUser: { uid: 'traveler-1' } },
  db: { kind: 'db' },
}));

jest.mock('firebase/firestore', () => ({
  doc: jest.fn(() => ({ kind: 'user-ref' })),
  getDoc: jest.fn(),
}));

jest.mock('../src/services/PersonalizationService', () => ({
  clearPersonalizationDiscoveryCache: jest.fn(),
  getPersonalizedRecommendations: (...args) => mockGetPersonalizedRecommendations(...args),
}));

jest.mock('../src/services/ProfileService', () => ({
  saveProfile: (...args) => mockSaveProfile(...args),
  saveNoyaOnboardingStatus: (...args) => mockSaveStatus(...args),
}));

jest.mock('../src/features/profile/services/NoyaOnboardingStorage', () => ({
  NOYA_ONBOARDING_VERSION: 2,
  clearGuestNoyaProfile: jest.fn(() => Promise.resolve()),
  dismissGuestNoya: jest.fn(() => Promise.resolve()),
  loadGuestNoyaProfile: (...args) => mockLoadGuestProfile(...args),
  markNoyaAccountHandled: jest.fn(),
  saveGuestNoyaProfile: (...args) => mockSaveGuestProfile(...args),
}));

function navigation() {
  return { canGoBack: () => false, goBack: jest.fn(), navigate: jest.fn(), reset: jest.fn() };
}

describe('PreferenceSetupScreen V2', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLoadGuestProfile.mockResolvedValue(null);
    mockSaveStatus.mockResolvedValue({});
    mockGetPersonalizedRecommendations.mockReset();
    mockGetPersonalizedRecommendations.mockResolvedValue({ items: [] });
    mockHiddenRecommendationIds = new Set();
    getDoc.mockResolvedValue({ data: () => ({ smartProfile: { setupRequired: true } }) });
    mockSaveProfile.mockResolvedValue({
      userDocument: {
        smartProfile: { setupRequired: false, completedAt: { seconds: 1 }, onboardingVersion: 2 },
      },
    });
  });

  it('opens with Noa and keeps the flow optional', async () => {
    const nav = navigation();
    const screen = render(<PreferenceSetupScreen navigation={nav} route={{ params: { source: 'new-account' } }} />);
    await waitFor(() => expect(screen.getByTestId('noya-welcome-screen')).toBeTruthy());
    expect(screen.getByText('נעים להכיר')).toBeTruthy();
    fireEvent.press(screen.getByTestId('noya-later'));
    expect(nav.reset).toHaveBeenCalledWith({ index: 0, routes: [{ name: 'Main' }] });
    expect(mockSaveStatus).toHaveBeenCalledWith('dismissed', 2);
  });

  it('requires two interests and permits no more than four', async () => {
    const screen = render(<PreferenceSetupScreen navigation={navigation()} />);
    await waitFor(() => expect(screen.getByTestId('noya-start')).toBeTruthy());
    fireEvent.press(screen.getByTestId('noya-start'));
    expect(screen.getByTestId('noya-next').props.accessibilityState.disabled).toBe(true);
    fireEvent.press(screen.getByTestId('noya-interest-food'));
    fireEvent.press(screen.getByTestId('noya-interest-nature_scenery'));
    expect(screen.getByTestId('noya-next').props.accessibilityState.disabled).toBe(false);
    fireEvent.press(screen.getByTestId('noya-interest-beaches_water'));
    fireEvent.press(screen.getByTestId('noya-interest-culture_history'));
    fireEvent.press(screen.getByTestId('noya-interest-wellness'));
    expect(screen.getByText('4 נבחרו')).toBeTruthy();
  });

  it('saves the three core answers and optional needs as onboarding version 2', async () => {
    const screen = render(<PreferenceSetupScreen navigation={navigation()} />);
    await waitFor(() => expect(screen.getByTestId('noya-start')).toBeTruthy());
    fireEvent.press(screen.getByTestId('noya-start'));
    fireEvent.press(screen.getByTestId('noya-interest-food'));
    fireEvent.press(screen.getByTestId('noya-interest-nature_scenery'));
    fireEvent.press(screen.getByTestId('noya-next'));
    fireEvent.press(screen.getByTestId('noya-budget-balanced'));
    fireEvent.press(screen.getByTestId('noya-next'));
    fireEvent.press(screen.getByTestId('noya-party-couple'));
    fireEvent.press(screen.getByTestId('noya-needs-toggle'));
    fireEvent.press(screen.getByTestId('noya-need-vegetarian'));
    fireEvent.press(screen.getByTestId('noya-next'));

    await waitFor(() => expect(mockSaveProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        smartProfile: expect.objectContaining({
          interests: ['food', 'nature_scenery'],
          budget: 'balanced',
          travelParties: ['couple'],
          needs: ['vegetarian'],
          onboardingVersion: 2,
        }),
        noyaOnboarding: { version: 2, status: 'completed' },
      }),
      { completeSmartProfile: true, verifySmartProfile: true }
    ));
    expect(screen.getByTestId('noya-complete-screen')).toBeTruthy();
  });

  it('removes a hidden recommendation from the completion preview immediately', async () => {
    mockGetPersonalizedRecommendations.mockResolvedValue({
      items: [{
        id: 'preview-1',
        title: 'המלצה לבדיקה',
        personalization: { reasons: [{ code: 'declared_interest', value: 'food' }] },
      }],
    });
    const props = { navigation: navigation() };
    const screen = render(<PreferenceSetupScreen {...props} />);
    await waitFor(() => expect(screen.getByTestId('noya-start')).toBeTruthy());
    fireEvent.press(screen.getByTestId('noya-start'));
    fireEvent.press(screen.getByTestId('noya-interest-food'));
    fireEvent.press(screen.getByTestId('noya-interest-nature_scenery'));
    fireEvent.press(screen.getByTestId('noya-next'));
    fireEvent.press(screen.getByTestId('noya-budget-balanced'));
    fireEvent.press(screen.getByTestId('noya-next'));
    fireEvent.press(screen.getByTestId('noya-party-couple'));
    fireEvent.press(screen.getByTestId('noya-next'));
    await waitFor(() => expect(screen.getByText('המלצה לבדיקה')).toBeTruthy());

    mockHiddenRecommendationIds = new Set(['preview-1']);
    screen.rerender(<PreferenceSetupScreen {...props} />);

    expect(screen.queryByText('המלצה לבדיקה')).toBeNull();
  });
});
