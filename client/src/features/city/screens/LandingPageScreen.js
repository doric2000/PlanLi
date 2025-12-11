import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import RecommendationCard from '../../community/components/RecommendationCard';
import { colors, typography, common, cards, buttons } from '../../../styles';
import { useBackButton } from '../../../hooks/useBackButton';

//weather API usage
const WEATHER_API_KEY = process.env.EXPO_PUBLIC_WEATHER_API_KEY;

// 2. Helper function: Converts weather description to Ionicons name
const getWeatherIcon = (weatherCondition) => {
  if (!weatherCondition) return 'help-circle-outline';
  
  const condition = weatherCondition.toLowerCase();
  
  if (condition.includes('clear')) return 'sunny';
  if (condition.includes('cloud')) return 'cloudy';
  if (condition.includes('rain')) return 'rainy';
  if (condition.includes('snow')) return 'snow';
  if (condition.includes('thunder')) return 'thunderstorm';
  if (condition.includes('drizzle')) return 'water';
  if (condition.includes('mist') || condition.includes('fog')) return 'cloudy-outline';
  
  return 'partly-sunny'; // Default
};

const InfoCard = ({ icon, title, data, subData, color, iconColor, library }) => (
  <View style={[cards.info, { backgroundColor: color }]}>
    <View style={cards.infoHeader}>
      <Text style={[typography.labelSmall, { color: colors.textSecondary }]}>{title}</Text>
      {library === 'Material' ? (
        <MaterialCommunityIcons name={icon} size={20} color={iconColor} />
      ) : (
        <Ionicons name={icon} size={20} color={iconColor} />
      )}
    </View>
    <View style={cards.infoContent}>
      <Text style={[typography.h4, { marginBottom: 2 }]}>{data || '-'}</Text>
      <Text style={[typography.caption, { color: colors.textLight }]}>{subData || ''}</Text>
    </View>
  </View>
);

/**
 * Dashboard screen for managing trips.
 * Displays active trips, upcoming plans, and relevant recommendations.
 *
 * @param {Object} navigation - Navigation object.
 */
