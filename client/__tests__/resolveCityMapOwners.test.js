import { resolveCityMapOwners } from '../src/features/destination/utils/resolveCityMapOwners';
import { getDocs, where, limit } from 'firebase/firestore';
jest.mock('../src/config/firebase', () => ({ db: {} }));
jest.mock('firebase/firestore', () => ({ collection: jest.fn(), documentId: () => '__name__',
  query: jest.fn(), where: jest.fn(), limit: jest.fn(), getDocs: jest.fn() }));
beforeEach(() => jest.clearAllMocks());
test('bounds public reads, excludes unavailable previews and retains known owners', async () => {
  getDocs.mockResolvedValue({ docs: [{ id: '0', data: () => ({ ownerId: 'author' }) }] });
  const items = Array.from({ length: 31 }, (_, i) => ({ id: String(i) }));
  const result = await resolveCityMapOwners([...items, { id: 'known', ownerId: 'known-author' }]);
  expect(getDocs).toHaveBeenCalledTimes(2);
  expect(where).toHaveBeenCalledWith('status', '==', 'active');
  expect(where).toHaveBeenCalledWith('publicationGate.destinationApprovalVerified', '==', true);
  expect(limit).toHaveBeenCalledWith(30);
  expect(result).toEqual([{ id: '0', ownerId: 'author' }, { id: 'known', ownerId: 'known-author' }]);
});
test('does not convert failed owner resolution to an empty success', async () => {
  getDocs.mockRejectedValue(new Error('offline'));
  await expect(resolveCityMapOwners([{ id: 'one' }])).rejects.toThrow('offline');
});
