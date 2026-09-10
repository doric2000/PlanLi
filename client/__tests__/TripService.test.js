import { waitFor } from '@testing-library/react-native';

const mockCallable = jest.fn();
let mockSerial = 0;
jest.mock('firebase/functions', () => ({ httpsCallable: () => mockCallable }));
jest.mock('../src/config/firebase', () => ({ cloudFunctions: {} }));
jest.mock('expo-crypto', () => ({ randomUUID: () => `trip-operation-${++mockSerial}` }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: async () => '[]', setItem: async () => {},
}));

let saveTrip;
let operations;
beforeEach(() => {
  jest.resetModules();
  mockCallable.mockReset();
  operations = require('../src/features/operations/operationService');
  operations.setOperationPrincipal('alice');
  ({ saveTrip } = require('../src/services/TripService'));
});

test('a trip remains pending until the server confirms it, then links its saved result', async () => {
  let complete;
  mockCallable.mockImplementation(() => new Promise((resolve) => { complete = resolve; }));
  const trip = { title: 'Private travel plans' };
  const pending = saveTrip(trip);
  await waitFor(() => expect(mockCallable).toHaveBeenCalledWith({ trip }));
  expect(operations.operationStore.getSnapshot()[0]).toMatchObject({
    kind: 'trip', ownerUid: 'alice', status: 'saving',
  });
  complete({ data: { tripId: 'trip-1', saved: true } });
  await expect(pending).resolves.toEqual({ tripId: 'trip-1', saved: true });
  expect(operations.operationStore.getSnapshot()[0]).toMatchObject({ status: 'success', targetId: 'trip-1' });
  expect(JSON.stringify(operations.operationStore.getSnapshot())).not.toContain(trip.title);
});

test('an edit preserves its existing target when the server returns no new ID', async () => {
  mockCallable.mockResolvedValue({ data: { saved: true } });
  await saveTrip({ title: 'Updated trip' }, 'existing-trip');
  expect(mockCallable).toHaveBeenCalledWith({ tripId: 'existing-trip', trip: { title: 'Updated trip' } });
  expect(operations.operationStore.getSnapshot()[0]).toMatchObject({ status: 'success', targetId: 'existing-trip' });
});

test('a lost trip-save response stays uncertain without a duplicate save or raw error in history', async () => {
  const error = Object.assign(new Error('Private provider details'), { code: 'functions/deadline-exceeded' });
  mockCallable.mockRejectedValue(error);
  await expect(saveTrip({ title: 'Trip' })).rejects.toBe(error);
  expect(mockCallable).toHaveBeenCalledTimes(1);
  expect(operations.operationStore.getSnapshot()[0]).toMatchObject({ kind: 'trip', status: 'uncertain' });
  expect(JSON.stringify(operations.operationStore.getSnapshot())).not.toContain(error.message);
});
