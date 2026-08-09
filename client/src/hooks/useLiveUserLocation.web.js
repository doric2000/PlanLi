import { useCallback, useEffect, useRef, useState } from 'react';

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
  const watchRef = useRef(null);
  const requestSerial = useRef(0);

  const stopTracking = useCallback(() => {
    requestSerial.current += 1;
    if (watchRef.current != null && globalThis.navigator?.geolocation) {
      globalThis.navigator.geolocation.clearWatch(watchRef.current);
    }
    watchRef.current = null;
  }, []);

  const startTracking = useCallback(async () => {
    const geolocation = globalThis.navigator?.geolocation;
    const serial = requestSerial.current + 1;
    requestSerial.current = serial;
    setStatus('requesting');
    setError(null);
    if (!geolocation) {
      setStatus('error');
      setError('הדפדפן אינו תומך בשירותי מיקום.');
      return null;
    }
    return new Promise((resolve) => {
      const success = (position) => {
        if (requestSerial.current !== serial) return;
        const next = normalizePosition(position);
        if (!next) return;
        setLocation(next);
        setStatus('granted');
        resolve(next);
      };
      const failure = (caught) => {
        if (requestSerial.current !== serial) return;
        setStatus(caught?.code === 1 ? 'denied' : 'error');
        setError(caught?.message || 'לא ניתן לקבל את המיקום.');
        resolve(null);
      };
      watchRef.current = geolocation.watchPosition(success, failure, {
        enableHighAccuracy: true,
        maximumAge: 5_000,
        timeout: 12_000,
      });
    });
  }, []);

  useEffect(() => stopTracking, [stopTracking]);

  return { location, status, error, startTracking, stopTracking };
}
