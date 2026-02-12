import { useCallback, useState } from 'react';
import * as Location from 'expo-location';

/**
 * Fetches the user's current location (foreground).
 *
 * Returns a minimal, serializable payload to keep callers simple.
 */
export const useUserLocation = () => {
  const [location, setLocation] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | requesting | granted | denied | error
  const [error, setError] = useState(null);

  const requestLocation = useCallback(async () => {
    setError(null);
    setStatus('requesting');

    try {
      const { status: permissionStatus } = await Location.requestForegroundPermissionsAsync();
      if (permissionStatus !== 'granted') {
        setStatus('denied');
        return null;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const nextLocation = {
        lat: position?.coords?.latitude,
        lng: position?.coords?.longitude,
        accuracy: position?.coords?.accuracy,
        timestamp: position?.timestamp,
      };

      if (!Number.isFinite(Number(nextLocation.lat)) || !Number.isFinite(Number(nextLocation.lng))) {
        setStatus('error');
        setError('Invalid coordinates received');
        return null;
      }

      setLocation({
        lat: Number(nextLocation.lat),
        lng: Number(nextLocation.lng),
        accuracy: nextLocation.accuracy,
        timestamp: nextLocation.timestamp,
      });
      setStatus('granted');
      return nextLocation;
    } catch (e) {
      setStatus('error');
      setError(e?.message || String(e));
      return null;
    }
  }, []);

  return {
    location,
    status,
    error,
    requestLocation,
  };
};
