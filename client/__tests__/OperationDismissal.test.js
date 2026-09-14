import { createOperationStore } from '../src/features/operations/createOperationStore';
import { selectBanner } from '../src/features/operations/operationModel';

const entry = (patch = {}) => ({ id: 'one', ownerUid: 'alice', kind: 'avatar', source: 'avatar', status: 'failed', ...patch });
function storage(initial = []) {
  let saved = JSON.stringify(initial);
  return { getItem: jest.fn(async () => saved), setItem: jest.fn(async (_key, value) => { saved = value; }) };
}

test('dismissal survives restart, recovery stages and stale flags, while a different outcome appears', async () => {
  const disk = storage();
  const store = createOperationStore({ storage: disk });
  await store.update(entry());
  await store.dismiss('one', 'alice');
  const restarted = createOperationStore({ storage: disk });
  await restarted.hydrate();
  expect(selectBanner(restarted.getSnapshot())).toBeNull();
  for (const status of ['queued', 'processing', 'failed']) {
    await restarted.update(entry({ status, dismissed: false, acknowledged: false }));
    expect(selectBanner(restarted.getSnapshot())).toBeNull();
  }
  await restarted.update(entry({ status: 'success' }));
  expect(selectBanner(restarted.getSnapshot())).toMatchObject({ status: 'success' });
});

test('slow persistence keeps the banner visible and cannot overwrite a concurrent new result', async () => {
  const disk = storage();
  const store = createOperationStore({ storage: disk });
  await store.update(entry());
  let release;
  disk.setItem.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
  const closing = store.dismiss('one', 'alice');
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(selectBanner(store.getSnapshot()).status).toBe('failed');
  const result = store.update(entry({ status: 'success' }));
  release();
  await Promise.all([closing, result]);
  expect(selectBanner(store.getSnapshot()).status).toBe('success');
  const restored = createOperationStore({ storage: disk });
  await restored.hydrate();
  expect(selectBanner(restored.getSnapshot()).status).toBe('success');
});

test('failed dismissal stays visible and can be retried without rerunning the operation', async () => {
  const disk = storage();
  const store = createOperationStore({ storage: disk });
  await store.update(entry());
  disk.setItem.mockRejectedValueOnce(new Error('disk full'));
  await expect(store.dismiss('one', 'alice')).rejects.toThrow('disk full');
  expect(selectBanner(store.getSnapshot()).id).toBe('one');
  await store.dismiss('one', 'alice');
  expect(selectBanner(store.getSnapshot())).toBeNull();
  const restored = createOperationStore({ storage: disk });
  await restored.hydrate();
  expect(selectBanner(restored.getSnapshot())).toBeNull();
});

test('dismissal identifies owner, operation and explicit attempt, never message text', async () => {
  const store = createOperationStore({ storage: storage() });
  await store.update(entry({ message: 'same' }));
  await store.update(entry({ id: 'two', message: 'same' }));
  await store.dismiss('one', 'bob');
  expect(store.getSnapshot().find((e) => e.id === 'one').dismissed).toBe(false);
  await store.dismiss('one', 'alice');
  expect(selectBanner(store.getSnapshot()).id).toBe('two');
  await store.dismiss('two', 'alice');
  await store.update(entry({ status: 'queued', attempt: 2 }));
  await store.update(entry({ attempt: 2 }));
  await store.dismiss('one', 'alice', { status: 'failed', attempt: 1 });
  expect(selectBanner(store.getSnapshot())).toMatchObject({ id: 'one', attempt: 2 });
  await store.update(entry({ attempt: 1, dismissed: true }));
  expect(selectBanner(store.getSnapshot()).attempt).toBe(2);
});

test('legacy dismissals migrate; old comment history remains without comment banners', async () => {
  const store = createOperationStore({ storage: storage([
    entry({ dismissed: true, acknowledged: true }), entry({ id: 'comment', kind: 'comment' }),
  ]) });
  await store.hydrate();
  await store.update(entry({ dismissed: false, acknowledged: false }));
  expect(selectBanner(store.getSnapshot())).toBeNull();
  expect(store.getSnapshot()).toHaveLength(2);
});
