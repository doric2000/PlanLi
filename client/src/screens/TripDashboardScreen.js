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
import { db } from '../config/firebase';
import RecommendationCard from '../components/RecommendationCard';

const { width } = Dimensions.get('window');

//weather API usage
const WEATHER_API_KEY = process.env.EXPO_PUBLIC_WEATHER_API_KEY;

// 2. פונקציית עזר: הופכת את תיאור מזג האוויר לאייקון של Ionicons
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
  
  return 'partly-sunny'; // ברירת מחדל
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

export default function TripDashboardScreen({ navigation, route }) {
  const { cityId, countryId } = route.params;

  const [cityData, setCityData] = useState(null);
  const [countryData, setCountryData] = useState(null); // new , for the currency rate.
  const [cityRecommendations, setCityRecommendations] = useState([]);

  //states for weather:
  const [realWeather, setRealWeather] = useState(null); 
  const [loading, setLoading] = useState(true);
  const [currencyRate, setCurrencyRate] = useState(null); //new , for the currency rate.

  // 1. Fetch City Data & Country Data
  useEffect(() => {
    const fetchData = async () => {
      try {
        // הכנת הרפרנסים
        const cityRef = doc(db, "countries", countryId, "cities", cityId);
        const countryRef = doc(db, "countries", countryId); // הרפרנס למדינה (ההורה)

        // שליפה במקביל לביצועים מקסימליים
        const [citySnap, countrySnap] = await Promise.all([
          getDoc(cityRef),
          getDoc(countryRef)
        ]);

        if (citySnap.exists()) {
          setCityData(citySnap.data());
        }
        
        if (countrySnap.exists()) {
          setCountryData(countrySnap.data()); // שמירת מידע המדינה (שם יש את המטבע)
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


  // --- 3. חדש: שליפת מזג אוויר בזמן אמת ---
  useEffect(() => {
    const fetchWeather = async () => {
      // אם אין שם עיר או אין מפתח API, לא עושים כלום
      if (!cityData?.name || !WEATHER_API_KEY) return;

      try {
        // קריאה ל-API (יחידות מטריות = צלזיוס)
        const response = await fetch(
          `https://api.openweathermap.org/data/2.5/weather?q=${cityData.name}&units=metric&appid=${WEATHER_API_KEY}`
        );
        const data = await response.json();

        if (data.main && data.weather) {
          setRealWeather({
            temp: Math.round(data.main.temp) + "°C", // מעגלים את הטמפרטורה
            desc: data.weather[0].description,       // תיאור (למשל: broken clouds)
            main: data.weather[0].main               // ראשי (למשל: Clouds)
          });
        }
      } catch (error) {
        console.error("Error fetching weather:", error);
      }
    };

    fetchWeather();
  }, [cityData]); // רץ ברגע שיש cityData


// 4. שליפת שער מטבע (מעודכן: תומך בכל המטבעות כולל PEN)
  useEffect(() => {
    const fetchCurrency = async () => {
      // בדיקה אם יש לנו את המידע מהמדינה
      if (!countryData?.currencyCode) return;
      
      const code = countryData.currencyCode;

      // אם זה שקל, לא צריך להמיר
      if (code === 'ILS') {
        setCurrencyRate("מטבע מקומי (₪)");
        return;
      }

      try {
        // --- שינוי API ---
        // שימוש ב-open.er-api.com שתומך גם ב-PEN
        const response = await fetch(`https://open.er-api.com/v6/latest/${code}`);
        const data = await response.json();
        
        // המבנה כאן הוא data.rates.ILS
        const rate = data.rates.ILS;
        
        if (rate) {
           setCurrencyRate(`1 ${code} ≈ ${rate.toFixed(2)} ₪`);
        } else {
           setCurrencyRate("שער לא זמין");
        }
      } catch (error) {
        console.error("Currency Error:", error);
        setCurrencyRate(`${code} (שגיאה בטעינה)`);
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
        {/* --- המיכל של החלק הסטטי (כולל הכפתור) --- */}
        <View style={styles.staticHeaderContainer}>
          <LinearGradient
            colors={['#1E3A5F', '#2EC4B6']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.gradientHeader}
          >
            <View style={styles.topBar}>
              <TouchableOpacity onPress={() => navigation.goBack()} style={styles.topButton}>
                <Ionicons name="arrow-forward" size={24} color="#fff" />
                <Text style={styles.backText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.iconButton}>
                <Ionicons name="heart-outline" size={24} color="#fff" />
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

          {/* הכפתור נמצא בתוך המיכל הסטטי, אבל ממוקם אבסולוטית למטה */}
          <TouchableOpacity style={styles.floatingPlanButton}>
            <Text style={styles.planButtonText}>Start Planning Your Trip</Text>
          </TouchableOpacity>
        </View>

        {/* --- התוכן הראשי --- */}
        <View style={styles.mainContent}>
          <View style={styles.gridContainer}>
            {/* --- i have updated weather ot use api --- */}
            <InfoCard
              title="Current Weather"
              // אם יש מידע אמיתי - נשתמש באייקון המחושב, אחרת ברירת מחדל
              icon={realWeather ? getWeatherIcon(realWeather.main) : "cloud-outline"}
              // אם יש מידע אמיתי - נציג אותו, אחרת נציג את מה שיש ב-Firebase (גיבוי)
              data={realWeather ? realWeather.temp : (cityData.widgets?.weather?.temp)}
              subData={realWeather ? realWeather.desc : (cityData.widgets?.weather?.status)}
              color="#E3F2FD"
              iconColor="#2196F3"
            />
            <InfoCard
              title="Airport"
              icon="airplane"
              data={cityData.widgets?.airport?.name}
              subData={cityData.widgets?.airport?.distance}
              color="#F3E5F5"
              iconColor="#9C27B0"
              library="Material"
            />
            <InfoCard
              title="Local Sim"
              icon="cellphone"
              data={cityData.widgets?.sim?.provider}
              subData={cityData.widgets?.sim?.price}
              color="#E8F5E9"
              iconColor="#4CAF50"
              library="Material"
            />
            <InfoCard
              title="Transport"
              icon="bus"
              data={cityData.widgets?.transport?.type}
              subData={cityData.widgets?.transport?.recommendation}
              color="#FFF3E0"
              iconColor="#FF9800"
              library="Material"
            />
          </View>

          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Essential Info</Text>
              <Ionicons name="wifi" size={20} color="#2EC4B6" />
            </View>

            <View style={styles.infoRow}>
              <View style={styles.iconBoxOrange}>
                <MaterialCommunityIcons name="office-building" size={24} color="#FF9F1C" />
              </View>
              <View style={styles.infoTextContainer}>
                <Text style={styles.infoTitle}>Recommended Hotel</Text>
                <Text style={styles.infoSubtitle}>{cityData.essentialInfo?.hotel || 'N/A'}</Text>
              </View>
            </View>
            
            <View style={styles.infoRow}>
              <View style={styles.iconBoxOrange}>
                <MaterialCommunityIcons name="car-side" size={24} color="#FF9F1C" />
              </View>
              <View style={styles.infoTextContainer}>
                <Text style={styles.infoTitle}>Trusted Driver</Text>
                <Text style={styles.infoSubtitle}>{cityData.essentialInfo?.driver || 'N/A'}</Text>
              </View>
            </View>
          
          {/* הצגת המטבע מהמדינה */}
            <View style={[styles.infoRow, { borderBottomWidth: 0, marginBottom: 0 }]}>
              <View style={styles.iconBoxOrange}>
                <MaterialCommunityIcons name="cash-multiple" size={24} color="#FF9F1C" />
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
                      <Ionicons name="chatbubble-ellipses-outline" size={40} color="#ccc" />
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
  container: { 
    flex: 1, 
    backgroundColor: '#F5F7FA',
  },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  // מיכל חדש לחלק העליון - מבטיח שהכפתור יהיה מעל הגלילה
  staticHeaderContainer: {
    zIndex: 100, // הכי גבוה בהיררכיה
    position: 'relative',
    backgroundColor: 'transparent',
    // אין כאן overflow: hidden כדי שהכפתור יוכל לבלוט
  },

  gradientHeader: {
    paddingBottom: 45, // נותן מקום לכפתור שיושב למטה
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  
  // הכפתור עכשיו צף ביחס למיכל הסטטי
  floatingPlanButton: { 
    position: 'absolute', // מיקום אבסולוטי בתוך ה-Header Container
    bottom: -25,          // חורג החוצה ב-25 פיקסלים
    alignSelf: 'center', 
    backgroundColor: '#FF9F1C', 
    paddingVertical: 15, 
    paddingHorizontal: 40, 
    borderRadius: 12, 
    alignItems: 'center', 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 4 }, 
    shadowOpacity: 0.2, 
    shadowRadius: 5, 
    elevation: 5 
  },
  planButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },

  scrollContent: {
    paddingBottom: 40,
  },

  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  topButton: { flexDirection: 'row', alignItems: 'center' },
  iconButton: { backgroundColor: 'rgba(255,255,255,0.2)', padding: 8, borderRadius: 20 },
  headerContent: { alignItems: 'flex-end', marginBottom: 10 }, // הקטנתי קצת כדי להרים את הטקסט
  destinationTitle: { fontSize: 32, fontWeight: 'bold', color: '#fff', marginBottom: 5 },
  statsRow: { flexDirection: 'row', alignItems: 'center' },
  statBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, marginRight: 10 },
  statText: { color: '#fff', fontWeight: 'bold', marginLeft: 4, fontSize: 12 },
  travelersText: { color: '#fff', fontSize: 14 },
  
  mainContent: { paddingHorizontal: 20, paddingTop: 40 },
  
  gridContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  infoCard: { width: (width - 50) / 2, padding: 15, borderRadius: 16, marginBottom: 15, height: 110, justifyContent: 'space-between' },
  cardHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 14, color: '#555', fontWeight: '600' },
  cardContent: { alignItems: 'flex-end' },
  cardData: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 2 },
  cardSubData: { fontSize: 12, color: '#666' },
  
  sectionContainer: { backgroundColor: '#E0F7FA', borderRadius: 16, padding: 15, marginTop: 10, borderWidth: 1, borderColor: '#B2EBF2' },
  sectionHeader: { flexDirection: 'row-reverse', alignItems: 'center', marginBottom: 15, justifyContent: 'space-between' },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#333', marginRight: 10 },
  infoRow: { backgroundColor: '#fff', borderRadius: 12, padding: 12, flexDirection: 'row-reverse', alignItems: 'center', marginBottom: 10 },
  iconBoxOrange: { width: 40, height: 40, backgroundColor: '#FFF3E0', borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginLeft: 12 },
  infoTextContainer: { flex: 1, alignItems: 'flex-end' },
  infoTitle: { fontSize: 14, fontWeight: 'bold', color: '#333', marginBottom: 2 },
  infoSubtitle: { fontSize: 12, color: '#777', textAlign: 'right' },

  feedSection: { marginTop: 30, marginBottom: 20 },
  feedTitle: { fontSize: 20, fontWeight: 'bold', color: '#333', textAlign: 'right', marginBottom: 5 },
  feedSubtitle: { fontSize: 14, color: '#666', textAlign: 'right', marginBottom: 15 },
  emptyState: { alignItems: 'center', padding: 20, marginTop: 10 },
  emptyText: { color: '#888', marginTop: 10, fontSize: 16 },
  emptySubText: { color: '#2EC4B6', fontWeight: 'bold', marginTop: 5 }
});