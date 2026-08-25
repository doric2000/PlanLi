import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';

import GuestPersonalizationBridge from '../src/features/profile/components/GuestPersonalizationBridge';

const mockMerge = jest.fn(() => Promise.resolve({ merged: 2 }));
let mockAuthState = { status: 'ready', user: { uid: 'user-1' } };

jest.mock('../src/features/auth/AuthContext', () => ({
  useAuth: () => mockAuthState,
}));

jest.mock('../src/services/PersonalizationService', () => ({
  mergePendingGuestPersonalization: (...args) => mockMerge(...args),
}));

beforeEach(() => {
  mockMerge.mockReset();
  mockMerge.mockResolvedValue({ merged: 2 });
  mockAuthState = { status: 'ready', user: { uid: 'user-1' } };
});

test('merges pending guest learning once when the account becomes ready', async () => {
  const screen = render(<GuestPersonalizationBridge />);
  await waitFor(() => expect(mockMerge).toHaveBeenCalledTimes(1));
  screen.rerender(<GuestPersonalizationBridge />);
  expect(mockMerge).toHaveBeenCalledTimes(1);

  mockAuthState = { status: 'signed_out', user: null };
  screen.rerender(<GuestPersonalizationBridge />);
  mockAuthState = { status: 'ready', user: { uid: 'user-1' } };
  screen.rerender(<GuestPersonalizationBridge />);
  await waitFor(() => expect(mockMerge).toHaveBeenCalledTimes(2));
});

test('retries a transient merge failure while the same account remains ready', async () => {
  jest.useFakeTimers();
  mockMerge.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ merged: 2 });
  const screen = render(<GuestPersonalizationBridge />);
  await act(async () => { await Promise.resolve(); });
  expect(mockMerge).toHaveBeenCalledTimes(1);

  await act(async () => {
    jest.advanceTimersByTime(1_000);
    await Promise.resolve();
  });

  expect(mockMerge).toHaveBeenCalledTimes(2);
  screen.unmount();
  jest.useRealTimers();
});
