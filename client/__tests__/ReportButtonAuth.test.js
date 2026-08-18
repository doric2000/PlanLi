import React from 'react';
import { render } from '@testing-library/react-native';

import ReportButton from '../src/features/moderation/components/ReportButton';
import { useAuth } from '../src/features/auth/AuthContext';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

jest.mock('../src/features/auth/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../src/services/SocialService', () => ({
  setBlockedUser: jest.fn(),
  submitReport: jest.fn(),
}));

describe('ReportButton authorization boundary', () => {
  const authValue = (overrides = {}) => ({
    user: null,
    isActive: false,
    requireCapability: jest.fn(() => false),
    handleCallableAuthError: jest.fn(() => false),
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    ['guest', authValue()],
    ['unverified account', authValue({
      user: { uid: 'unverified-user' },
    })],
  ])('does not expose reporting to a %s', (_label, value) => {
    useAuth.mockReturnValue(value);
    const screen = render(
      <ReportButton
        target={{ type: 'recommendation', id: 'rec-1' }}
        ownerId="owner-1"
      />
    );

    expect(screen.queryByLabelText('דיווח על תוכן')).toBeNull();
  });

  it('keeps reporting available to an active non-owner', () => {
    useAuth.mockReturnValue(authValue({
      user: { uid: 'active-user' },
      isActive: true,
      requireCapability: jest.fn(() => true),
    }));
    const screen = render(
      <ReportButton
        target={{ type: 'recommendation', id: 'rec-1' }}
        ownerId="owner-1"
      />
    );

    expect(screen.getByLabelText('דיווח על תוכן')).toBeTruthy();
  });
});
