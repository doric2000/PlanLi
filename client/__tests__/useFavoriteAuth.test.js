import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useFavorite } from '../src/hooks/useFavorite';
import { setFavorite } from '../src/services/SocialService';

const mockEnsureCapability = jest.fn();

jest.mock('../src/features/auth/AuthContext', () => ({
  useAuth: () => ({
    user: { uid: 'user-1' },
    ensureCapability: mockEnsureCapability,
    handleCallableAuthError: jest.fn(() => false),
  }),
}));

jest.mock('../src/services/SocialService', () => ({
  setFavorite: jest.fn(),
}));

jest.mock('../src/config/firebase', () => ({ db: {} }));

jest.mock('firebase/firestore', () => ({
  doc: jest.fn(() => ({ path: 'users/user-1/favorites/key' })),
  onSnapshot: jest.fn((_reference, callback) => {
    callback({ exists: () => false });
    return jest.fn();
  }),
}));

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { BASE64: 'base64' },
  digestStringAsync: jest.fn(async () => 'ZmF2b3JpdGU='),
}));

describe('useFavorite authorization recovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setFavorite.mockResolvedValue({ saved: true });
  });

  it('checks the repaired capability before calling setFavorite', async () => {
    mockEnsureCapability.mockResolvedValue(true);
    const { result } = renderHook(() => useFavorite('recommendation', 'rec-1'));
    const initialToggle = result.current.toggleFavorite;
    await waitFor(() => expect(result.current.toggleFavorite).not.toBe(initialToggle));
    await act(async () => { await result.current.toggleFavorite(); });

    expect(mockEnsureCapability).toHaveBeenCalledTimes(1);
    expect(setFavorite).toHaveBeenCalledWith({ type: 'recommendation', id: 'rec-1' }, true);
    expect(mockEnsureCapability.mock.invocationCallOrder[0])
      .toBeLessThan(setFavorite.mock.invocationCallOrder[0]);
  });

  it('does not call setFavorite when the account remains incomplete', async () => {
    mockEnsureCapability.mockResolvedValue(false);
    const { result } = renderHook(() => useFavorite('recommendation', 'rec-1'));
    await act(async () => { await result.current.toggleFavorite(); });

    expect(setFavorite).not.toHaveBeenCalled();
  });
});
