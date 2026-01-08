import { collection, query, where, getDocs, addDoc, doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Platform } from 'react-native';

const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY;
const PLACES_PROXY_BASE_URL = process.env.EXPO_PUBLIC_PLACES_PROXY_BASE_URL || 'http://localhost:5000';

const fetchPlacesAutocomplete = async (searchText, { signal } = {}) => {
  // On web, call our own server to avoid browser CORS restrictions.
  if (Platform.OS === 'web') {
    const url = `${PLACES_PROXY_BASE_URL}/api/places/autocomplete?input=${encodeURIComponent(searchText)}`;
    const response = await fetch(url, { signal });
    return response.json();
  }

  // Native can call Google directly (no browser CORS).
  const response = await fetch(
    `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(searchText)}&types=(cities)&language=iw&key=${GOOGLE_API_KEY}`,
    { signal }
  );
  return response.json();
};

const fetchPlacesDetails = async (placeId) => {
  if (Platform.OS === 'web') {
    const url = `${PLACES_PROXY_BASE_URL}/api/places/details?placeId=${encodeURIComponent(placeId)}`;
    const response = await fetch(url);
    return response.json();
  }

  const response = await fetch(
    `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,formatted_address,address_components,geometry,photos,rating,place_id&language=iw&key=${GOOGLE_API_KEY}`
  );
  return response.json();
};

/**
 * 1. AUTOCOMPLETE SEARCH
 */
export const searchCities = async (searchText, { signal } = {}) => {
  if (!searchText || searchText.length < 2) return [];

  try {
    const data = await fetchPlacesAutocomplete(searchText, { signal });
    return data?.predictions || [];
  } catch (error) {
    // Abort is expected when user keeps typing.
    if (error?.name === 'AbortError') return [];
    console.error("Error fetching city predictions:", error);
    return [];
  }
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
    const data = await fetchPlacesDetails(placeId);
    const result = data.result;
    
    if (!result) throw new Error("Google Places API returned no result.");

    // B. Parse Address Components
    const countryComp = result.address_components.find(c => c.types.includes('country'));
    const cityComp = result.address_components.find(c => 
      c.types.includes('locality') || 
      c.types.includes('administrative_area_level_1') ||
      c.types.includes('administrative_area_level_2') ||
      c.types.includes('postal_town') ||
      c.types.includes('neighborhood') ||
      c.types.includes('sublocality')
    );
    
    if (!countryComp) {
        alert("Could not detect Country.");
        return null;
    }

    const countryName = countryComp.long_name;
    const countryCode = countryComp.short_name;
    // If no specific city found, use the place name itself (e.g. for "Astra")
    const cityName = cityComp ? cityComp.long_name : result.name;

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