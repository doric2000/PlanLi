import { act, renderHook, waitFor } from '@testing-library/react-native';
import { getDoc } from 'firebase/firestore';
import { useRecommendationById } from '../src/hooks/useRecommendationById';

jest.mock('../src/config/firebase', () => ({ db: {} }));
jest.mock('firebase/firestore', () => ({ doc: jest.fn((db, collection, id) => id), getDoc: jest.fn() }));

test('a failed refresh removes stale data and a retry does not restore it', async () => {
  getDoc.mockResolvedValueOnce({ exists: () => true, id: 'rec-1', data: () => ({ title: 'old', status: 'active' }) });
  const { result } = renderHook(() => useRecommendationById('rec-1'));
  await waitFor(() => expect(result.current.resolved).toBe(true));
  expect(result.current.data.title).toBe('old');
  const error = new Error('permission-denied');
  getDoc.mockRejectedValueOnce(error);
  await act(async () => result.current.refresh());
  expect(result.current.data).toBeNull();
  expect(result.current.error).toBe(error);
  expect(result.current.resolved).toBe(true);
  getDoc.mockResolvedValueOnce({ exists: () => false });
  await act(async () => result.current.refresh());
  expect(result.current.data).toBeNull();
  expect(result.current.error).toBeNull();
});