export default function LandingPageScreen({ navigation, route }) {
  const { cityId, countryId } = route.params;

  useBackButton(navigation);

  const [cityData, setCityData] = useState(null);
  const [countryData, setCountryData] = useState(null); // New: for currency rate
  const [cityRecommendations, setCityRecommendations] = useState([]);

  // Weather states
  const [realWeather, setRealWeather] = useState(null); 
  const [loading, setLoading] = useState(true);
  const [currencyRate, setCurrencyRate] = useState(null); // New: for currency rate

  // 1. Fetch City Data & Country Data
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Prepare references
        const cityRef = doc(db, "countries", countryId, "cities", cityId);
        const countryRef = doc(db, "countries", countryId); // Parent country reference

        // Parallel fetch for performance
        const [citySnap, countrySnap] = await Promise.all([
          getDoc(cityRef),
          getDoc(countryRef)
        ]);

        if (citySnap.exists()) {
          setCityData(citySnap.data());
        }
        
        if (countrySnap.exists()) {
          setCountryData(countrySnap.data()); // Store country data (currency)
        }

      } catch (error) {
        console.error("Error fetching data:", error);
      }
  };
    if (cityId && countryId) fetchData();
  }, [cityId, countryId]);

  // 2. Fetch Recommendations
  useEffect(() => {
    const fetchCityRecommendations = async () => {
      if (!cityData?.name) return;
      try {
        const q = query(
          collection(db, "recommendations"),
          where("location", "==", cityData.name)
        );
        const querySnapshot = await getDocs(q);
        const recs = [];
        querySnapshot.forEach((doc) => {
          recs.push({ id: doc.id, ...doc.data() });
        });
        setCityRecommendations(recs);
      } catch (error) {
        console.error("Error fetching city recommendations:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchCityRecommendations();
  }, [cityData]);


  // --- 3. New: Fetch Real-Time Weather ---
  useEffect(() => {
    const fetchWeather = async () => {
      // If no city name or API key, do nothing
      if (!cityData?.name || !WEATHER_API_KEY) return;

      try {
        // Call API (Metric units = Celsius)
        const response = await fetch(
          `https://api.openweathermap.org/data/2.5/weather?q=${cityData.name}&units=metric&appid=${WEATHER_API_KEY}`
        );
        const data = await response.json();

        if (data.main && data.weather) {
          setRealWeather({
            temp: Math.round(data.main.temp) + "°C", // Round temp
            desc: data.weather[0].description,       // Description
            main: data.weather[0].main               // Main condition
          });
        }
      } catch (error) {
        console.error("Error fetching weather:", error);
      }
    };

    fetchWeather();
  }, [cityData]); // Runs when cityData is available


// 4. Fetch Currency Rate (Updated: Supports all currencies)
  useEffect(() => {
    const fetchCurrency = async () => {
      // Check if country data is available
      if (!countryData?.currencyCode) return;
      
      const code = countryData.currencyCode;

      // No conversion needed for ILS
      if (code === 'ILS') {
        setCurrencyRate("Local Currency (₪)");
        return;
      }

      try {
        // --- API Change ---
        // Using open.er-api.com
        const response = await fetch(`https://open.er-api.com/v6/latest/${code}`);
        const data = await response.json();
        
        // Structure is data.rates.ILS
        const rate = data.rates.ILS;
        
        if (rate) {
           setCurrencyRate(`1 ${code} ≈ ${rate.toFixed(2)} ₪`);
        } else {
           setCurrencyRate("Rate Unavailable");
        }
      } catch (error) {
        console.error("Currency Error:", error);
        setCurrencyRate(`${code} (Load Error)`);
      }
    };

    if (countryData) fetchCurrency();
  }, [countryData]);


  if (loading) {
    return (
      <View style={common.loadingContainer}>
        <ActivityIndicator size="large" color={colors.secondary} />
      </View>
    );
  }

  if (!cityData) {
    return (
      <View style={common.container}>
        <Text style={{ textAlign: 'center', marginTop: 50 }}>City not found.</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={common.container}>
      <StatusBar barStyle="light-content" />
      <ScrollView 
        contentContainerStyle={common.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* --- Static Header Container --- */}
        <View style={common.staticHeaderContainer}>
          <LinearGradient
            colors={['#1E3A5F', colors.primary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={common.gradientHeader}
          >
            <View style={common.topBar}>
              <View style={common.topButton} />
              <TouchableOpacity style={common.iconButton}>
                <Ionicons name="heart-outline" size={24} color={colors.white} />
              </TouchableOpacity>
            </View>

            <View style={{ alignItems: 'flex-end', marginBottom: 12 }}>
              <Text style={[typography.h1, { color: colors.white, marginBottom: 4 }]}>{cityData.name}</Text>
              <View style={common.row}>
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, marginRight: 12 }}>
                  <Ionicons name="star" size={14} color="#FFD700" />
                  <Text style={{ color: colors.white, fontWeight: 'bold', marginLeft: 4, fontSize: 12 }}>{cityData.rating}</Text>
                </View>
                <Text style={{ color: colors.white, fontSize: 14 }}>{cityData.travelers} Travelers</Text>
              </View>
            </View>
          </LinearGradient>

          {/* Floating Button */}
          <TouchableOpacity style={buttons.floatingPlan}>
            <Text style={buttons.floatingPlanText}>Start Planning Your Trip</Text>
          </TouchableOpacity>
        </View>

        {/* --- Main Content --- */}
        <View style={common.mainContent}>
          <View style={cards.infoGrid}>
            {/* --- Weather Widget --- */}
            <InfoCard
              title="Current Weather"
              // Use real weather if available, otherwise default
              icon={realWeather ? getWeatherIcon(realWeather.main) : "cloud-outline"}
              // Use real data if available, otherwise firebase fallback
              data={realWeather ? realWeather.temp : (cityData.widgets?.weather?.temp)}
              subData={realWeather ? realWeather.desc : (cityData.widgets?.weather?.status)}
              color={colors.infoLight}
              iconColor={colors.info}
            />
            <InfoCard
              title="Airport"
              icon="airplane"
              data={cityData.widgets?.airport?.name}
              subData={cityData.widgets?.airport?.distance}
              color={colors.accentLight} // #E0E7FF close to purple/lavender
              iconColor={colors.accent}
              library="Material"
            />
            <InfoCard
              title="Local Sim"
              icon="cellphone"
              data={cityData.widgets?.sim?.provider}
              subData={cityData.widgets?.sim?.price}
              color={colors.successLight}
              iconColor={colors.success}
              library="Material"
            />
            <InfoCard
              title="Transport"
              icon="bus"
              data={cityData.widgets?.transport?.type}
              subData={cityData.widgets?.transport?.recommendation}
              color={colors.warningLight}
              iconColor={colors.warning}
              library="Material"
            />
          </View>

          <View style={cards.sectionContainer}>
            <View style={cards.sectionHeader}>
              <Text style={cards.sectionTitle}>Essential Info</Text>
              <Ionicons name="wifi" size={20} color={colors.primary} />
            </View>

            <View style={cards.infoRow}>
              <View style={cards.iconBox}>
                <MaterialCommunityIcons name="office-building" size={24} color={colors.secondary} />
              </View>
              <View style={cards.infoTextContainer}>
                <Text style={cards.infoTitle}>Recommended Hotel</Text>
                <Text style={cards.infoSubtitle}>{cityData.essentialInfo?.hotel || 'N/A'}</Text>
              </View>
            </View>
            
            <View style={cards.infoRow}>
              <View style={cards.iconBox}>
                <MaterialCommunityIcons name="car-side" size={24} color={colors.secondary} />
              </View>
              <View style={cards.infoTextContainer}>
                <Text style={cards.infoTitle}>Trusted Driver</Text>
                <Text style={cards.infoSubtitle}>{cityData.essentialInfo?.driver || 'N/A'}</Text>
              </View>
            </View>
          
          {/* Display Country Currency */}
            <View style={[cards.infoRow, { borderBottomWidth: 0, marginBottom: 0 }]}>
              <View style={cards.iconBox}>
                <MaterialCommunityIcons name="cash-multiple" size={24} color={colors.secondary} />
              </View>
              <View style={cards.infoTextContainer}>
                <Text style={cards.infoTitle}>Currency ({countryData?.currencyCode || 'Local'})</Text>
                <Text style={cards.infoSubtitle}>{currencyRate || 'Checking rates...'}</Text>
              </View>
            </View>
          </View>

          <View style={common.feedSection}>
              <Text style={common.feedTitle}>Community Recommendations</Text>
              <Text style={common.feedSubtitle}>What travelers say about {cityData.name}</Text>
              
              {cityRecommendations.length === 0 ? (
                  <View style={common.emptyState}>
                      <Ionicons name="chatbubble-ellipses-outline" size={40} color={colors.textMuted} />
                      <Text style={common.emptyText}>No recommendations yet.</Text>
                      <Text style={common.emptySubText}>Be the first to share your experience!</Text>
                  </View>
              ) : (
                  cityRecommendations.map((item) => (
                      <RecommendationCard key={item.id} item={item} />
                  ))
              )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}