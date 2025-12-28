import { useState, useEffect } from 'react';
import { collection, getDocs, query } from 'firebase/firestore';
import { db } from '../config/firebase'; 

/**
 * Custom hook to manage location data (Countries and Cities).
 * Handles fetching from Firebase and managing selection state.
 * * @param {string|null} initialCountryId - ID for pre-selection (Edit mode)
 * @param {string|null} initialCityId - ID for pre-selection (Edit mode)
 */
export const useLocationData = (initialCountryId = null, initialCityId = null) => {
  const [countries, setCountries] = useState([]);
  const [cities, setCities] = useState([]);
  const [selectedCountry, setSelectedCountry] = useState(null);
  const [selectedCity, setSelectedCity] = useState(null);
  const [loading, setLoading] = useState(true);

  // 1. Fetch all countries on component mount
  useEffect(() => {
    const fetchCountries = async () => {
      try {
        const q = query(collection(db, 'countries'));
        const snapshot = await getDocs(q);
        const countriesList = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setCountries(countriesList);
      } catch (error) {
        console.error("Error fetching countries:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchCountries();
  }, []);

  // 2. Handle Edit Mode: Restore initial selection once countries are loaded
  useEffect(() => {
    if (countries.length > 0 && initialCountryId) {
      const foundCountry = countries.find(c => c.id === initialCountryId);
      
      if (foundCountry) {
        // We reuse the logic but pass the city ID to be selected after fetch
        handleSelectCountry(foundCountry, initialCityId);
      }
    }
  }, [countries, initialCountryId]);

  /**
   * Selects a country and fetches its corresponding cities.
   * @param {object} country - The selected country object
   * @param {string|null} preselectedCityId - Optional city ID to select after fetching (for edit mode)
   */
  const handleSelectCountry = async (country, preselectedCityId = null) => {
    setSelectedCountry(country);
    
    // Reset city if we are manually selecting a new country
    if (!preselectedCityId) {
      setSelectedCity(null);
    }

    try {
      // Fetch cities from the sub-collection
      const citiesRef = collection(db, 'countries', country.id, 'cities');
      const snapshot = await getDocs(citiesRef);
      const citiesList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setCities(citiesList);

      // If we need to restore a city (Edit mode), find and set it
      if (preselectedCityId) {
        const foundCity = citiesList.find(c => c.id === preselectedCityId);
        if (foundCity) setSelectedCity(foundCity);
      }

    } catch (error) {
      console.error("Error fetching cities:", error);
    }
  };

  // Simple setter for city
  const handleSelectCity = (city) => {
    setSelectedCity(city);
  };

  return {
    countries,
    cities,
    selectedCountry,
    selectedCity,
    handleSelectCountry,
    handleSelectCity,
    loading
  };
};