import { act, renderHook } from '@testing-library/react-native';
import * as Location from 'expo-location';

import {
  FIRST_LOCATION_TIMEOUT_MS,
  useLiveUserLocation,
} from '../src/hooks/useLiveUserLocation';

jest.mock('expo-location', () => ({
  Accuracy: { Highest: 6, High: 5 },
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  watchPositionAsync: jest.fn(),
}));

describe('useLiveUserLocation', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    Location.watchPositionAsync.mockResolvedValue({ remove: jest.fn() });
  });

  afterEach(() => {
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
});
