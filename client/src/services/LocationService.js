import { collection, query, where, getDocs, doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Platform } from 'react-native';

const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY;
const PLACES_PROXY_BASE_URL = process.env.EXPO_PUBLIC_PLACES_PROXY_BASE_URL || 'http://localhost:8082';

const fetchPlacesAutocomplete = async (searchText, { signal, types = '(cities)' } = {}) => {
  // On web, call our own server to avoid browser CORS restrictions.
  if (Platform.OS === 'web') {
    const base = `${PLACES_PROXY_BASE_URL}/api/places/autocomplete?input=${encodeURIComponent(searchText)}`;
    const url = types ? `${base}&types=${encodeURIComponent(types)}` : base;
    const response = await fetch(url, { signal });
    return response.json();
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
  return response.json();
};

const fetchPlacesTextSearch = async (searchText, { signal } = {}) => {
  if (Platform.OS === 'web') {
    const url = `${PLACES_PROXY_BASE_URL}/api/places/textsearch?query=${encodeURIComponent(searchText)}`;
    const response = await fetch(url, { signal });
    return response.json();
  }

  const params = new URLSearchParams();
  params.set('query', searchText);
  params.set('language', 'he');
  params.set('key', GOOGLE_API_KEY);
  const response = await fetch(`https://maps.googleapis.com/maps/api/place/textsearch/json?${params.toString()}`, { signal });
  return response.json();
};

export const fetchPlaceDetails = async (placeId, { fields } = {}) => {
  if (Platform.OS === 'web') {
    const base = `${PLACES_PROXY_BASE_URL}/api/places/details?placeId=${encodeURIComponent(placeId)}`;
    const url = fields ? `${base}&fields=${encodeURIComponent(fields)}` : base;
    const response = await fetch(url);
    return response.json();
  }

  const resolvedFields =
    fields || 'name,formatted_address,address_components,geometry,photos,rating,place_id,url';

  const response = await fetch(
    `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=${encodeURIComponent(resolvedFields)}&language=he&key=${GOOGLE_API_KEY}`
  );
  return response.json();
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

  // IMPORTANT: Don't treat neighborhoods/sublocalities as the "city".
  // Prefer real city-level components first, then fall back to broader admin areas.
  const cityComp =
    findByTypePriority(['locality', 'postal_town']) ||
    findByTypePriority(['administrative_area_level_3', 'administrative_area_level_2', 'administrative_area_level_1']) ||
    findByTypePriority(['sublocality', 'neighborhood']);

  const countryName = countryComp?.long_name || null;
  const countryCode = countryComp?.short_name || null;
  const cityName = cityComp?.long_name || result.name || null;

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
export const getOrCreateDestinationForPlace = async (placeId) => {
  const fields = 'name,formatted_address,address_components,geometry,place_id,url';
  const details = await fetchPlaceDetails(placeId, { fields });
  const result = details?.result;
  if (!result) throw new Error('Google Places API returned no result.');

  const parsed = parsePlaceDetailsBasics(result);
  if (!parsed?.countryName || !parsed?.cityName) {
    throw new Error('Could not derive country/city from place details.');
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