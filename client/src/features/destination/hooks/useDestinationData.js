import { useState, useEffect } from 'react';
import { doc, getDoc, query, collection, where, getDocs } from 'firebase/firestore';
import { db } from '../../../config/firebase';

const WEATHER_API_KEY = process.env.EXPO_PUBLIC_WEATHER_API_KEY;

export const useDestinationData = (cityId, countryId) => {
  const [cityData, setCityData] = useState(null);
  const [countryData, setCountryData] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [weather, setWeather] = useState(null);
  const [currencyRate, setCurrencyRate] = useState(null);
  const [loading, setLoading] = useState(true);

  // 1. Fetch City & Country Data
  useEffect(() => {
    const fetchBaseData = async () => {
      try {
        const [citySnap, countrySnap] = await Promise.all([
          getDoc(doc(db, "countries", countryId, "cities", cityId)),
          getDoc(doc(db, "countries", countryId))
        ]);
        if (citySnap.exists()) setCityData(citySnap.data());
        if (countrySnap.exists()) setCountryData(countrySnap.data());
      } catch (error) {
        console.error("Error fetching data:", error);
      }
    };
    if (cityId && countryId) fetchBaseData();
  }, [cityId, countryId]);

  // 2. Fetch Weather & Recommendations (Dependent on cityData)
  useEffect(() => {
    if (!cityData?.name) return;

    const fetchAdditionalDetails = async () => {
      // Fetch Recommendations
      const q = query(collection(db, "recommendations"), where("location", "==", cityData.name));
      const querySnapshot = await getDocs(q);
      const recs = [];
      querySnapshot.forEach((doc) => recs.push({ id: doc.id, ...doc.data() }));
      setRecommendations(recs);

      // Fetch Weather
      if (WEATHER_API_KEY) {
        try {
          const lat = cityData?.coordinates?.lat;
          const lon = cityData?.coordinates?.lng;

          // Prefer coordinates to avoid language/alias issues (e.g., Hebrew city names).
          const url = (typeof lat === 'number' && typeof lon === 'number')
            ? `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&lang=he&appid=${WEATHER_API_KEY}`
            : `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(cityData.name)}&units=metric&lang=he&appid=${WEATHER_API_KEY}`;

          const res = await fetch(url);
          if (!res.ok) {
            console.warn('Weather request failed', { status: res.status, cityName: cityData.name });
            setWeather(null);
            return;
          }

          const data = await res.json();
          if (data.main) {
             setWeather({
               temp: Math.round(data.main.temp) + "°C",
               desc: data.weather[0].description,
               main: data.weather[0].main
             });
          }
        } catch (e) {
          console.error("Weather error", e);
          setWeather(null);
        }
      }
      setLoading(false);
    };
    fetchAdditionalDetails();
  }, [cityData]);

  // 3. Fetch Currency (Dependent on countryData)
  useEffect(() => {
    if (!countryData?.currencyCode) return;
    const fetchCurrency = async () => {
        if (countryData.currencyCode === 'ILS') {
             setCurrencyRate("Local Currency (₪)");
             return;
        }
        try {
            const res = await fetch(`https://open.er-api.com/v6/latest/ILS`);
            const data = await res.json();
            setCurrencyRate(data.rates[countryData.currencyCode] ? `1 ₪ ≈ ${data.rates[countryData.currencyCode].toFixed(2)} ${countryData.currencyCode}` : "Unavailable");

        } catch (e) { setCurrencyRate("Load Error"); }
    };
    fetchCurrency();
  }, [countryData]);

  return { cityData, countryData, recommendations, weather, currencyRate, loading };
};