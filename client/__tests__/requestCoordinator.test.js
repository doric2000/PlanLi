import { createRequestCoordinator } from '../src/utils/requestCoordinator';

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

describe('request coordinator', () => {
  let clock;
  let coordinator;

  beforeEach(() => {
    jest.useFakeTimers();
    clock = 1_000;
    coordinator = createRequestCoordinator({
      freshMs: 30_000,
      staleMs: 300_000,
      retryMs: 15_000,
      maxEntries: 5,
      now: () => clock,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('suppresses requests inside 30 seconds and reloads after expiry', async () => {
    const loader = jest.fn()
      .mockResolvedValueOnce('first')
      .mockResolvedValueOnce('second');

    await coordinator.request('home:guest', loader).promise;
    const fresh = coordinator.request('home:guest', loader);
    expect(fresh).toMatchObject({ requested: false, source: 'fresh-cache' });
    await expect(fresh.promise).resolves.toBe('first');

    clock += 30_001;
    const expired = coordinator.request('home:guest', loader);
    expect(expired).toMatchObject({ requested: true, source: 'network' });
    await expect(expired.promise).resolves.toBe('second');
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('deduplicates in-flight work per isolated resource key', async () => {
    const pending = deferred();
    const loader = jest.fn(() => pending.promise);

    const first = coordinator.request('community:user-1:all', loader);
    const duplicate = coordinator.request('community:user-1:all', loader);
    const isolated = coordinator.request('community:user-2:all', jest.fn(async () => 'other'));

    expect(first.requested).toBe(true);
    expect(duplicate).toMatchObject({ requested: false, source: 'in-flight' });
    expect(duplicate.promise).toBe(first.promise);
    expect(isolated.requested).toBe(true);
    expect(loader).toHaveBeenCalledTimes(1);

    pending.resolve('shared');
    await expect(first.promise).resolves.toBe('shared');
  });

  it('returns stale content for five minutes and backs off failures for 15 seconds', async () => {
    const loader = jest.fn().mockResolvedValueOnce('cached');
    await coordinator.request('routes:popular', loader).promise;
    clock += 30_001;
    const failure = new Error('offline');
    loader.mockRejectedValueOnce(failure);

    const stale = coordinator.request('routes:popular', loader);
    expect(stale.requested).toBe(true);
    await expect(stale.promise).resolves.toBe('cached');

    const backedOff = coordinator.request('routes:popular', loader);
    expect(backedOff).toMatchObject({ requested: false, source: 'stale-cache' });
    await expect(backedOff.promise).resolves.toBe('cached');
    expect(loader).toHaveBeenCalledTimes(2);

    clock += 15_001;
    loader.mockResolvedValueOnce('recovered');
    await expect(coordinator.request('routes:popular', loader).promise).resolves.toBe('recovered');
  });

  it('rejects uncached failures during backoff without another request', async () => {
    const failure = new Error('offline');
    const loader = jest.fn().mockRejectedValue(failure);

    await expect(coordinator.request('profile:user-1', loader).promise).rejects.toBe(failure);
    const retry = coordinator.request('profile:user-1', loader);
    expect(retry).toMatchObject({ requested: false, source: 'backoff' });
    await expect(retry.promise).rejects.toBe(failure);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('does not use stale fallback after five minutes', async () => {
    const loader = jest.fn().mockResolvedValueOnce('cached');
    await coordinator.request('community:old', loader).promise;
    clock += 300_001;
    const failure = new Error('offline');
    loader.mockRejectedValueOnce(failure);

    await expect(coordinator.request('community:old', loader).promise).rejects.toBe(failure);
  });

  it('supports prefix invalidation after mutations', async () => {
    const loader = jest.fn()
      .mockResolvedValueOnce('old recommendations')
      .mockResolvedValueOnce('old routes')
      .mockResolvedValueOnce('new recommendations');
    await coordinator.request('profile:user-1:recommendations', loader).promise;
    await coordinator.request('profile:user-1:routes', loader).promise;

    coordinator.invalidate('profile:user-1:recommendations');

    const refreshed = coordinator.request('profile:user-1:recommendations', loader);
    expect(refreshed.requested).toBe(true);
    expect(coordinator.request('profile:user-1:routes', loader)).toMatchObject({
      requested: false,
      source: 'fresh-cache',
    });
    await refreshed.promise;
  });

  it('does not repopulate an invalidated key when old in-flight work completes', async () => {
    const old = deferred();
    const first = coordinator.request('home:default', () => old.promise);
    coordinator.invalidate('home:');
    const second = coordinator.request('home:default', async () => 'new');
    old.resolve('old');
    await first.promise;
    await second.promise;

    await expect(coordinator.request('home:default', jest.fn()).promise).resolves.toBe('new');
  });

  it('evicts the least-recently-used entry at the configured bound', async () => {
    for (let index = 0; index < 6; index += 1) {
      await coordinator.request(`resource:${index}`, async () => index).promise;
    }
    const reload = jest.fn(async () => 'reloaded');

    const evicted = coordinator.request('resource:0', reload);
    expect(evicted.requested).toBe(true);
    await expect(evicted.promise).resolves.toBe('reloaded');
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
