import { waitFor } from '@testing-library/react-native';

const mockCallable = jest.fn();
let mockSerial = 0;
let mockOperationSerial = 0;
const mockStorage = new Map();
const mockGetItem = jest.fn(async (key) => mockStorage.get(key) || null);
const mockSetItem = jest.fn(async (key, value) => { mockStorage.set(key, value); });
const mockRemoveItem = jest.fn(async (key) => { mockStorage.delete(key); });
jest.mock('firebase/functions', () => ({
  httpsCallable: (_functions, name) => (data) => mockCallable(name, data),
}));
jest.mock('../src/config/firebase', () => ({ cloudFunctions: {} }));
jest.mock('react-native-uuid', () => ({ v4: () => `uuid-${++mockSerial}` }));
jest.mock('expo-crypto', () => ({ randomUUID: () => `operation-${++mockOperationSerial}` }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: (...args) => mockGetItem(...args),
  setItem: (...args) => mockSetItem(...args),
  removeItem: (...args) => mockRemoveItem(...args),
}));

let service;
let operations;
beforeEach(() => {
  jest.resetModules();
  mockCallable.mockReset();
  mockStorage.clear();
  mockGetItem.mockClear();
  mockSetItem.mockReset().mockImplementation(async (key, value) => { mockStorage.set(key, value); });
  mockRemoveItem.mockReset().mockImplementation(async (key) => { mockStorage.delete(key); });
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

test('a local cache write failure never hides a trip that loaded from the server', async () => {
  const trip = { id: 'trip-1', revision: 3, days: [] };
  mockCallable.mockResolvedValue({ data: trip });
  mockSetItem.mockRejectedValueOnce(new Error('storage full'));
  await expect(service.getPrivateTrip('trip-1')).resolves.toEqual(trip);
  expect(mockCallable).toHaveBeenCalledWith('getPrivateTrip', { tripId: 'trip-1' });
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
  await expect(service.flushTripOperationQueue('trip-1')).resolves.toEqual({ applied: 0, remaining: 1, corrupt: true });
  expect(mockStorage.get('planli:trip-planner:queue:trip-1')).toBe('not-json');
  await expect(service.queueTripOperations(input)).rejects.toMatchObject({ code: 'trip/local-queue-corrupt' });
  expect(service.isCorruptTripQueueError({ code: 'trip/local-queue-corrupt' })).toBe(true);
  mockStorage.set('planli:trip-planner:queue:trip-1', '[null]');
  await expect(service.flushTripOperationQueue('trip-1')).resolves.toEqual({ applied: 0, remaining: 1, corrupt: true });
});

test('a corrupt queue is backed up before it is removed from the active queue', async () => {
  mockStorage.set('planli:trip-planner:queue:trip-1', 'not-json');
  mockStorage.set('planli:trip-planner:cache:trip-1', '{"id":"trip-1","revision":2}');
  await expect(service.quarantineTripOperationQueue('trip-1')).resolves.toEqual({ quarantined: true });
  expect(mockStorage.has('planli:trip-planner:queue:trip-1')).toBe(false);
  expect(mockStorage.has('planli:trip-planner:cache:trip-1')).toBe(false);
  const backup = JSON.parse(mockStorage.get('planli:trip-planner:queue-quarantine:trip-1'));
  expect(backup).toMatchObject({ version: 1, tripId: 'trip-1', raw: 'not-json' });
  expect(Number.isFinite(backup.quarantinedAt)).toBe(true);
});

test('a failed corrupt queue backup leaves the active queue untouched', async () => {
  mockStorage.set('planli:trip-planner:queue:trip-1', 'not-json');
  mockSetItem.mockRejectedValueOnce(new Error('storage full'));
  await expect(service.quarantineTripOperationQueue('trip-1')).rejects.toThrow('storage full');
  expect(mockStorage.get('planli:trip-planner:queue:trip-1')).toBe('not-json');
  expect(mockRemoveItem).not.toHaveBeenCalled();
});

test('a failed cache discard keeps the active corrupt queue available for another recovery attempt', async () => {
  mockStorage.set('planli:trip-planner:queue:trip-1', 'not-json');
  mockStorage.set('planli:trip-planner:cache:trip-1', '{"id":"trip-1","revision":2}');
  mockRemoveItem.mockRejectedValueOnce(new Error('storage unavailable'));
  await expect(service.quarantineTripOperationQueue('trip-1')).rejects.toThrow('storage unavailable');
  expect(mockStorage.get('planli:trip-planner:queue:trip-1')).toBe('not-json');
  expect(mockStorage.has('planli:trip-planner:cache:trip-1')).toBe(true);
  expect(mockStorage.has('planli:trip-planner:queue-quarantine:trip-1')).toBe(true);
});

test('route availability errors explain that the plan itself is preserved', () => {
  expect(service.tripErrorMessage({ details: { reason: 'ROUTES_UNAVAILABLE' } })).toContain('העצירות נשמרו');
});

test('active trip quota errors explain how to make room', () => {
  expect(service.tripErrorMessage({ details: { reason: 'TRIP_LIMIT_REACHED' } })).toContain('50 טיולים');
});

describe('shared-link read recovery', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test.each(['functions/internal', 'functions/unavailable', 'functions/deadline-exceeded'])(
    'recovers one transient %s failure without requiring a manual retry', async (code) => {
      const trip = { id: 'shared', days: [] };
      mockCallable.mockRejectedValueOnce({ code }).mockResolvedValueOnce({ data: trip });
      const pending = service.getSharedTrip('share-token');
      await jest.advanceTimersByTimeAsync(499);
      expect(mockCallable).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(1);
      await expect(pending).resolves.toEqual(trip);
      expect(mockCallable.mock.calls).toEqual([
        ['getSharedTrip', { token: 'share-token' }], ['getSharedTrip', { token: 'share-token' }],
      ]);
    },
  );

  test('stops after the second transient failure', async () => {
    const error = { code: 'functions/unavailable' };
    mockCallable.mockRejectedValue(error);
    const pending = expect(service.getSharedTrip('share-token')).rejects.toBe(error);
    await jest.advanceTimersByTimeAsync(500);
    await pending;
    expect(mockCallable).toHaveBeenCalledTimes(2);
  });

  test.each([
    { code: 'functions/not-found', details: { reason: 'SHARE_NOT_AVAILABLE' } },
    { code: 'functions/invalid-argument', details: { reason: 'INVALID_SHARE_TOKEN' } },
    { code: 'functions/permission-denied' },
    { code: 'functions/unauthenticated' },
    { code: 'functions/resource-exhausted' },
    { code: 'functions/internal', details: { reason: 'BUSINESS_FAILURE' } },
  ])('does not retry definitive failures: %j', async (error) => {
    mockCallable.mockRejectedValue(error);
    await expect(service.getSharedTrip('share-token')).rejects.toBe(error);
    await jest.runAllTimersAsync();
    expect(mockCallable).toHaveBeenCalledTimes(1);
  });

  test('never retries the copy mutation after a transient failure', async () => {
    mockCallable.mockRejectedValue({ code: 'functions/unavailable' });
    await expect(service.copySharedTrip('share-token')).rejects.toMatchObject({ code: 'functions/unavailable' });
    await jest.runOnlyPendingTimersAsync();
    expect(mockCallable).toHaveBeenCalledTimes(1);
  });

  test('read errors do not claim that local changes were saved or that a valid link expired', () => {
    expect(service.sharedTripErrorMessage({ details: { reason: 'SHARE_NOT_AVAILABLE' } })).toBe('הקישור אינו זמין יותר.');
    expect(service.sharedTripErrorMessage({ code: 'functions/unavailable' })).toBe('לא הצלחנו להתחבר כרגע. בדקו את החיבור ונסו שוב.');
    expect(service.sharedTripErrorMessage(new Error('unknown'))).toBe('לא הצלחנו לטעון את הטיול כרגע. נסו שוב.');
  });
});
