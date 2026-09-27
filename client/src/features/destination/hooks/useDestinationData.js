import { useCallback, useEffect, useState } from 'react';
import {
  doc,
  getDoc,
} from 'firebase/firestore';

import { db } from '../../../config/firebase';
import { getDestinationOverview } from '../../../services/DestinationService';
import { cityCoordinate } from '../utils/cityMap';

function storedCoordinates(city) {
  const point = [city?.googleCache?.coordinates, city?.identity?.coordinates, city?.coordinates].map(cityCoordinate).find(Boolean);
  return point ? { lat: point.latitude, lng: point.longitude } : null;
}

function legacyWeather(city) {
  const value = city?.widgets?.weather;
  if (!value?.temp && !value?.status) return null;
  const temperatureText = String(value.temp ?? '').replace(/[^0-9.-]/g, '');
  const temperatureC = temperatureText ? Number(temperatureText) : NaN;
  return {
    ...(Number.isFinite(temperatureC) ? { temperatureC } : {}),
    description: value.status || null,
    source: 'Stored destination data',
  };
}

function legacyAirport(city) {
  const value = city?.travelFacts?.closestAirport ||
    city?.closestAirport || city?.widgets?.airport;
  if (!value) return null;
  if (typeof value === 'string') return { name: value };
  return {
    name: value.name || value.airportName || null,
    iataCode: value.iataCode || value.iata || value.code || null,
    distanceKm: value.distanceKm != null && value.distanceKm !== '' && Number.isFinite(Number(value.distanceKm))
      ? Number(value.distanceKm)
      : null,
    source: value.source || 'Stored destination data',
    sourceUpdatedAt: value.sourceUpdatedAt || null,
  };
}

async function loadStoredOverview(cityId, countryId) {
  const [citySnapshot, countrySnapshot] = await Promise.all([
    getDoc(doc(db, 'countries', countryId, 'destinations', cityId)),
    getDoc(doc(db, 'countries', countryId)),
  ]);
  if (!citySnapshot.exists() || !countrySnapshot.exists()) return null;
  const city = citySnapshot.data() || {};
  const country = countrySnapshot.data() || {};
  const weather = legacyWeather(city);
  const closestAirport = legacyAirport(city);
  const currencyCode = String(country.currencyCode || '').trim().toUpperCase();
  const travelFacts = country.travelFacts || {};
  return {
    destination: {
      cityId,
      countryId,
      name: city.googleCache?.names?.he || city.identity?.names?.he || city.name || '',
      names: city.googleCache?.names || city.identity?.names || null,
      identity: city.identity || null,
      coordinates: storedCoordinates(city),
      countryName: country.names?.he || country.name || '',
      countryCode: country.code || null,
      description: null,
      destinationImage: city.destinationImage || null,
      heroImageUrl: city.destinationImage ? null : (city.externalImageUrl || city.imageUrl || null),
      thumbnailUrl: city.destinationImage ? null : (city.externalImageUrl || city.imageUrl || null),
      travelers: 0,
    },
    quickFacts: {
      weather,
      closestAirport,
      currency: currencyCode ? { code: currencyCode } : null,
    },
    essentialFacts: {
      languages: travelFacts.languages || [],
      callingCodes: travelFacts.callingCodes || [],
    },
    sources: {
      ...(weather ? { weather: { name: weather.source } } : {}),
      ...(closestAirport ? {
        closestAirport: {
          name: closestAirport.source,
          updatedAt: closestAirport.sourceUpdatedAt,
        },
      } : {}),
      ...((travelFacts.languages?.length || travelFacts.callingCodes?.length)
        ? { country: { name: travelFacts.source || 'countries-list' } }
        : {}),
    },
  };
}

export const useDestinationData = (cityId, countryId) => {
  const identity = `${countryId || ''}:${cityId || ''}`;
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ identity: '', overview: null, loading: true, error: null });
  useEffect(() => {
    let cancelled = false;
    setState({ identity, overview: null, loading: true, error: null });
    if (!cityId || !countryId) {
      setState({ identity, overview: null, loading: false, error: 'היעד לא נמצא.' });
      return undefined;
    }
    getDestinationOverview({ cityId, countryId })
      .catch(() => loadStoredOverview(cityId, countryId))
      .then((overview) => {
        if (!cancelled) setState({ identity, overview, loading: false, error: overview ? null : 'היעד לא נמצא.' });
        // Older overview responses omit the provider center. Resolve it separately
        // so an empty city still has a map without delaying its useful information.
        if (!cancelled && overview?.destination && !storedCoordinates(overview.destination)) {
          getDoc(doc(db, 'countries', countryId, 'destinations', cityId)).then((snapshot) => {
            const coordinates = snapshot.exists() ? storedCoordinates(snapshot.data()) : null;
            if (!cancelled && coordinates) setState((current) => current.identity === identity ? {
              ...current, overview: { ...current.overview, destination: { ...current.overview.destination, coordinates } },
            } : current);
          }).catch(() => {});
        }
      })
      .catch(() => {
        if (!cancelled) setState({ identity, overview: null, loading: false, error: 'לא הצלחנו לטעון את היעד כרגע.' });
      });
    return () => { cancelled = true; };
  }, [cityId, countryId, identity, attempt]);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return state.identity === identity ? { ...state, retry } : { overview: null, loading: true, error: null, retry };
};
