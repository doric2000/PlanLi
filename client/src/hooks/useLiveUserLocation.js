import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';

export const FIRST_LOCATION_TIMEOUT_MS = 8_000;

function normalizePosition(position) {
  const lat = Number(position?.coords?.latitude);
  const lng = Number(position?.coords?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    lat,
    lng,
    accuracy: Number(position?.coords?.accuracy) || 0,
    timestamp: Number(position?.timestamp) || Date.now(),
  };
}

export function useLiveUserLocation() {
  const [location, setLocation] = useState(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const watcherRef = useRef(null);
  const firstFixTimerRef = useRef(null);
  const locationRef = useRef(null);
  const startPromiseRef = useRef(null);
  const requestSerial = useRef(0);

  const clearFirstFixTimer = useCallback(() => {
    if (firstFixTimerRef.current) clearTimeout(firstFixTimerRef.current);
    firstFixTimerRef.current = null;
  }, []);

  const stopTracking = useCallback(() => {
    requestSerial.current += 1;
    startPromiseRef.current = null;
    clearFirstFixTimer();
    watcherRef.current?.remove?.();
    watcherRef.current = null;
  }, [clearFirstFixTimer]);

  const startTracking = useCallback(() => {
    if (startPromiseRef.current) return startPromiseRef.current;
    const request = (async () => {
      const serial = requestSerial.current + 1;
      requestSerial.current = serial;
      setStatus('requesting');
      setError(null);
      try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (requestSerial.current !== serial) return null;
      if (permission.status !== 'granted') {
        setStatus('denied');
        return null;
      }
      setStatus('locating');
      clearFirstFixTimer();
      firstFixTimerRef.current = setTimeout(() => {
        if (requestSerial.current !== serial || locationRef.current) return;
        if (startPromiseRef.current === request) startPromiseRef.current = null;
        setStatus('timeout');
        setError('לא התקבל מיקום מדויק בזמן. אפשר להמשיך במפה ולנסות שוב.');
      }, FIRST_LOCATION_TIMEOUT_MS);
      const current = normalizePosition(await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Highest,
      }));
      if (requestSerial.current !== serial) return null;
      clearFirstFixTimer();
      if (current) {
        locationRef.current = current;
        setLocation(current);
        setStatus('granted');
        setError(null);
      }
      if (!current) {
        setStatus('error');
        setError('לא התקבל מיקום מדויק מהמכשיר.');
        return null;
      }
      watcherRef.current?.remove?.();
      try {
        watcherRef.current = await Location.watchPositionAsync({
          accuracy: Location.Accuracy.High,
          distanceInterval: 3,
          timeInterval: 4_000,
        }, (position) => {
          if (requestSerial.current !== serial) return;
          const next = normalizePosition(position);
          if (next) {
            locationRef.current = next;
            setLocation(next);
            setStatus('granted');
            setError(null);
          }
        });
      } catch (watchError) {
        if (requestSerial.current === serial) {
          setError(watchError?.message || String(watchError));
        }
        return current;
      }
      if (requestSerial.current !== serial) {
        watcherRef.current?.remove?.();
        watcherRef.current = null;
        return null;
      }
        return current;
      } catch (caught) {
        if (requestSerial.current !== serial) return null;
        clearFirstFixTimer();
        setStatus('error');
        setError(caught?.message || String(caught));
        return null;
      }
    })();
    startPromiseRef.current = request;
    request.then(
      () => { if (startPromiseRef.current === request) startPromiseRef.current = null; },
      () => { if (startPromiseRef.current === request) startPromiseRef.current = null; }
    );
    return request;
  }, [clearFirstFixTimer]);

  useEffect(() => stopTracking, [stopTracking]);

  return {
    location,
    status,
    error,
    awaitingFirstFix: !location && ['idle', 'requesting', 'locating'].includes(status),
    startTracking,
    stopTracking,
  };
}
