import { useCallback, useEffect, useRef, useState } from 'react';

import {
  finalizeDestinationChoice,
  resolveDestinationForPlacePreview,
  searchPlaces,
} from '../services/LocationService';
import { locationErrorMessage, locationErrorRetryable } from '../utils/locationErrors';

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

export default function useExactPlaceSelection({ value = null, onChange, locale = 'he' } = {}) {
  const [locationQuery, setLocationQuery] = useState(() => queryForValue(value));
  const [selectedCountry, setSelectedCountry] = useState(() => countryForValue(value));
  const [selectedCity, setSelectedCity] = useState(() => cityForValue(value));
  const [selectedPlace, setSelectedPlace] = useState(() => value?.place || null);
  const [pendingLocation, setPendingLocation] = useState(null);
  const [destinationChoice, setDestinationChoice] = useState(null);
  const [lastSelection, setLastSelection] = useState(null);
  const [locationResolveError, setLocationResolveError] = useState(null);
  const [locationResolveRetryable, setLocationResolveRetryable] = useState(false);
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
    setPendingLocation(null);
    setDestinationChoice(null);
    setLastSelection(null);
    setLocationResolveError(null);
    setLocationResolveRetryable(false);
    setResolvingLocation(false);
    if (emit) onChange?.(buildExactPlaceValue(country, city, place));
  }, [onChange]);

  const clearSelectionForTyping = useCallback((text) => {
    const hadConfirmedSelection = Boolean(selectedCountry || selectedCity || selectedPlace);
    resolutionGenerationRef.current += 1;
    setLocationQuery(text);
    setSelectedCountry(null);
    setSelectedCity(null);
    setSelectedPlace(null);
    setPendingLocation(null);
    setDestinationChoice(null);
    setLastSelection(null);
    setLocationResolveError(null);
    setLocationResolveRetryable(false);
    setResolvingLocation(false);
    if (hadConfirmedSelection) onChange?.(null);
  }, [onChange, selectedCity, selectedCountry, selectedPlace]);

  const handleSelectGooglePlace = useCallback(async (selection) => {
    const generation = ++resolutionGenerationRef.current;
    setLastSelection(selection);
    setResolvingLocation(true);
    setLocationResolveError(null);
    setLocationResolveRetryable(false);
    try {
      const result = await resolveDestinationForPlacePreview(selection);
      if (!mountedRef.current || generation !== resolutionGenerationRef.current) return null;
      if (result?.status === 'destination_choice_required') {
        setDestinationChoice(result);
        setPendingLocation(null);
        return null;
      }
      const nextValue = buildExactPlaceValue(
        result.destination.country,
        result.destination.city,
        result.place
      );
      setPendingLocation(nextValue);
      setDestinationChoice(null);
      setLocationQuery(result.place?.name || result.place?.address || locationQuery);
      return nextValue;
    } catch (error) {
      if (!mountedRef.current || generation !== resolutionGenerationRef.current) return null;
      setPendingLocation(null);
      setDestinationChoice(null);
      const message = locationErrorMessage(error, locale);
      setLocationResolveError(message);
      setLocationResolveRetryable(locationErrorRetryable(error));
      throw Object.assign(error instanceof Error ? error : new Error(message), {
        userMessage: message,
      });
    } finally {
      if (mountedRef.current && generation === resolutionGenerationRef.current) {
        setResolvingLocation(false);
      }
    }
  }, [locale, locationQuery]);

  const confirmPendingLocation = useCallback(() => {
    if (!pendingLocation) return null;
    const country = countryForValue(pendingLocation);
    const city = cityForValue(pendingLocation);
    const place = pendingLocation.place || null;
    setSelectedCountry(country);
    setSelectedCity(city);
    setSelectedPlace(place);
    setPendingLocation(null);
    setLastSelection(null);
    setLocationResolveError(null);
    setLocationResolveRetryable(false);
    setLocationQuery(place?.name || place?.address || city?.name || locationQuery);
    const confirmed = buildExactPlaceValue(country, city, place);
    onChange?.(confirmed);
    return confirmed;
  }, [locationQuery, onChange, pendingLocation]);

  const chooseAnotherLocation = useCallback(() => {
    resolutionGenerationRef.current += 1;
    setPendingLocation(null);
    setDestinationChoice(null);
    setLastSelection(null);
    setLocationResolveError(null);
    setLocationResolveRetryable(false);
    setResolvingLocation(false);
  }, []);

  const chooseDestination = useCallback(async (destinationChoiceId) => {
    if (!destinationChoice?.resolutionId || !destinationChoiceId) return null;
    const generation = ++resolutionGenerationRef.current;
    setResolvingLocation(true);
    setLocationResolveError(null);
    setLocationResolveRetryable(false);
    try {
      const result = await finalizeDestinationChoice({
        resolutionId: destinationChoice.resolutionId,
        destinationChoiceId,
        incidentId: destinationChoice.incidentId,
      });
      if (!mountedRef.current || generation !== resolutionGenerationRef.current) return null;
      const nextValue = buildExactPlaceValue(
        result.destination.country,
        result.destination.city,
        result.place
      );
      setPendingLocation(nextValue);
      setDestinationChoice(null);
      setLocationQuery(result.place?.name || result.place?.address || locationQuery);
      return nextValue;
    } catch (error) {
      if (!mountedRef.current || generation !== resolutionGenerationRef.current) return null;
      const message = locationErrorMessage(error, locale);
      setLocationResolveError(message);
      setLocationResolveRetryable(locationErrorRetryable(error));
      throw Object.assign(error instanceof Error ? error : new Error(message), {
        userMessage: message,
      });
    } finally {
      if (mountedRef.current && generation === resolutionGenerationRef.current) {
        setResolvingLocation(false);
      }
    }
  }, [destinationChoice, locale, locationQuery]);

  const retryLocationResolution = useCallback(() => {
    if (!lastSelection) return Promise.resolve(null);
    return handleSelectGooglePlace(lastSelection);
  }, [handleSelectGooglePlace, lastSelection]);

  const googleSearchFn = useCallback(
    (text, options) => searchPlaces(text, { ...options, types: 'all' }),
    []
  );

  return {
    clearSelectionForTyping,
    chooseDestination,
    chooseAnotherLocation,
    confirmPendingLocation,
    googleSearchFn,
    handleSelectGooglePlace,
    hydrateSelection,
    locationQuery,
    locationResolveError,
    locationResolveRetryable,
    destinationChoice,
    pendingLocation,
    resolvingPreview: lastSelection,
    resolutionGenerationRef,
    resolvingLocation,
    retryLocationResolution,
    selectedCity,
    selectedCountry,
    selectedPlace,
  };
}
