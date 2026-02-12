import { collection, query, where, getDocs, doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Platform } from 'react-native';
import * as ExpoLocation from 'expo-location';

const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY;
// Web uses an Express proxy (see /server/server.js) to avoid browser CORS.
// Default server port is 5000; Expo/Metro typically runs on 8081 (which would return HTML).
const PLACES_PROXY_BASE_URL =
  process.env.EXPO_PUBLIC_PLACES_PROXY_BASE_URL ||
  (Platform.OS === 'web' ? 'http://localhost:5000' : '');

const parseJsonResponse = async (response) => {
  const contentType = response.headers?.get?.('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }

  const text = await response.text();
  const snippet = String(text || '').slice(0, 140);
  const err = new Error(
    `Expected JSON but got ${contentType || 'unknown content-type'} (HTTP ${response.status}). ` +
      `Response starts with: ${JSON.stringify(snippet)}`
  );
  err.status = response.status;
  err.contentType = contentType;
  throw err;
};

const fetchPlacesAutocomplete = async (searchText, { signal, types = '(cities)' } = {}) => {
  // On web, call our own server to avoid browser CORS restrictions.
  if (Platform.OS === 'web') {
    const base = `${PLACES_PROXY_BASE_URL}/api/places/autocomplete?input=${encodeURIComponent(searchText)}`;
    const url = types ? `${base}&types=${encodeURIComponent(types)}` : base;
    const response = await fetch(url, { signal });
    return parseJsonResponse(response);
  }

  // Native can call Google directly (no browser CORS).
  const params = new URLSearchParams();
  params.set('input', searchText);
  if (types && String(types).toLowerCase() !== 'all') {
    params.set('types', types);
  }
  params.set('language', 'he');
  params.set('key', GOOGLE_API_KEY);
  const response = await fetch(`https://maps.googleapis.com/maps/api/place/autocomplete/json?${params.toString()}`, { signal });
  return parseJsonResponse(response);
};

const fetchPlacesTextSearch = async (searchText, { signal } = {}) => {
  if (Platform.OS === 'web') {
    const url = `${PLACES_PROXY_BASE_URL}/api/places/textsearch?query=${encodeURIComponent(searchText)}`;
    const response = await fetch(url, { signal });
    return parseJsonResponse(response);
  }

  const params = new URLSearchParams();
  params.set('query', searchText);
  params.set('language', 'he');
  params.set('key', GOOGLE_API_KEY);
  const response = await fetch(`https://maps.googleapis.com/maps/api/place/textsearch/json?${params.toString()}`, { signal });
  return parseJsonResponse(response);
};

export const fetchPlaceDetails = async (placeId, { fields } = {}) => {
  if (Platform.OS === 'web') {
    const base = `${PLACES_PROXY_BASE_URL}/api/places/details?placeId=${encodeURIComponent(placeId)}`;
    const url = fields ? `${base}&fields=${encodeURIComponent(fields)}` : base;
    const response = await fetch(url);
    return parseJsonResponse(response);
  }

  const resolvedFields =
    fields || 'name,formatted_address,address_components,geometry,photos,rating,place_id,url';

  const response = await fetch(
    `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=${encodeURIComponent(resolvedFields)}&language=he&key=${GOOGLE_API_KEY}`
  );
  return parseJsonResponse(response);
};

/**
 * 1. AUTOCOMPLETE SEARCH
 */
export const searchCities = async (searchText, { signal } = {}) => {
  if (!searchText || searchText.length < 2) return [];

  try {
    const data = await fetchPlacesAutocomplete(searchText, { signal, types: '(cities)' });
    return data?.predictions || [];
  } catch (error) {
    // Abort is expected when user keeps typing.
    if (error?.name === 'AbortError') return [];
    console.error("Error fetching city predictions:", error);
    return [];
  }
};

/**
 * AUTOCOMPLETE SEARCH (generic places)
 * Use with types='all' (no restriction) or a specific type like 'establishment'.
 */
export const searchPlaces = async (searchText, { signal, types = 'all' } = {}) => {
  if (!searchText || searchText.length < 2) return [];

  try {
    const data = await fetchPlacesAutocomplete(searchText, { signal, types });
    const predictions = Array.isArray(data?.predictions) ? data.predictions : [];
    if (predictions.length > 0) return predictions;

    // Autocomplete is often strict about requiring a real place name.
    // For general queries (category + city), fall back to Text Search.
    const textData = await fetchPlacesTextSearch(searchText, { signal });
    const results = Array.isArray(textData?.results) ? textData.results : [];
    return results
      .filter((r) => r?.place_id)
      .map((r) => ({
        place_id: r.place_id,
        description: [r.name, r.formatted_address].filter(Boolean).join(' — '),
      }));
  } catch (error) {
    if (error?.name === 'AbortError') return [];
    console.error('Error fetching place predictions:', error);
    return [];
  }
};

const parsePlaceDetailsBasics = (result) => {
  if (!result) return null;

  const addressComponents = Array.isArray(result.address_components) ? result.address_components : [];
  const countryComp = addressComponents.find((c) => c.types?.includes('country'));

  const findByTypePriority = (priorities) => {
    for (const type of priorities) {
      const match = addressComponents.find((c) => Array.isArray(c.types) && c.types.includes(type));
      if (match) return match;
    }
    return null;
  };

  const splitAddressParts = (formattedAddress) => {
    if (!formattedAddress || typeof formattedAddress !== 'string') return [];
    return formattedAddress
      .split(',')
      .map((p) => String(p).trim())
      .filter(Boolean);
  };

  // Heuristic: for Hebrew/English UI, these are common country tokens that may appear
  // as the last segment in formatted_address.
  const KNOWN_COUNTRY_TOKENS = new Set([
    'Israel',
    'State of Israel',
    'ישראל',
  ]);

  // IMPORTANT: Don't treat neighborhoods/sublocalities as the "city".
  // Prefer real city-level components first, then fall back to broader admin areas.
  const realCityComp =
    findByTypePriority(['locality', 'postal_town']) ||
    findByTypePriority(['administrative_area_level_3', 'administrative_area_level_2', 'administrative_area_level_1']);

  const neighborhoodComp = findByTypePriority(['sublocality', 'neighborhood']);

  const addressParts = splitAddressParts(result.formatted_address);
  const lastPart = addressParts.length >= 1 ? addressParts[addressParts.length - 1] : null;
  const lastIsKnownCountry = !!lastPart && KNOWN_COUNTRY_TOKENS.has(lastPart);

  // Only trust formatted_address for country when:
  // - it has 3+ parts (e.g. neighborhood, city, country), OR
  // - the last part is a known country token.
  const formattedCountry =
    addressParts.length >= 3
      ? lastPart
      : lastIsKnownCountry
        ? lastPart
        : null;

  // City heuristics:
  // - For 3+ parts: city is second-to-last.
  // - For 2 parts:
  //    - If last is a known country: city is first.
  //    - Else assume it's "neighborhood, city" => city is last.
  const formattedCity =
    addressParts.length >= 3
      ? addressParts[addressParts.length - 2]
      : addressParts.length === 2
        ? (lastIsKnownCountry ? addressParts[0] : lastPart)
        : null;

  const countryName = countryComp?.long_name || formattedCountry || null;
  const countryCode = countryComp?.short_name || null;

  // If only a neighborhood is available, try to derive the city from the formatted address
  // (e.g. "נווה שאנן, אריאל, ישראל" => city="אריאל").
  const cityName =
    realCityComp?.long_name ||
    (neighborhoodComp ? (formattedCity || null) : null) ||
    formattedCity ||
    neighborhoodComp?.long_name ||
    result.name ||
    null;

  const lat = result?.geometry?.location?.lat;
  const lng = result?.geometry?.location?.lng;

  return {
    placeId: result.place_id,
    name: result.name || null,
    address: result.formatted_address || null,
    url: result.url || null,
    coordinates:
      typeof lat === 'number' && typeof lng === 'number'
        ? { lat, lng }
        : null,
    countryName,
    countryCode,
    cityName,
  };
};

/**
 * HELPER: Fetch Metadata
 */
const fetchCountryMetadata = async ({ countryName, countryCode }) => {
  try {
    // Prefer ISO code lookup because display names may be localized (Hebrew).
    // RestCountries alpha endpoint is stable for this.
    let country = null;

    if (countryCode) {
      const alphaRes = await fetch(`https://restcountries.com/v3.1/alpha/${countryCode}`);
      const alphaData = await alphaRes.json();
      country = Array.isArray(alphaData) ? alphaData[0] : null;
    }

    // Fallback: try name search without fullText (more forgiving)
    if (!country && countryName) {
      const nameRes = await fetch(`https://restcountries.com/v3.1/name/${encodeURIComponent(countryName)}`);
      const nameData = await nameRes.json();
      country = Array.isArray(nameData) ? nameData[0] : null;
    }

    if (!country) return { currencyCode: "USD", region: "Global" };
    
    return {
      currencyCode: country.currencies ? Object.keys(country.currencies)[0] : "USD",
      region: country.region || "Global",
    };
  } catch (error) {
    return { currencyCode: "USD", region: "Global" };
  }
};

/**
 * 2. GET OR CREATE DESTINATION
 * Uses Name as ID for BOTH Country and City.
 */
export const getOrCreateDestination = async (placeId) => {
  try {
    // A. Fetch from Google
    const data = await fetchPlaceDetails(placeId);
    const result = data.result;
    
    if (!result) throw new Error("Google Places API returned no result.");

    const parsed = parsePlaceDetailsBasics(result);

    // Some places (e.g. disputed territories) may omit country in Places details.
    // If we have coordinates, resolve country via reverse geocoding.
    if (!parsed?.countryName && parsed?.coordinates) {
      const resolved = await resolveCountryFromCoordinates(parsed.coordinates);
      if (resolved?.countryName || resolved?.countryCode) {
        parsed.countryName = parsed.countryName || resolved.countryName;
        parsed.countryCode = parsed.countryCode || resolved.countryCode;
      }
    }

    if (!parsed?.countryName) {
      alert('Could not detect Country.');
      return null;
    }

    const countryName = parsed.countryName;
    const countryCode = parsed.countryCode;
    const cityName = parsed.cityName;

    // C. FIND OR CREATE COUNTRY
    // Prefer an existing country doc (to avoid creating duplicates) by matching the ISO code.
    let countryId = countryName;
    const existingCountryByCodeQ = query(collection(db, 'countries'), where('code', '==', countryCode));
    const existingCountryByCodeSnap = await getDocs(existingCountryByCodeQ);
    if (!existingCountryByCodeSnap.empty) {
      countryId = existingCountryByCodeSnap.docs[0].id;
    }

    const countryDocRef = doc(db, 'countries', countryId);
    const countrySnap = await getDoc(countryDocRef);

    if (!countrySnap.exists()) {
      const metadata =
        (await fetchCountryMetadata({ countryName, countryCode })) ||
        { currencyCode: 'USD', region: 'Global' };
      await setDoc(countryDocRef, {
        name: countryName,
        code: countryCode,
        region: metadata.region, 
        currencyCode: metadata.currencyCode
      });
      console.log(`Created new country: ${countryId}`);
    } else {
      // Keep the doc ID stable, refresh display name in Hebrew,
      // and fix currency/region if they were saved with fallback defaults.
      const existing = countrySnap.data() || {};
      const needsCurrencyFix =
        !existing.currencyCode ||
        (existing.currencyCode === 'USD' && countryCode !== 'US');
      const needsRegionFix = !existing.region || existing.region === 'Global';

      const patch = { name: countryName, code: countryCode };
      if (needsCurrencyFix || needsRegionFix) {
        const metadata =
          (await fetchCountryMetadata({ countryName, countryCode })) ||
          { currencyCode: 'USD', region: 'Global' };
        if (needsCurrencyFix) patch.currencyCode = metadata.currencyCode;
        if (needsRegionFix) patch.region = metadata.region;
      }

      await setDoc(countryDocRef, patch, { merge: true });
    }

    // D. FIND OR CREATE CITY
    // Prefer an existing city doc by matching googlePlaceId to avoid duplicates.
    const citiesRef = collection(db, 'countries', countryId, 'cities');
    let cityId = cityName;
    const existingCityQ = query(citiesRef, where('googlePlaceId', '==', result.place_id));
    const existingCitySnap = await getDocs(existingCityQ);
    if (!existingCitySnap.empty) {
      cityId = existingCitySnap.docs[0].id;
    }

    const cityDocRef = doc(db, 'countries', countryId, 'cities', cityId);
    const citySnap = await getDoc(cityDocRef);

    let createdCityData = null;

    if (!citySnap.exists()) {
      // Prepare Image
      const photoRef = result.photos ? result.photos[0].photo_reference : null;
      const fallbackImageUrl = 'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=800';

      // On web, avoid storing Google Places Photo URLs (they can create many billable photo requests
      // when rendering lists, and they don't go through our server logs).
      const imageUrl = (photoRef && Platform.OS !== 'web')
          ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=${photoRef}&key=${GOOGLE_API_KEY}`
          : fallbackImageUrl;

      // Create City Doc using SETDOC (custom ID) instead of ADDDOC (random ID)
      createdCityData = {
          name: cityName,
          description: result.formatted_address,
          googlePlaceId: result.place_id,
          rating: result.rating || 0,
          travelers: 0,
          imageUrl: imageUrl,
          coordinates: {
              lat: result.geometry.location.lat,
              lng: result.geometry.location.lng
          }
      };

      await setDoc(cityDocRef, createdCityData);
      console.log(`Created new city: ${cityId}`);
    } else {
      // Refresh display fields in Hebrew; keep existing imageUrl/travelers/rating, etc.
      await setDoc(cityDocRef, {
        name: cityName,
        description: result.formatted_address,
        googlePlaceId: result.place_id,
      }, { merge: true });
    }

    const finalCitySnap = await getDoc(cityDocRef);
    const finalCityData = finalCitySnap.exists() ? finalCitySnap.data() : (createdCityData || null);

    // E. RETURN FULL OBJECTS
    return { 
        country: { id: countryId, name: countryName }, 
      city: { id: cityId, ...(finalCityData || { name: cityName }) } 
    };

  } catch (error) {
    console.error("Error in getOrCreateDestination:", error);
    throw error;
  }
};

/**
 * For an exact (non-city) place selection:
 * - fetch details once
 * - derive country/city
 * - ensure destination docs exist (country + city)
 * - return destination ids + a recommendation-ready place payload
 */
export const getOrCreateDestinationForPlace = async (placeId, { countryOverride } = {}) => {
  const fields = 'name,formatted_address,address_components,geometry,place_id,url';
  const details = await fetchPlaceDetails(placeId, { fields });
  const result = details?.result;
  if (!result) throw new Error('Google Places API returned no result.');

  const parsed = parsePlaceDetailsBasics(result);

  // If Google itself returns a disputed/ambiguous country label, require manual confirmation.
  if (parsed?.countryName && !countryOverride && isDisputedOrAmbiguousCountryName(parsed.countryName)) {
    const err = new Error('Country is disputed/ambiguous for this place.');
    err.code = 'DISPUTED_COUNTRY';
    err.parsed = parsed;
    err.suggestedCountry = { name: parsed.countryName, code: parsed.countryCode || null };
    throw err;
  }

  if (parsed?.coordinates && (!parsed?.countryName || !parsed?.countryCode)) {
    const resolved = await resolveCountryFromCoordinates(parsed.coordinates);
    if (resolved?.countryName || resolved?.countryCode) {
      // If reverse-geocode resolves to a disputed/ambiguous country label, require manual confirmation.
      if (!countryOverride && resolved?.countryName && isDisputedOrAmbiguousCountryName(resolved.countryName)) {
        const err = new Error('Country is disputed/ambiguous for this place.');
        err.code = 'DISPUTED_COUNTRY';
        err.parsed = parsed;
        err.suggestedCountry = { name: resolved.countryName, code: resolved.countryCode || null };
        throw err;
      }

      parsed.countryName = parsed.countryName || resolved.countryName;
      parsed.countryCode = parsed.countryCode || resolved.countryCode;
    }
  }

  if (!parsed?.countryName && countryOverride) {
    const overrideName = typeof countryOverride === 'string' ? countryOverride : (countryOverride?.name || countryOverride?.countryName || null);
    const overrideCode = typeof countryOverride === 'object' ? (countryOverride?.code || countryOverride?.countryCode || null) : null;
    if (overrideName) parsed.countryName = overrideName;
    if (overrideCode) parsed.countryCode = String(overrideCode).toUpperCase();
  }

  if (parsed?.countryName && countryOverride) {
    // Explicit override wins.
    const overrideName = typeof countryOverride === 'string' ? countryOverride : (countryOverride?.name || countryOverride?.countryName || null);
    const overrideCode = typeof countryOverride === 'object' ? (countryOverride?.code || countryOverride?.countryCode || null) : null;
    if (overrideName) parsed.countryName = overrideName;
    if (overrideCode) parsed.countryCode = String(overrideCode).toUpperCase();
  }

  if (!parsed?.cityName) {
    const err = new Error('Could not derive city from place details.');
    err.code = 'MISSING_CITY';
    err.parsed = parsed;
    throw err;
  }

  if (!parsed?.countryName) {
    const err = new Error('Could not derive country from place details.');
    err.code = 'MISSING_COUNTRY';
    err.parsed = parsed;
    throw err;
  }

  // Resolve the "real" city place_id so we can:
  // - avoid duplicate city docs across languages (Hebrew vs English ids)
  // - reuse existing city docs keyed by googlePlaceId
  // - get the best localized city name from Google
  let destination = null;
  try {
    const cityQuery = [parsed.cityName, parsed.countryName].filter(Boolean).join(' ');
    const cityPredictions = await fetchPlacesAutocomplete(cityQuery, { types: '(cities)' });
    const cityPlaceId = cityPredictions?.predictions?.[0]?.place_id;
    if (cityPlaceId) {
      destination = await getOrCreateDestination(cityPlaceId);
    }
  } catch (e) {
    // best-effort; fallback continues below
  }

  if (destination?.country?.id && destination?.city?.id) {
    const recommendationPlace = {
      placeId: parsed.placeId,
      name: parsed.name,
      address: parsed.address,
      url: parsed.url,
      ...(parsed.coordinates ? { coordinates: parsed.coordinates } : {}),
    };

    return {
      destination,
      place: recommendationPlace,
    };
  }

  // Ensure country exists (reuse stable ISO code when available).
  let countryId = parsed.countryName;
  if (parsed.countryCode) {
    const existingCountryByCodeQ = query(collection(db, 'countries'), where('code', '==', parsed.countryCode));
    const existingCountryByCodeSnap = await getDocs(existingCountryByCodeQ);
    if (!existingCountryByCodeSnap.empty) {
      countryId = existingCountryByCodeSnap.docs[0].id;
    }
  }

  const countryDocRef = doc(db, 'countries', countryId);
  const countrySnap = await getDoc(countryDocRef);
  if (!countrySnap.exists()) {
    const metadata =
      (await fetchCountryMetadata({ countryName: parsed.countryName, countryCode: parsed.countryCode })) ||
      { currencyCode: 'USD', region: 'Global' };
    await setDoc(countryDocRef, {
      name: parsed.countryName,
      code: parsed.countryCode,
      region: metadata.region,
      currencyCode: metadata.currencyCode,
    });
  } else {
    await setDoc(countryDocRef, { name: parsed.countryName, code: parsed.countryCode }, { merge: true });
  }

  // Ensure city exists using derived cityName as id.
  const cityId = parsed.cityName;
  const cityDocRef = doc(db, 'countries', countryId, 'cities', cityId);
  await setDoc(
    cityDocRef,
    {
      name: parsed.cityName,
      description: parsed.address,
      ...(parsed.coordinates ? { coordinates: parsed.coordinates } : {}),
    },
    { merge: true }
  );

  const recommendationPlace = {
    placeId: parsed.placeId,
    name: parsed.name,
    address: parsed.address,
    url: parsed.url,
    ...(parsed.coordinates ? { coordinates: parsed.coordinates } : {}),
  };

  return {
    destination: {
      country: { id: countryId, name: parsed.countryName },
      city: { id: cityId, name: parsed.cityName },
    },
    place: recommendationPlace,
  };
};

const resolveCountryFromCoordinates = async ({ lat, lng }) => {
  const latNum = Number(lat);
  const lngNum = Number(lng);
  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) return { countryName: null, countryCode: null };

  // Strategy 1 (best on native): OS reverse geocoder.
  try {
    const results = await ExpoLocation.reverseGeocodeAsync({ latitude: latNum, longitude: lngNum });
    const first = Array.isArray(results) ? results[0] : null;
    const countryName = first?.country || null;
    const countryCode = first?.isoCountryCode || null;
    if (countryName || countryCode) {
      return { countryName, countryCode: countryCode ? String(countryCode).toUpperCase() : null };
    }
  } catch (e) {
    // ignore; fall through
  }

  // Strategy 2 (fallback, especially for web): Nominatim reverse.
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=3&lat=${encodeURIComponent(latNum)}&lon=${encodeURIComponent(lngNum)}`;
    const res = await fetch(url, {
      headers: {
        // Best-effort localization; safe even if ignored.
        'Accept-Language': 'he',
      },
    });
    const json = await res.json();
    const countryName = json?.address?.country || null;
    const cc = json?.address?.country_code || null;
    const countryCode = cc ? String(cc).toUpperCase() : null;
    return { countryName, countryCode };
  } catch (e) {
    return { countryName: null, countryCode: null };
  }
};

const isDisputedOrAmbiguousCountryName = (name) => {
  if (!name) return false;
  const n = String(name).toLowerCase();
  return (
    n.includes('palestin') ||
    n.includes('occupied palestinian') ||
    n.includes('palestinian territory') ||
    n.includes('west bank') ||
    n.includes('gaza') ||
    n.includes('השטח') ||
    n.includes('פלסטין')
  );
};