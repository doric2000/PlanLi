import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';

export const FIRST_LOCATION_TIMEOUT_MS = 8_000;
export const LAST_KNOWN_LOCATION_MAX_AGE_MS = 60_000;
export const LAST_KNOWN_LOCATION_MAX_ACCURACY = 500;

function normalizePosition(position) {
  const { latitude, longitude, accuracy } = position?.coords || {};
  if (latitude == null || longitude == null) return null;
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return {
    lat,
    lng,
    accuracy: accuracy != null && Number.isFinite(Number(accuracy)) && Number(accuracy) >= 0
      ? Number(accuracy) : null,
    timestamp: Number(position?.timestamp) || Date.now(),
  };
}

function canReuseLocation(location) {
  if (!location || location.accuracy == null) return false;
  const age = Date.now() - location.timestamp;
  return age >= 0 && age <= LAST_KNOWN_LOCATION_MAX_AGE_MS
    && location.accuracy <= LAST_KNOWN_LOCATION_MAX_ACCURACY;
}

export function useLiveUserLocation() {
  const [location, setLocation] = useState(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const locationRef = useRef(null);
  const sessionRef = useRef(null);

  const stopTracking = useCallback(() => {
    const session = sessionRef.current;
    sessionRef.current = null;
    if (!session) return;
    clearTimeout(session.timer);
    session.watcher?.remove();
    session.finish(null);
  }, []);

  const startTracking = useCallback(() => {
    const active = sessionRef.current;
    if (active && !active.settled) return active.promise;
    if (active?.location && canReuseLocation(active.location)) return Promise.resolve(active.location);
    stopTracking();

    const retained = canReuseLocation(locationRef.current) ? locationRef.current : null;
    locationRef.current = retained;
    setLocation(retained);
    setStatus('requesting');
    setError(null);

    const session = { location: null, hasFreshFix: false, settled: false, watcher: null, timer: null };
    session.promise = new Promise((resolve) => {
      session.finish = (value) => {
        clearTimeout(session.timer);
        if (session.settled) return;
        session.settled = true;
        resolve(value);
      };
    });
    sessionRef.current = session;
    const isCurrent = () => sessionRef.current === session;

    const accept = (position, cached = false) => {
      if (!isCurrent()) return;
      const next = normalizePosition(position);
      if (!next) return;
      if (cached && (!position?.timestamp || !canReuseLocation(next) || session.hasFreshFix)) return;
      if (!cached && session.hasFreshFix && next.timestamp < session.location.timestamp) return;
      if (!cached) session.hasFreshFix = true;
      session.location = next;
      locationRef.current = next;
      setLocation(next);
      setStatus('granted');
      setError(null);
      session.finish(next);
    };

    const fail = (nextStatus, message) => {
      if (!isCurrent() || session.location) return;
      setStatus(nextStatus);
      setError(message);
      session.finish(null);
    };

    // Permission is the only prerequisite. None of the three location sources
    // waits for another source, including registration of the live watcher.
    Promise.resolve().then(() => Location.requestForegroundPermissionsAsync()).then((permission) => {
      if (!isCurrent()) return;
      if (permission.status !== 'granted') {
        locationRef.current = null;
        setLocation(null);
        fail('denied', null);
        return;
      }
      setStatus('locating');
      session.timer = setTimeout(() => {
        fail('timeout', 'לא התקבל מיקום בזמן. אפשר להמשיך במפה ולנסות שוב.');
      }, FIRST_LOCATION_TIMEOUT_MS);
      if (retained) accept({
        coords: { latitude: retained.lat, longitude: retained.lng, accuracy: retained.accuracy },
        timestamp: retained.timestamp,
      }, true);

      let cacheFinished = false;
      let currentFailed = false;
      let watchFailed = false;
      const checkSources = () => {
        if (cacheFinished && currentFailed && watchFailed) {
          fail('error', 'לא ניתן לקבל מיקום כרגע. אפשר להמשיך במפה ולנסות שוב.');
        }
      };

      Promise.resolve().then(() => Location.getLastKnownPositionAsync({
        maxAge: LAST_KNOWN_LOCATION_MAX_AGE_MS,
        requiredAccuracy: LAST_KNOWN_LOCATION_MAX_ACCURACY,
      })).then((position) => accept(position, true), () => {}).finally(() => {
        cacheFinished = true;
        checkSources();
      });

      Promise.resolve().then(() => Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      })).then((position) => {
        accept(position);
        currentFailed = !normalizePosition(position);
        checkSources();
      }, () => {
        currentFailed = true;
        checkSources();
      });

      const onWatchError = () => {
        watchFailed = true;
        checkSources();
      };
      Promise.resolve().then(() => Location.watchPositionAsync({
        accuracy: Location.Accuracy.High,
        distanceInterval: 3,
        timeInterval: 4_000,
      }, (position) => accept(position), onWatchError)).then((subscription) => {
        // A late subscription belongs to its own session; it must never remove
        // a newer session's watcher when the map closes or the user retries.
        if (!isCurrent()) subscription.remove();
        else session.watcher = subscription;
      }, onWatchError);
    }).catch(() => fail('error', 'לא ניתן לקבל מיקום כרגע. אפשר לנסות שוב.'));

    return session.promise;
  }, [stopTracking]);

  useEffect(() => stopTracking, [stopTracking]);

  // Keep live fixes visible while tracking. Reopening the map may reuse only
  // a recent, sufficiently accurate fix from the previous session.
  const availableLocation = sessionRef.current?.location || (canReuseLocation(location) ? location : null);
  return {
    location: availableLocation,
    status,
    error,
    awaitingFirstFix: !availableLocation && ['idle', 'requesting', 'locating'].includes(status),
    startTracking,
    stopTracking,
  };
}
