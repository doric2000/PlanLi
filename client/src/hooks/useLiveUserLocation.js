import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';

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
  const requestSerial = useRef(0);

  const stopTracking = useCallback(() => {
    requestSerial.current += 1;
    watcherRef.current?.remove?.();
    watcherRef.current = null;
  }, []);

  const startTracking = useCallback(async () => {
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
      const current = normalizePosition(await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Highest,
      }));
      if (requestSerial.current !== serial) return null;
      if (current) setLocation(current);
      watcherRef.current?.remove?.();
      watcherRef.current = await Location.watchPositionAsync({
        accuracy: Location.Accuracy.High,
        distanceInterval: 3,
        timeInterval: 4_000,
      }, (position) => {
        if (requestSerial.current !== serial) return;
        const next = normalizePosition(position);
        if (next) setLocation(next);
      });
      if (requestSerial.current !== serial) {
        watcherRef.current?.remove?.();
        watcherRef.current = null;
        return null;
      }
      setStatus(current ? 'granted' : 'error');
      if (!current) setError('לא התקבל מיקום מדויק מהמכשיר.');
      return current;
    } catch (caught) {
      if (requestSerial.current !== serial) return null;
      setStatus('error');
      setError(caught?.message || String(caught));
      return null;
    }
  }, []);

  useEffect(() => stopTracking, [stopTracking]);

  return { location, status, error, startTracking, stopTracking };
}
