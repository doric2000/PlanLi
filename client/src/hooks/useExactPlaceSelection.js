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
    ? {
        ...value.city,
        ...((value.city.googlePlaceId || value.city.providerPlaceId ||
          value?.destination?.providerPlaceId || value?.destinationProviderPlaceId)
          ? {
              googlePlaceId: value.city.googlePlaceId || value.city.providerPlaceId ||
                value?.destination?.providerPlaceId || value?.destinationProviderPlaceId,
            }
          : {}),
      }
    : value?.cityId
      ? {
          id: value.cityId,
          name: value.location || value.cityName || value.cityId,
          googlePlaceId: value.destination?.providerPlaceId || value.destinationProviderPlaceId || null,
        }
      : null;

const destinationChoiceExpired = (error) => {
  const code = String(error?.code || '');
  const reason = String(error?.details?.reason || '');
  return code.includes('not-found') || code.includes('deadline-exceeded') ||
    /expired/i.test(reason) || /expired/i.test(String(error?.message || ''));
};

export const buildExactPlaceValue = (country, city, place) => {
  if (!country?.id || !city?.id || !place?.placeId) return null;
  const providerPlaceId = city.googlePlaceId || city.providerPlaceId || '';
  return {
    location: city.name || city.id,
    country: country.name || country.id,
    countryId: country.id,
    cityId: city.id,
    destination: {
      countryId: country.id,
      cityId: city.id,
      countryName: country.name || country.id,
      cityName: city.name || city.id,
      ...(providerPlaceId ? { provider: 'google', providerPlaceId } : {}),
    },
    place,
  };
};

const durableProviderSelection = (selection) => {
  const providerPlaceId = selection?.providerPlaceId || selection?.place_id || '';
  if (!providerPlaceId) return selection;
  return {
    provider: 'google',
    providerPlaceId,
    place_id: providerPlaceId,
    description: selection?.description || selection?.text || '',
    types: Array.isArray(selection?.types) ? selection.types : [],
  };
};

async function resolveSelectionWithExpiryRecovery(selection) {
  try {
    return await resolveDestinationForPlacePreview(selection);
  } catch (error) {
    if (!destinationChoiceExpired(error)) throw error;
    const durableSelection = durableProviderSelection(selection);
    if (durableSelection === selection) throw error;
    return resolveDestinationForPlacePreview(durableSelection);
  }
}

