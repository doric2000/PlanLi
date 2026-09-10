import { createOperationStore } from '../src/features/operations/createOperationStore';
import { OPERATION_HISTORY_KEY, pruneOperations, safeOperationError, selectBanner } from '../src/features/operations/operationModel';

const entry = (id, patch = {}) => ({ id, ownerUid: 'alice', kind: 'avatar', status: 'success',
  createdAt: 1000, updatedAt: 1000, acknowledged: false, ...patch });
const storage = (entries = []) => ({ getItem: jest.fn(async () => JSON.stringify(entries)), setItem: jest.fn(async () => {}) });

it('retains unseen success across restarts and removes payloads and provider errors from history', async () => {
  const disk = storage();
  const store = createOperationStore({ storage: disk });
  await store.update(entry('photo', { payload: { password: 'secret' }, error: new Error('raw provider'), token: 'secret' }));
  const serialized = disk.setItem.mock.calls.at(-1)[1];
  expect(serialized).not.toMatch(/secret|provider|payload/);
  const restarted = createOperationStore({ storage: { ...disk, getItem: async () => serialized } });
  await restarted.hydrate();
  expect(selectBanner(restarted.getSnapshot())).toMatchObject({ id: 'photo', status: 'success' });
});

it('gives multiple unseen completions visibility ahead of another upload', async () => {
  const store = createOperationStore({ storage: storage() });
  await store.update(entry('one'));
  await store.update(entry('two', { updatedAt: 1100 }));
  await store.update(entry('upload', { status: 'uploading', updatedAt: 1200 }));
  expect(selectBanner(store.getSnapshot()).id).toBe('one');
  await store.acknowledge('one', 'alice');
  expect(selectBanner(store.getSnapshot()).id).toBe('two');
  await store.acknowledge('two', 'alice');
  expect(selectBanner(store.getSnapshot()).id).toBe('upload');
});

it('marks interrupted ordinary saves uncertain without retrying them', async () => {
  const store = createOperationStore({ storage: storage([entry('comment', { source: 'action', status: 'saving' })]) });
  await store.hydrate();
  expect(store.getSnapshot()[0]).toMatchObject({ status: 'uncertain', acknowledged: false });
});

it('acknowledgement is scoped to the owner and does not erase a failed operation', async () => {
  const store = createOperationStore({ storage: storage([entry('same', { status: 'failed' })]) });
  await store.hydrate();
  await store.acknowledge('same', 'bob');
  expect(store.getSnapshot()[0].acknowledged).toBe(false);
  await store.clearResolved('alice');
  expect(store.getSnapshot()).toHaveLength(1);
});

it('preserves unresolved and unseen history while pruning old acknowledged successes', () => {
  const old = Date.now() - 40 * 86400000;
  expect(pruneOperations([
    entry('failed', { status: 'failed', updatedAt: old }),
    entry('unseen', { updatedAt: old }),
    entry('seen', { acknowledged: true, updatedAt: old }),
  ]).map((value) => value.id)).toEqual(['failed', 'unseen']);
});

it('reports persistence failures without removing the visible outcome', async () => {
  const disk = storage();
  disk.setItem.mockRejectedValue(new Error('disk full'));
  const store = createOperationStore({ storage: disk });
  await expect(store.update(entry('one'))).rejects.toThrow('disk full');
  expect(store.hasPersistenceError()).toBe(true);
  expect(store.getSnapshot()[0].status).toBe('success');
  disk.setItem.mockResolvedValue();
  await store.update(entry('two'));
  expect(store.hasPersistenceError()).toBe(false);
  expect(disk.setItem).toHaveBeenLastCalledWith(OPERATION_HISTORY_KEY, expect.any(String));
});

it('never displays raw provider messages and distinguishes missing confirmation', () => {
  expect(safeOperationError({ code: 'functions/deadline-exceeded', message: 'secret stack' })).toMatchObject({ uncertain: true });
  expect(safeOperationError({ message: 'secret stack' }).message).not.toContain('secret');
});
