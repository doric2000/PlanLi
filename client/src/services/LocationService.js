import { collection, query, where, getDocs, addDoc, doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY;

/**
 * 1. AUTOCOMPLETE SEARCH
 */
export const searchCities = async (searchText) => {
  if (!searchText || searchText.length < 2) return [];

  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(searchText)}&types=(cities)&language=en&key=${GOOGLE_API_KEY}`
    );
    const data = await response.json();
    return data.predictions || [];
  } catch (error) {
    console.error("Error fetching city predictions:", error);
    return [];
  }
};

/**
 * HELPER: Fetch Metadata
 */
const fetchCountryMetadata = async (countryName) => {
  try {
    const response = await fetch(`https://restcountries.com/v3.1/name/${countryName}?fullText=true`);
    const data = await response.json();
    const country = data[0];
    if (!country) return null;
    
    return { 
        currencyCode: country.currencies ? Object.keys(country.currencies)[0] : "USD",
        region: country.region || "Global"
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
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,formatted_address,address_components,geometry,photos,rating,place_id&key=${GOOGLE_API_KEY}`
    );
    const data = await response.json();
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

    // C. FIND OR CREATE COUNTRY (ID = Name)
    const countryId = countryName; 
    const countryDocRef = doc(db, 'countries', countryId);
    const countrySnap = await getDoc(countryDocRef);

    if (!countrySnap.exists()) {
      const metadata = await fetchCountryMetadata(countryName);
      await setDoc(countryDocRef, {
        name: countryName,
        code: countryCode,
        region: metadata.region, 
        currencyCode: metadata.currencyCode
      });
      console.log(`Created new country: ${countryId}`);
    }

    // D. FIND OR CREATE CITY (ID = Name) <--- CHANGED THIS SECTION
    const cityId = cityName; // The ID is now "Paris" instead of "7f8s..."
    const cityDocRef = doc(db, 'countries', countryId, 'cities', cityId);
    const citySnap = await getDoc(cityDocRef);

    if (!citySnap.exists()) {
      // Prepare Image
      const photoRef = result.photos ? result.photos[0].photo_reference : null;
      const imageUrl = photoRef 
          ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=${photoRef}&key=${GOOGLE_API_KEY}`
          : 'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=800'; 

      // Create City Doc using SETDOC (custom ID) instead of ADDDOC (random ID)
      await setDoc(cityDocRef, {
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
      });
      console.log(`Created new city: ${cityId}`);
    }

    // E. RETURN FULL OBJECTS
    return { 
        country: { id: countryId, name: countryName }, 
        city: { id: cityId, name: cityName } 
    };

  } catch (error) {
    console.error("Error in getOrCreateDestination:", error);
    throw error;
  }
};