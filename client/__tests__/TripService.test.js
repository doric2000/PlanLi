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

test('offline operations persist locally and flush without shifting their recorded revisions', async () => {
  await service.queueTripOperations({ tripId: 'trip-1', expectedRevision: 4, operations: [{ type: 'set_title', title: 'אופליין' }], id: 'offline-one' });
  await service.queueTripOperations({ tripId: 'trip-1', expectedRevision: 5, operations: [{ type: 'set_title', title: 'מחובר' }], id: 'offline-two' });
  mockCallable.mockResolvedValue({ data: { revision: 6 } });
  await expect(service.flushTripOperationQueue('trip-1')).resolves.toEqual({ applied: 2, remaining: 0 });
  expect(mockCallable.mock.calls.map(([, data]) => data.expectedRevision)).toEqual([4, 5]);
});

test('route availability errors explain that the plan itself is preserved', () => {
  expect(service.tripErrorMessage({ details: { reason: 'ROUTES_UNAVAILABLE' } })).toContain('העצירות נשמרו');
});

test('active trip quota errors explain how to make room', () => {
  expect(service.tripErrorMessage({ details: { reason: 'TRIP_LIMIT_REACHED' } })).toContain('50 טיולים');
});
