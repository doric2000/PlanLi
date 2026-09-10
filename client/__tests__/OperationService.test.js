let mockSerial = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `operation-${++mockSerial}` }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: async () => '[]', setItem: async () => {},
}));
let service;
beforeEach(() => {
  jest.resetModules();
  service = require('../src/features/operations/operationService');
  service.setOperationPrincipal('alice');
});

test('an account change while persisting feedback prevents a write for the next account', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  jest.spyOn(service.operationStore, 'update').mockImplementation(() => gate);
  const save = jest.fn();
  const pending = service.trackOperation({ kind: 'comment' }, save);
  service.setOperationPrincipal('bob');
  release();
  await expect(pending).rejects.toMatchObject({ code: 'auth/unauthenticated' });
  expect(save).not.toHaveBeenCalled();
});

test('journal failure does not turn a successful business save into a failed save', async () => {
  jest.spyOn(service.operationStore, 'update').mockRejectedValue(new Error('disk full'));
  await expect(service.trackOperation({ kind: 'profile' }, async () => ({ saved: true })))
    .resolves.toEqual({ saved: true });
});

test('quiet successes disappear while their failures remain visible', async () => {
  await service.trackOperation({ kind: 'favorite', quiet: true }, async () => ({}));
  expect(service.operationStore.getSnapshot()).toEqual([]);
  await expect(service.trackOperation({ kind: 'favorite', quiet: true }, async () => {
    throw Object.assign(new Error('provider secret'), { code: 'functions/unavailable' });
  })).rejects.toThrow();
  expect(service.operationStore.getSnapshot()[0]).toMatchObject({ ownerUid: 'alice', status: 'failed', quiet: false });
  expect(JSON.stringify(service.operationStore.getSnapshot())).not.toContain('provider secret');
});

test('a missing confirmation stays uncertain without automatically replaying a mutation', async () => {
  const save = jest.fn(async () => { throw Object.assign(new Error(), { code: 'functions/deadline-exceeded' }); });
  await expect(service.trackOperation({ kind: 'trip' }, save)).rejects.toThrow();
  expect(save).toHaveBeenCalledTimes(1);
  expect(service.operationStore.getSnapshot()[0]).toMatchObject({ status: 'uncertain', ownerUid: 'alice' });
});
