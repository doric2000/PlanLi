import { useEffect, useState } from 'react';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  where,
} from 'firebase/firestore';

import { db } from '../../../config/firebase';
import { useSmartProfile } from '../../../hooks/useSmartProfile';
import { getDestinationOverview } from '../../../services/DestinationService';
import { getPersonalizedRecommendations } from '../../../services/PersonalizationService';

function legacyWeather(city) {
  const value = city?.widgets?.weather;
  if (!value?.temp && !value?.status) return null;
  const temperatureC = Number(String(value.temp || '').replace(/[^0-9.-]/g, ''));
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
    distanceKm: Number.isFinite(Number(value.distanceKm))
      ? Number(value.distanceKm)
      : null,
    source: value.source || 'Stored destination data',
    sourceUpdatedAt: value.sourceUpdatedAt || null,
  };
}

async function loadStoredOverview(cityId, countryId) {
  const [citySnapshot, countrySnapshot] = await Promise.all([
    getDoc(doc(db, 'countries', countryId, 'cities', cityId)),
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
      name: city.name || '',
      countryName: country.name || city.countryName || '',
      countryCode: country.code || null,
      description: city.description || null,
      heroImageUrl: city.externalImageUrl || city.imageUrl || null,
      thumbnailUrl: city.externalImageUrl || city.imageUrl || null,
      travelers: Number(city.travelers || 0),
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

async function loadGenericRecommendations(countryId, cityId) {
  const destinationQuery = query(
    collection(db, 'recommendations'),
    where('destination.countryId', '==', countryId),
    where('destination.cityId', '==', cityId),
    where('status', '==', 'active'),
    limit(30)
  );
  const snapshot = await getDocs(destinationQuery);
  return snapshot.docs.map((document) => ({
    id: document.id,
    ...document.data(),
  }));
}

export const useDestinationData = (cityId, countryId) => {
  const { completed: preferencesCompleted } = useSmartProfile();
  const [overview, setOverview] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!cityId || !countryId) {
      setOverview(null);
      setRecommendations([]);
      setError('היעד לא נמצא.');
      setLoading(false);
      return undefined;
    }

    const load = async () => {
      setLoading(true);
      setError(null);
      const overviewPromise = getDestinationOverview({ cityId, countryId })
        .catch(async (overviewError) => {
          console.warn('Destination overview callable failed:', overviewError);
          return loadStoredOverview(cityId, countryId);
        });
      const recommendationsPromise = getPersonalizedRecommendations({
        context: { countryId, cityId },
        sort: preferencesCompleted ? 'forYou' : 'popular',
        limit: 30,
      }).then((result) => Array.isArray(result?.items) ? result.items : [])
        .catch(async (recommendationsError) => {
          console.warn(
            'Personalized destination recommendations failed:',
            recommendationsError
          );
          try {
            return await loadGenericRecommendations(countryId, cityId);
          } catch (fallbackError) {
            console.warn('Destination recommendation fallback failed:', fallbackError);
            return [];
          }
        });

      try {
        const [nextOverview, nextRecommendations] = await Promise.all([
          overviewPromise,
          recommendationsPromise,
        ]);
        if (cancelled) return;
        setOverview(nextOverview);
        setRecommendations(nextRecommendations);
        if (!nextOverview) setError('היעד לא נמצא.');
      } catch (loadError) {
        if (cancelled) return;
        console.error('Destination load failed:', loadError);
        setOverview(null);
        setRecommendations([]);
        setError('לא הצלחנו לטעון את היעד כרגע.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [cityId, countryId, preferencesCompleted]);

  return {
    overview,
    cityData: overview?.destination || null,
    countryData: overview?.destination
      ? { name: overview.destination.countryName }
      : null,
    recommendations,
    loading,
    error,
  };
};