const coordinatesForDestination = (destination) => {
  const rawLat = destination?.coordinates?.lat ?? destination?.coordinates?.latitude;
  const rawLng = destination?.coordinates?.lng ?? destination?.coordinates?.longitude;
  const lat = rawLat == null || rawLat === '' ? NaN : Number(rawLat);
  const lng = rawLng == null || rawLng === '' ? NaN : Number(rawLng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  const southwest = destination?.viewport?.southwest;
  const northeast = destination?.viewport?.northeast;
  const rawValues = [southwest?.lat, southwest?.lng, northeast?.lat, northeast?.lng];
  if (rawValues.some((value) => value == null || value === '')) return null;
  const values = rawValues.map(Number);
  if (!values.every(Number.isFinite)) return null;
  return { lat: (values[0] + values[2]) / 2, lng: (values[1] + values[3]) / 2 };
};

export default function useExactPlaceSelection({
  value = null,
  onChange,
  locale = 'he',
  preferredDestination = null,
} = {}) {
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

  const commitResolvedLocation = useCallback((nextValue, fallbackQuery = '') => {
    if (!nextValue) return null;
    const country = countryForValue(nextValue);
    const city = cityForValue(nextValue);
    const place = nextValue.place || null;
    if (!country?.id || !city?.id || !place?.placeId) return null;
    setSelectedCountry(country);
    setSelectedCity(city);
    setSelectedPlace(place);
    setPendingLocation(null);
    setDestinationChoice(null);
    setLastSelection(null);
    setLocationResolveError(null);
    setLocationResolveRetryable(false);
    setLocationQuery(place.name || place.address || city.name || fallbackQuery);
    const confirmed = buildExactPlaceValue(country, city, place);
    onChange?.(confirmed);
    return confirmed;
  }, [onChange]);

  const handleSelectGooglePlace = useCallback(async (selection, { autoConfirm = false } = {}) => {
    const generation = ++resolutionGenerationRef.current;
    setLastSelection(selection);
    setResolvingLocation(true);
    setLocationResolveError(null);
    setLocationResolveRetryable(false);
    try {
      const result = await resolveSelectionWithExpiryRecovery(selection);
      if (!mountedRef.current || generation !== resolutionGenerationRef.current) return null;
      if (result?.status === 'destination_choice_required') {
        if (preferredDestination?.countryId && preferredDestination?.cityId) {
          try {
            const preferredSelection = preferredDestination.resolvedPlaceToken
              ? { destinationResolvedPlaceToken: preferredDestination.resolvedPlaceToken }
              : { destinationRef: {
                  countryId: preferredDestination.countryId,
                  cityId: preferredDestination.cityId,
                } };
            const preferredResult = await finalizeDestinationChoice({
              resolutionId: result.resolutionId,
              incidentId: result.incidentId,
              ...preferredSelection,
            });
            if (!mountedRef.current || generation !== resolutionGenerationRef.current) return null;
            const preferredValue = buildExactPlaceValue(
              preferredResult.destination.country,
              preferredResult.destination.city,
              preferredResult.place
            );
            if (autoConfirm) commitResolvedLocation(preferredValue, locationQuery);
            else {
              setPendingLocation(preferredValue);
              setDestinationChoice(null);
              setLocationQuery(preferredResult.place?.name || preferredResult.place?.address || locationQuery);
            }
            return preferredValue;
          } catch {
            // The preferred route destination is only a quiet shortcut. Country
            // and geometry validation remain authoritative; on mismatch the
            // existing destination picker is shown unchanged.
          }
        }
        setDestinationChoice(result);
        setPendingLocation(result.place ? { place: result.place } : null);
        return null;
      }
      const nextValue = buildExactPlaceValue(
        result.destination.country,
        result.destination.city,
        result.place
      );
      if (autoConfirm) commitResolvedLocation(nextValue, locationQuery);
      else {
        setPendingLocation(nextValue);
        setDestinationChoice(null);
        setLocationQuery(result.place?.name || result.place?.address || locationQuery);
      }
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
  }, [commitResolvedLocation, locale, locationQuery, preferredDestination]);

  const confirmPendingLocation = useCallback(() => {
    if (!pendingLocation) return null;
    return commitResolvedLocation(pendingLocation, locationQuery);
  }, [commitResolvedLocation, locationQuery, pendingLocation]);

  const chooseAnotherLocation = useCallback(() => {
    resolutionGenerationRef.current += 1;
    setPendingLocation(null);
    setDestinationChoice(null);
    setLastSelection(null);
    setLocationResolveError(null);
    setLocationResolveRetryable(false);
    setResolvingLocation(false);
  }, []);

  const chooseDestination = useCallback(async (destinationChoiceId, { autoConfirm = false } = {}) => {
    if (!destinationChoice?.resolutionId || !destinationChoiceId) return null;
    const generation = ++resolutionGenerationRef.current;
    setResolvingLocation(true);
    setLocationResolveError(null);
    setLocationResolveRetryable(false);
    try {
      let result;
      try {
        result = await finalizeDestinationChoice({
          resolutionId: destinationChoice.resolutionId,
          destinationChoiceId,
          incidentId: destinationChoice.incidentId,
        });
      } catch (error) {
        if (!destinationChoiceExpired(error) || !lastSelection) throw error;
        const selectedAlternative = (destinationChoice.alternatives || [])
          .find((alternative) => alternative.destinationChoiceId === destinationChoiceId);
        const refreshed = await resolveSelectionWithExpiryRecovery(lastSelection);
        if (refreshed?.status === 'resolved') {
          result = refreshed;
        } else {
          const replacement = (refreshed?.alternatives || []).find((alternative) =>
            alternative.countryId === selectedAlternative?.countryId &&
            alternative.cityId === selectedAlternative?.cityId
          );
          if (!replacement) throw error;
          setDestinationChoice(refreshed);
          result = await finalizeDestinationChoice({
            resolutionId: refreshed.resolutionId,
            destinationChoiceId: replacement.destinationChoiceId,
            incidentId: refreshed.incidentId,
          });
        }
      }
      if (!mountedRef.current || generation !== resolutionGenerationRef.current) return null;
      const nextValue = buildExactPlaceValue(
        result.destination.country,
        result.destination.city,
        result.place
      );
      if (autoConfirm) commitResolvedLocation(nextValue, locationQuery);
      else {
        setPendingLocation(nextValue);
        setDestinationChoice(null);
        setLocationQuery(result.place?.name || result.place?.address || locationQuery);
      }
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
  }, [commitResolvedLocation, destinationChoice, lastSelection, locale, locationQuery]);

  const chooseFallbackDestination = useCallback(async (destination, { autoConfirm = false } = {}) => {
    if (!destinationChoice?.resolutionId || !destination?.countryId || !destination?.cityId) return null;
    const generation = ++resolutionGenerationRef.current;
    setResolvingLocation(true);
    setLocationResolveError(null);
    setLocationResolveRetryable(false);
    try {
      const destinationSelection = destination.resolvedPlaceToken
        ? { destinationResolvedPlaceToken: destination.resolvedPlaceToken }
        : { destinationRef: { countryId: destination.countryId, cityId: destination.cityId } };
      let result;
      try {
        result = await finalizeDestinationChoice({
          resolutionId: destinationChoice.resolutionId,
          incidentId: destinationChoice.incidentId,
          ...destinationSelection,
        });
      } catch (error) {
        if (!destinationChoiceExpired(error) || !lastSelection) throw error;
        const refreshed = await resolveSelectionWithExpiryRecovery(lastSelection);
        if (refreshed?.status === 'resolved') {
          result = refreshed;
        } else if (refreshed?.status === 'destination_choice_required') {
          setDestinationChoice(refreshed);
          result = await finalizeDestinationChoice({
            resolutionId: refreshed.resolutionId,
            incidentId: refreshed.incidentId,
            ...destinationSelection,
          });
        } else {
          throw error;
        }
      }
      if (!mountedRef.current || generation !== resolutionGenerationRef.current) return null;
      const nextValue = buildExactPlaceValue(
        result.destination.country,
        result.destination.city,
        result.place
      );
      if (autoConfirm) commitResolvedLocation(nextValue, locationQuery);
      else {
        setPendingLocation(nextValue);
        setDestinationChoice(null);
        setLocationQuery(result.place?.name || result.place?.address || locationQuery);
      }
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
  }, [commitResolvedLocation, destinationChoice, lastSelection, locale, locationQuery]);

  const retryLocationResolution = useCallback((options) => {
    if (!lastSelection) return Promise.resolve(null);
    return handleSelectGooglePlace(lastSelection, options);
  }, [handleSelectGooglePlace, lastSelection]);

  const googleSearchFn = useCallback(
    (text, options) => searchPlaces(text, {
      ...options,
      types: 'all',
      locationBias: coordinatesForDestination(preferredDestination),
    }),
    [preferredDestination]
  );

  return {
    clearSelectionForTyping,
    chooseDestination,
    chooseFallbackDestination,
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
