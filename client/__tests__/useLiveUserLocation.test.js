import { act, renderHook } from '@testing-library/react-native';
import * as Location from 'expo-location';

import {
  FIRST_LOCATION_TIMEOUT_MS,
  LAST_KNOWN_LOCATION_MAX_AGE_MS,
  useLiveUserLocation,
} from '../src/hooks/useLiveUserLocation';

jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3, Highest: 6, High: 5 },
  requestForegroundPermissionsAsync: jest.fn(),
  getLastKnownPositionAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  watchPositionAsync: jest.fn(),
}));

describe('useLiveUserLocation', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.resetAllMocks();
    Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    Location.getLastKnownPositionAsync.mockResolvedValue(null);
    Location.getCurrentPositionAsync.mockImplementation(() => new Promise(() => {}));
    Location.watchPositionAsync.mockResolvedValue({ remove: jest.fn() });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('exposes a timeout without cancelling a precise location that arrives later', async () => {
    let resolvePosition;
    Location.getCurrentPositionAsync.mockImplementation(() => new Promise((resolve) => {
      resolvePosition = resolve;
    }));
    const { result } = renderHook(() => useLiveUserLocation());

    let request;
    await act(async () => {
      request = result.current.startTracking();
      await Promise.resolve();
    });
    expect(result.current.status).toBe('locating');
    expect(result.current.awaitingFirstFix).toBe(true);

    act(() => jest.advanceTimersByTime(FIRST_LOCATION_TIMEOUT_MS));
    expect(result.current.status).toBe('timeout');
    expect(result.current.awaitingFirstFix).toBe(false);

    await act(async () => {
      resolvePosition({
        coords: { latitude: 41.7151, longitude: 44.8271, accuracy: 8 },
        timestamp: 123,
      });
      await request;
    });
    expect(result.current.status).toBe('granted');
    expect(result.current.location).toEqual({
      lat: 41.7151,
      lng: 44.8271,
      accuracy: 8,
      timestamp: 123,
    });
  });

  it('reports denied permission without starting native tracking', async () => {
    Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' });
    const { result } = renderHook(() => useLiveUserLocation());

    await act(async () => result.current.startTracking());

    expect(result.current.status).toBe('denied');
    expect(result.current.awaitingFirstFix).toBe(false);
    expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
    expect(Location.watchPositionAsync).not.toHaveBeenCalled();
  });

  it('shares a pending precise-location request instead of restarting it', async () => {
    let resolvePosition;
    Location.getCurrentPositionAsync.mockImplementation(() => new Promise((resolve) => {
      resolvePosition = resolve;
    }));
    const { result } = renderHook(() => useLiveUserLocation());

    let first;
    let second;
    await act(async () => {
      first = result.current.startTracking();
      second = result.current.startTracking();
      await Promise.resolve();
    });
    expect(first).toBe(second);
    expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(Location.getCurrentPositionAsync).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolvePosition({
        coords: { latitude: 41.7151, longitude: 44.8271, accuracy: 8 },
        timestamp: 123,
      });
      await first;
    });
  });

  it('starts a new native request when the user retries after a timeout', async () => {
    const resolvers = [];
    Location.getCurrentPositionAsync.mockImplementation(() => new Promise((resolve) => {
      resolvers.push(resolve);
    }));
    const { result } = renderHook(() => useLiveUserLocation());

    let first;
    await act(async () => {
      first = result.current.startTracking();
      await Promise.resolve();
    });
    act(() => jest.advanceTimersByTime(FIRST_LOCATION_TIMEOUT_MS));

    let retry;
    await act(async () => {
      retry = result.current.startTracking();
      await Promise.resolve();
    });
    expect(retry).not.toBe(first);
    expect(Location.getCurrentPositionAsync).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolvers[1]({
        coords: { latitude: 41.7151, longitude: 44.8271, accuracy: 8 },
        timestamp: 456,
      });
      await retry;
      resolvers[0]({
        coords: { latitude: 0, longitude: 0, accuracy: 100 },
        timestamp: 123,
      });
      await first;
    });
    expect(result.current.location).toMatchObject({ lat: 41.7151, lng: 44.8271 });
  });

  const position = (overrides = {}) => ({
    coords: { latitude: 32.08, longitude: 34.78, accuracy: 12 },
    timestamp: Date.now(),
    ...overrides,
  });

  it('uses a recent cached fix while fresh location and its watcher start in parallel', async () => {
    const cached = position({ timestamp: Date.now() - 30_000 });
    Location.getLastKnownPositionAsync.mockResolvedValue(cached);
    const { result } = renderHook(() => useLiveUserLocation());
    let first;
    await act(async () => { first = result.current.startTracking(); });

    await expect(first).resolves.toMatchObject({ lat: 32.08, lng: 34.78 });
    expect(result.current.status).toBe('granted');
    expect(Location.getLastKnownPositionAsync).toHaveBeenCalledWith({ maxAge: 60_000, requiredAccuracy: 500 });
    expect(Location.getCurrentPositionAsync).toHaveBeenCalledWith({ accuracy: Location.Accuracy.Balanced });
    expect(Location.watchPositionAsync).toHaveBeenCalledWith(
      expect.objectContaining({ accuracy: Location.Accuracy.High }), expect.any(Function), expect.any(Function)
    );
    act(() => Location.watchPositionAsync.mock.calls[0][1](position({
      coords: { latitude: 32.09, longitude: 34.79, accuracy: 5 },
    })));
    expect(result.current.location).toMatchObject({ lat: 32.09, lng: 34.79, accuracy: 5 });
  });

  it.each(['old', 'inaccurate', 'missing-timestamp', 'missing-accuracy', 'invalid-coordinates'])(
    'ignores a %s cached location and bounds the pending first fix', async (kind) => {
      const cached = position();
      if (kind === 'old') cached.timestamp -= LAST_KNOWN_LOCATION_MAX_AGE_MS + 1;
      if (kind === 'inaccurate') cached.coords.accuracy = 501;
      if (kind === 'missing-timestamp') delete cached.timestamp;
      if (kind === 'missing-accuracy') delete cached.coords.accuracy;
      if (kind === 'invalid-coordinates') cached.coords.latitude = null;
      Location.getLastKnownPositionAsync.mockResolvedValue(cached);
      const { result } = renderHook(() => useLiveUserLocation());
      let pending;
      await act(async () => { pending = result.current.startTracking(); });
      expect(result.current.location).toBeNull();
      await act(async () => { jest.advanceTimersByTime(FIRST_LOCATION_TIMEOUT_MS); });
      await expect(pending).resolves.toBeNull();
      expect(result.current.status).toBe('timeout');
    }
  );

  it('keeps a fresh fix when the last-known lookup completes later', async () => {
    let resolveCached;
    Location.getLastKnownPositionAsync.mockImplementation(() => new Promise((resolve) => { resolveCached = resolve; }));
    Location.getCurrentPositionAsync.mockResolvedValue(position());
    const { result } = renderHook(() => useLiveUserLocation());
    await act(async () => { await result.current.startTracking(); });
    await act(async () => resolveCached(position({
      timestamp: Date.now() - 20_000,
      coords: { latitude: 31, longitude: 35, accuracy: 10 },
    })));
    expect(result.current.location).toMatchObject({ lat: 32.08, lng: 34.78 });
  });

  it('accepts a watcher fix before the current-position request and ignores an older fresh fix', async () => {
    let resolveCurrent;
    Location.getCurrentPositionAsync.mockImplementation(() => new Promise((resolve) => { resolveCurrent = resolve; }));
    const { result } = renderHook(() => useLiveUserLocation());
    let pending;
    await act(async () => { pending = result.current.startTracking(); });
    act(() => Location.watchPositionAsync.mock.calls[0][1](position()));
    await expect(pending).resolves.toMatchObject({ lat: 32.08 });
    await act(async () => resolveCurrent(position({
      timestamp: Date.now() - 1000,
      coords: { latitude: 31, longitude: 35, accuracy: 10 },
    })));
    expect(result.current.location.lat).toBe(32.08);
  });

  it('continues tracking after timeout and recovers from a late watcher fix', async () => {
    const { result } = renderHook(() => useLiveUserLocation());
    let pending;
    await act(async () => { pending = result.current.startTracking(); });
    await act(async () => { jest.advanceTimersByTime(FIRST_LOCATION_TIMEOUT_MS); });
    await expect(pending).resolves.toBeNull();
    expect(result.current.status).toBe('timeout');
    act(() => Location.watchPositionAsync.mock.calls[0][1](position()));
    expect(result.current.status).toBe('granted');
    expect(result.current.error).toBeNull();
  });

  it('can locate without a cache and reports safe errors only when both fresh sources fail', async () => {
    Location.getLastKnownPositionAsync.mockRejectedValue(new Error('native cache details'));
    Location.getCurrentPositionAsync.mockRejectedValue(new Error('native position details'));
    const { result } = renderHook(() => useLiveUserLocation());
    let pending;
    await act(async () => { pending = result.current.startTracking(); });
    expect(result.current.status).toBe('locating');
    act(() => Location.watchPositionAsync.mock.calls[0][2]('native watch details'));
    await expect(pending).resolves.toBeNull();
    expect(result.current.status).toBe('error');
    expect(result.current.error).not.toContain('native');
  });

  it('settles and clears tracking on stop, including a subscription that registers after a retry', async () => {
    const timers = jest.spyOn(global, 'setTimeout');
    const clearTimer = jest.spyOn(global, 'clearTimeout');
    let resolveOldWatch;
    const oldWatcher = { remove: jest.fn() };
    const newWatcher = { remove: jest.fn() };
    Location.watchPositionAsync
      .mockImplementationOnce(() => new Promise((resolve) => { resolveOldWatch = resolve; }))
      .mockResolvedValueOnce(newWatcher);
    const { result, unmount } = renderHook(() => useLiveUserLocation());
    let first;
    await act(async () => { first = result.current.startTracking(); });
    act(() => result.current.stopTracking());
    await expect(first).resolves.toBeNull();
    let second;
    await act(async () => { second = result.current.startTracking(); });
    await act(async () => resolveOldWatch(oldWatcher));
    expect(oldWatcher.remove).toHaveBeenCalledTimes(1);
    expect(newWatcher.remove).not.toHaveBeenCalled();
    act(() => Location.watchPositionAsync.mock.calls[0][1](position()));
    expect(result.current.location).toBeNull();
    unmount();
    await expect(second).resolves.toBeNull();
    expect(newWatcher.remove).toHaveBeenCalledTimes(1);
    timers.mock.calls.forEach(([, delay], index) => {
      if (delay === FIRST_LOCATION_TIMEOUT_MS) {
        expect(clearTimer).toHaveBeenCalledWith(timers.mock.results[index].value);
      }
    });
  });

  it('does not start native sources if the map closes during permission approval', async () => {
    let resolvePermission;
    Location.requestForegroundPermissionsAsync.mockImplementation(() => new Promise((resolve) => { resolvePermission = resolve; }));
    const { result, unmount } = renderHook(() => useLiveUserLocation());
    let pending;
    await act(async () => { pending = result.current.startTracking(); });
    unmount();
    await expect(pending).resolves.toBeNull();
    await act(async () => resolvePermission({ status: 'granted' }));
    expect(Location.getLastKnownPositionAsync).not.toHaveBeenCalled();
    expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
    expect(Location.watchPositionAsync).not.toHaveBeenCalled();
  });

  it('reuses only a recent accurate fix across closing and reopening the map', async () => {
    Location.getCurrentPositionAsync.mockResolvedValueOnce(position());
    const { result, rerender } = renderHook(() => useLiveUserLocation());
    await act(async () => { await result.current.startTracking(); });
    act(() => result.current.stopTracking());
    rerender({});
    expect(result.current.location).toMatchObject({ lat: 32.08 });
    act(() => jest.advanceTimersByTime(LAST_KNOWN_LOCATION_MAX_AGE_MS + 1));
    rerender({});
    expect(result.current.location).toBeNull();
    await act(async () => { result.current.startTracking(); });
    expect(result.current.awaitingFirstFix).toBe(true);
  });
});
