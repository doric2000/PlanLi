import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  StatusBar,
  ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import RecommendationCard from '../../community/components/RecommendationCard';
import { colors, spacing, typography, shadows, cards } from '../../../styles';

const { width } = Dimensions.get('window');

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
  <View style={[styles.infoCard, { backgroundColor: color }]}>
    <View style={styles.cardHeader}>
      <Text style={styles.cardTitle}>{title}</Text>
      {library === 'Material' ? (
        <MaterialCommunityIcons name={icon} size={20} color={iconColor} />
      ) : (
        <Ionicons name={icon} size={20} color={iconColor} />
      )}
    </View>
    <View style={styles.cardContent}>
      <Text style={styles.cardData}>{data || '-'}</Text>
      <Text style={styles.cardSubData}>{subData || ''}</Text>
    </View>
  </View>
);

/**
 * Dashboard screen for managing trips.
 * Displays active trips, upcoming plans, and relevant recommendations.
 *
 * @param {Object} navigation - Navigation object.
 */
export default function TripDashboardScreen({ navigation, route }) {
  const { cityId, countryId } = route.params;

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
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF9F1C" />
      </View>
    );
  }

  if (!cityData) {
    return (
      <View style={styles.container}>
        <Text style={{ textAlign: 'center', marginTop: 50 }}>City not found.</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* --- Static Header Container --- */}
        <View style={styles.staticHeaderContainer}>
          <LinearGradient
            colors={['#1E3A5F', colors.primary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.gradientHeader}
          >
            <View style={styles.topBar}>
              <TouchableOpacity onPress={() => navigation.goBack()} style={styles.topButton}>
                <Ionicons name="arrow-forward" size={24} color={colors.white} />
                <Text style={styles.backText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.iconButton}>
                <Ionicons name="heart-outline" size={24} color={colors.white} />
              </TouchableOpacity>
            </View>

            <View style={styles.headerContent}>
              <Text style={styles.destinationTitle}>{cityData.name}</Text>
              <View style={styles.statsRow}>
                <View style={styles.statBadge}>
                  <Ionicons name="star" size={14} color="#FFD700" />
                  <Text style={styles.statText}>{cityData.rating}</Text>
                </View>
                <Text style={styles.travelersText}>{cityData.travelers} Travelers</Text>
              </View>
            </View>
          </LinearGradient>

          {/* Floating Button */}
          <TouchableOpacity style={styles.floatingPlanButton}>
            <Text style={styles.planButtonText}>Start Planning Your Trip</Text>
          </TouchableOpacity>
        </View>

        {/* --- Main Content --- */}
        <View style={styles.mainContent}>
          <View style={styles.gridContainer}>
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

          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Essential Info</Text>
              <Ionicons name="wifi" size={20} color={colors.primary} />
            </View>

            <View style={styles.infoRow}>
              <View style={styles.iconBoxOrange}>
                <MaterialCommunityIcons name="office-building" size={24} color={colors.secondary} />
              </View>
              <View style={styles.infoTextContainer}>
                <Text style={styles.infoTitle}>Recommended Hotel</Text>
                <Text style={styles.infoSubtitle}>{cityData.essentialInfo?.hotel || 'N/A'}</Text>
              </View>
            </View>
            
            <View style={styles.infoRow}>
              <View style={styles.iconBoxOrange}>
                <MaterialCommunityIcons name="car-side" size={24} color={colors.secondary} />
              </View>
              <View style={styles.infoTextContainer}>
                <Text style={styles.infoTitle}>Trusted Driver</Text>
                <Text style={styles.infoSubtitle}>{cityData.essentialInfo?.driver || 'N/A'}</Text>
              </View>
            </View>
          
          {/* Display Country Currency */}
            <View style={[styles.infoRow, { borderBottomWidth: 0, marginBottom: 0 }]}>
              <View style={styles.iconBoxOrange}>
                <MaterialCommunityIcons name="cash-multiple" size={24} color={colors.secondary} />
              </View>
              <View style={styles.infoTextContainer}>
                <Text style={styles.infoTitle}>Currency ({countryData?.currencyCode || 'Local'})</Text>
                <Text style={styles.infoSubtitle}>{currencyRate || 'Checking rates...'}</Text>
              </View>
            </View>
          </View>

          <View style={styles.feedSection}>
              <Text style={styles.feedTitle}>Community Recommendations</Text>
              <Text style={styles.feedSubtitle}>What travelers say about {cityData.name}</Text>
              
              {cityRecommendations.length === 0 ? (
                  <View style={styles.emptyState}>
                      <Ionicons name="chatbubble-ellipses-outline" size={40} color={colors.textMuted} />
                      <Text style={styles.emptyText}>No recommendations yet.</Text>
                      <Text style={styles.emptySubText}>Be the first to share your experience!</Text>
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

const styles = StyleSheet.create({
  container: common.container,
  loadingContainer: common.loadingContainer,
  
  // Static Header Container
  staticHeaderContainer: {
    zIndex: 100,
    position: 'relative',
    backgroundColor: 'transparent',
  },

  gradientHeader: {
    paddingBottom: 45, // Space for floating button
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    paddingHorizontal: spacing.screenHorizontal,
    paddingTop: spacing.sm,
  },
  
  // Floating Button
  floatingPlanButton: { 
    position: 'absolute',
    bottom: -25,
    alignSelf: 'center', 
    backgroundColor: colors.secondary,
    paddingVertical: 15, 
    paddingHorizontal: 40, 
    borderRadius: spacing.radiusMedium,
    alignItems: 'center', 
    ...shadows.medium,
  },
  planButtonText: { color: colors.white, fontSize: 16, fontWeight: 'bold' },

  scrollContent: {
    paddingBottom: 40,
  },

  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xl },
  topButton: { flexDirection: 'row', alignItems: 'center' },
  iconButton: { backgroundColor: 'rgba(255,255,255,0.2)', padding: spacing.sm, borderRadius: 20 },
  headerContent: { alignItems: 'flex-end', marginBottom: spacing.md },
  destinationTitle: { ...typography.h1, color: colors.white, marginBottom: spacing.xs },
  statsRow: { flexDirection: 'row', alignItems: 'center' },
  statBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)', paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: 12, marginRight: spacing.md },
  statText: { color: colors.white, fontWeight: 'bold', marginLeft: 4, fontSize: 12 },
  travelersText: { color: colors.white, fontSize: 14 },
  
  mainContent: { paddingHorizontal: spacing.screenHorizontal, paddingTop: 40 },
  
  gridContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  infoCard: { width: (width - 50) / 2, padding: 15, borderRadius: 16, marginBottom: 15, height: 110, justifyContent: 'space-between' },
  cardHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { ...typography.labelSmall, color: colors.textSecondary },
  cardContent: { alignItems: 'flex-end' },
  cardData: { ...typography.h4, marginBottom: 2 },
  cardSubData: { ...typography.caption, color: colors.textLight },
  
  sectionContainer: { backgroundColor: colors.infoLight, borderRadius: 16, padding: spacing.cardPadding, marginTop: spacing.md, borderWidth: 1, borderColor: '#B2EBF2' },
  sectionHeader: { flexDirection: 'row-reverse', alignItems: 'center', marginBottom: 15, justifyContent: 'space-between' },
  sectionTitle: { ...typography.h4, marginRight: spacing.md },
  infoRow: { backgroundColor: colors.white, borderRadius: 12, padding: 12, flexDirection: 'row-reverse', alignItems: 'center', marginBottom: 10 },
  iconBoxOrange: { width: 40, height: 40, backgroundColor: colors.secondaryLight, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginLeft: 12 },
  infoTextContainer: { flex: 1, alignItems: 'flex-end' },
  infoTitle: { ...typography.label, marginBottom: 2 },
  infoSubtitle: { ...typography.caption, color: colors.textLight, textAlign: 'right' },

  feedSection: { marginTop: spacing.xxxl, marginBottom: spacing.xl },
  feedTitle: { ...typography.h3, textAlign: 'right', marginBottom: spacing.xs },
  feedSubtitle: { ...typography.bodySmall, textAlign: 'right', marginBottom: spacing.lg },
  emptyState: { alignItems: 'center', padding: spacing.xl, marginTop: spacing.md },
  emptyText: common.emptyText,
  emptySubText: { color: colors.primary, fontWeight: 'bold', marginTop: spacing.xs }
});