import { waitFor } from '@testing-library/react-native';

const mockCallable = jest.fn();
let mockSerial = 0;
let mockOperationSerial = 0;
const mockStorage = new Map();
jest.mock('firebase/functions', () => ({
  httpsCallable: (_functions, name) => (data) => mockCallable(name, data),
}));
jest.mock('../src/config/firebase', () => ({ cloudFunctions: {} }));
jest.mock('react-native-uuid', () => ({ v4: () => `uuid-${++mockSerial}` }));
jest.mock('expo-crypto', () => ({ randomUUID: () => `operation-${++mockOperationSerial}` }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: async (key) => mockStorage.get(key) || null,
  setItem: async (key, value) => { mockStorage.set(key, value); },
  removeItem: async (key) => { mockStorage.delete(key); },
}));

let service;
let operations;
beforeEach(() => {
  jest.resetModules();
  mockCallable.mockReset();
  mockStorage.clear();
  mockSerial = 0;
  mockOperationSerial = 0;
  operations = require('../src/features/operations/operationService');
  operations.setOperationPrincipal('alice');
  service = require('../src/services/TripService');
});

test('creating a private trip is tracked until the callable returns its target', async () => {
  let complete;
  mockCallable.mockImplementation(() => new Promise((resolve) => { complete = resolve; }));
  const pending = service.createPrivateTrip({ title: 'הטיול שלי' });
  await waitFor(() => expect(mockCallable).toHaveBeenCalledWith('createPrivateTrip', { title: 'הטיול שלי' }));
  expect(operations.operationStore.getSnapshot()[0]).toMatchObject({ kind: 'trip', ownerUid: 'alice', status: 'saving' });
  complete({ data: { tripId: 'trip-1', revision: 1 } });
  await expect(pending).resolves.toEqual({ tripId: 'trip-1', revision: 1 });
  expect(operations.operationStore.getSnapshot()[0]).toMatchObject({ status: 'success', targetId: 'trip-1' });
});

test('planner mutations include a stable operation id and expected revision', async () => {
  mockCallable.mockResolvedValue({ data: { tripId: 'trip-1', revision: 3 } });
  await service.applyPrivateTripOperations({
    tripId: 'trip-1', expectedRevision: 2,
    operations: [{ type: 'set_title', title: 'כותרת חדשה' }],
  });
  expect(mockCallable).toHaveBeenCalledWith('applyPrivateTripOperations', {
    tripId: 'trip-1', expectedRevision: 2, operationId: 'mutate:uuid-1',
    operations: [{ type: 'set_title', title: 'כותרת חדשה' }],
  });
});

test('offline operations persist locally and flush with the confirmed revision of the prior write', async () => {
  await service.queueTripOperations({ tripId: 'trip-1', expectedRevision: 4, operations: [{ type: 'set_title', title: 'אופליין' }], id: 'offline-one' });
  expect(await service.hasQueuedTripOperations('trip-1')).toBe(true);
  await service.queueTripOperations({ tripId: 'trip-1', expectedRevision: 5, operations: [{ type: 'set_title', title: 'מחובר' }], id: 'offline-two' });
  mockCallable.mockImplementation((_name, data) => Promise.resolve({ data: { revision: data.expectedRevision + 1 } }));
  await expect(service.flushTripOperationQueue('trip-1')).resolves.toEqual({ applied: 2, remaining: 0 });
  expect(await service.hasQueuedTripOperations('trip-1')).toBe(false);
  expect(mockCallable.mock.calls.map(([, data]) => data.expectedRevision)).toEqual([4, 5]);
});

test('offline replay rebases a pending idempotent operation after a remote revision change', async () => {
  await service.queueTripOperations({ tripId: 'trip-1', expectedRevision: 4, operations: [{ type: 'set_title', title: 'אופליין' }], id: 'offline-one' });
  mockCallable.mockImplementation((name, data) => {
    if (name === 'getPrivateTrip') return Promise.resolve({ data: { id: 'trip-1', revision: 8 } });
    if (data.expectedRevision === 4) return Promise.reject({ details: { reason: 'REVISION_CONFLICT' } });
    return Promise.resolve({ data: { revision: 9 } });
  });
  await expect(service.flushTripOperationQueue('trip-1')).resolves.toEqual({ applied: 1, remaining: 0 });
  expect(mockCallable.mock.calls.filter(([name]) => name === 'applyPrivateTripOperations').map(([, data]) => [data.expectedRevision, data.operationId])).toEqual([[4, 'offline-one'], [8, 'offline-one']]);
});

test('queued operations are idempotent locally and malformed storage is never silently cleared', async () => {
  const input = { tripId: 'trip-1', expectedRevision: 4, operations: [{ type: 'set_title', title: 'אופליין' }], id: 'same-id' };
  await service.queueTripOperations(input);
  await service.queueTripOperations(input);
  expect(JSON.parse(mockStorage.get('planli:trip-planner:queue:trip-1'))).toHaveLength(1);
  mockStorage.set('planli:trip-planner:queue:trip-1', 'not-json');
  expect(await service.hasQueuedTripOperations('trip-1')).toBe(true);
  await expect(service.flushTripOperationQueue('trip-1')).resolves.toEqual({ applied: 0, remaining: 1, conflict: true });
  expect(mockStorage.get('planli:trip-planner:queue:trip-1')).toBe('not-json');
  await expect(service.queueTripOperations(input)).rejects.toThrow('Stored trip operations');
});

test('route availability errors explain that the plan itself is preserved', () => {
  expect(service.tripErrorMessage({ details: { reason: 'ROUTES_UNAVAILABLE' } })).toContain('העצירות נשמרו');
});

test('active trip quota errors explain how to make room', () => {
  expect(service.tripErrorMessage({ details: { reason: 'TRIP_LIMIT_REACHED' } })).toContain('50 טיולים');
});
