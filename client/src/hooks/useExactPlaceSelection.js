import { useCallback, useEffect, useRef, useState } from 'react';

import {
  resolveDestinationForPlacePreview,
  searchPlaces,
} from '../services/LocationService';
import { locationErrorMessage } from '../utils/locationErrors';

const queryForValue = (value) =>
  value?.query || value?.place?.name || value?.place?.address || value?.location || '';

const countryForValue = (value) =>
  value?.country?.id
    ? value.country
    : value?.countryId
      ? { id: value.countryId, name: value.country || value.countryName || value.countryId }
      : null;

const cityForValue = (value) =>
  value?.city?.id
    ? value.city
    : value?.cityId
      ? { id: value.cityId, name: value.location || value.cityName || value.cityId }
      : null;

export const buildExactPlaceValue = (country, city, place) => {
  if (!country?.id || !city?.id || !place?.placeId) return null;
  return {
    location: city.name || city.id,
    country: country.name || country.id,
    countryId: country.id,
    cityId: city.id,
    place,
  };
};

export default function useExactPlaceSelection({ value = null, onChange } = {}) {
  const [locationQuery, setLocationQuery] = useState(() => queryForValue(value));
  const [selectedCountry, setSelectedCountry] = useState(() => countryForValue(value));
  const [selectedCity, setSelectedCity] = useState(() => cityForValue(value));
  const [selectedPlace, setSelectedPlace] = useState(() => value?.place || null);
  const [locationResolveError, setLocationResolveError] = useState(null);
  const [resolvingLocation, setResolvingLocation] = useState(false);
  const resolutionGenerationRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      resolutionGenerationRef.current += 1;
    };
  }, []);

  const hydrateSelection = useCallback((nextValue, { emit = false } = {}) => {
    resolutionGenerationRef.current += 1;
    const country = countryForValue(nextValue);
    const city = cityForValue(nextValue);
    const place = nextValue?.place || null;
    setLocationQuery(queryForValue(nextValue));
    setSelectedCountry(country);
    setSelectedCity(city);
    setSelectedPlace(place);
    setLocationResolveError(null);
    setResolvingLocation(false);
    if (emit) onChange?.(buildExactPlaceValue(country, city, place));
  }, [onChange]);

  const clearSelectionForTyping = useCallback((text) => {
    resolutionGenerationRef.current += 1;
    setLocationQuery(text);
    setSelectedCountry(null);
    setSelectedCity(null);
    setSelectedPlace(null);
    setLocationResolveError(null);
    setResolvingLocation(false);
    onChange?.(null);
  }, [onChange]);

  const handleSelectGooglePlace = useCallback(async (placeId) => {
    const generation = ++resolutionGenerationRef.current;
    setResolvingLocation(true);
    setLocationResolveError(null);
    try {
      const result = await resolveDestinationForPlacePreview(placeId);
      if (!mountedRef.current || generation !== resolutionGenerationRef.current) return null;
      setSelectedCountry(result.destination.country);
      setSelectedCity(result.destination.city);
      setSelectedPlace(result.place);
      setLocationQuery(result.place?.name || result.place?.address || locationQuery);
      const nextValue = buildExactPlaceValue(
        result.destination.country,
        result.destination.city,
        result.place
      );
      onChange?.(nextValue);
      return nextValue;
    } catch (error) {
      if (!mountedRef.current || generation !== resolutionGenerationRef.current) return null;
      setSelectedCountry(null);
      setSelectedCity(null);
      setSelectedPlace(null);
      onChange?.(null);
      const message = locationErrorMessage(error);
      setLocationResolveError(message);
      throw Object.assign(error instanceof Error ? error : new Error(message), {
        userMessage: message,
      });
    } finally {
      if (mountedRef.current && generation === resolutionGenerationRef.current) {
        setResolvingLocation(false);
      }
    }
  }, [locationQuery, onChange]);

  const googleSearchFn = useCallback(
    (text, options) => searchPlaces(text, { ...options, types: 'all' }),
    []
  );

  return {
    clearSelectionForTyping,
    googleSearchFn,
    handleSelectGooglePlace,
    hydrateSelection,
    locationQuery,
    locationResolveError,
    resolutionGenerationRef,
    resolvingLocation,
    selectedCity,
    selectedCountry,
    selectedPlace,
  };
}
