import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
// שימו לב להוספת collectionGroup
import { collection, getDocs, query, orderBy, limit, collectionGroup } from 'firebase/firestore';
import { db } from '../config/firebase';
import RecommendationCard from '../components/RecommendationCard';

export default function HomeScreen({ navigation }) {
  const [recommendations, setRecommendations] = useState([]);
  const [destinations, setDestinations] = useState([]); // כאן נשמור את הערים
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  
  // 1. פונקציה לשליפת ערים פופולריות (רצה פעם אחת בעלייה)
  useEffect(() => {
    const fetchDestinations = async () => {
      try {
        // שליפה מכל הקולקציות שנקראות 'cities' לא משנה תחת איזו מדינה
        const citiesQuery = query(collectionGroup(db, 'cities'), limit(10));
        const querySnapshot = await getDocs(citiesQuery);
        
        const citiesList = querySnapshot.docs.map(doc => {
          // חילוץ ה-ID של המדינה (ההורה של ההורה)
          const parentCountry = doc.ref.parent.parent;
          const countryId = parentCountry ? parentCountry.id : 'Unknown';

          return {
            id: doc.id,
            countryId: countryId,
            ...doc.data()
          };
        });
        
        setDestinations(citiesList);
      } catch (error) {
        console.error("Error fetching destinations:", error);
      }
    };

    fetchDestinations();
  }, []);


  const onRefresh = () => {
    setRefreshing(true);
    fetchDestinations();
  };

  const renderTrendingItem = (name) => (
    <View style={styles.trendingItem} key={name}>
      <Text style={styles.trendingText}>{name}</Text>
    </View>
  );

  const filteredDestinations = destinations.filter((city) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true; // אין חיפוש -> הצג הכול

    const name = (city.name || '').toLowerCase();
    const country = (city.countryId || '').toLowerCase();

    // חיפוש לפי שם עיר או שם מדינה
    return name.includes(q) || country.includes(q);
  });

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>לאן ההרפתקה הבאה שלך תיקח אותך?</Text>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={20} color="#666" style={styles.searchIcon} />
            <TextInput
               placeholder="חפש יעדים..."
               style={styles.searchInput}
               textAlign="right"
               value={searchQuery}
               onChangeText={setSearchQuery}
            />
          </View>
        </View>

        {/* Trending Now (Static for now) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Trending Now 📈</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalScroll}>
            {['Thailand', 'Greece', 'Iceland', 'Portugal'].map(renderTrendingItem)}
          </ScrollView>
        </View>

        {/* Popular Destinations - DYNAMIC FROM FIREBASE */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Popular Destinations</Text>
            <TouchableOpacity><Text style={styles.seeAllText}>View All</Text></TouchableOpacity>
          </View>
          
          <View style={styles.grid}>
            {destinations.length === 0 ? (
              <Text style={styles.emptyText}>Loading destinations...</Text>
            ) : filteredDestinations.length === 0 ? (
              <Text style={styles.emptyText}>
                No destinations match "{searchQuery}"
              </Text>
            ) : (
              filteredDestinations.map((city) => (
                <TouchableOpacity 
                  key={city.id} 
                  style={styles.popularCard}
                  onPress={() => navigation.navigate('TripDashboard', { 
                    cityId: city.id, 
                    countryId: city.countryId 
                  })}
                >
                  <View style={styles.popularImageContainer}>
                    {city.imageUrl ? (
                      <Image
                        source={{ uri: city.imageUrl }}
                        style={styles.cardImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <View
                        style={[
                          styles.popularImagePlaceholder,
                          { backgroundColor: '#87CEEB' },
                        ]}
                      />
                    )}

                    <View style={styles.ratingBadgeOverImage}>
                      <Ionicons name="star" size={12} color="#FFD700" />
                      <Text style={styles.ratingText}>{city.rating}</Text>
                    </View>
                  </View>

                  <View style={styles.popularInfo}>
                    <Text style={styles.popularCity}>{city.name || city.id}</Text>
                    <Text style={styles.popularCountry}>{city.countryId}</Text>
                    <View style={styles.travelerInfo}>
                      <Ionicons name="location-outline" size={12} color="#666" />
                      <Text style={styles.travelerText}>
                        {city.travelers || '0'} travelers
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        </View>

        {/* Spacer for FAB */}
        <View style={{ height: 80 }} />
      </ScrollView>

      
      {/* Temporary button removed as we now have real cards */}

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  scrollContent: {
    paddingBottom: 20,
  },
  header: {
    backgroundColor: '#1E3A5F',
    padding: 20,
    paddingBottom: 30,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 20,
  },
  searchBar: {
    backgroundColor: '#fff',
    borderRadius: 25,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    height: 50,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    height: '100%',
    fontSize: 16,
  },
  section: {
    marginTop: 20,
    paddingHorizontal: 15,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  seeAllText: {
    color: '#2EC4B6',
    fontWeight: '600',
  },
  horizontalScroll: {
    flexDirection: 'row',
  },
  trendingItem: {
    backgroundColor: '#2EC4B6',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 20,
    marginRight: 10,
  },
  trendingText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  popularCard: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 15,
    overflow: 'hidden',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  popularImagePlaceholder: {
    height: 100,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    padding: 8,
  },
  // המיכל שעוטף את התמונה והדירוג
  popularImageContainer: {
    width: '100%',
    height: 120,
    position: 'relative', // חשוב! מאפשר לדירוג לצוף מעליו במיקום אבסולוטי
  },

  // התמונה עצמה
  cardImage: {
    width: '100%',
    height: '100%',
    // אם הכרטיסייה עצמה עם borderRadius, כדאי שגם לתמונה יהיה:
    borderTopLeftRadius: 12, 
    borderTopRightRadius: 12,
  },

  // התיקון לדירוג:
  ratingBadgeOverImage: {
    position: 'absolute', // גורם לו לצוף מעל התמונה
    top: 10,             // 10 פיקסלים מלמעלה
    right: 10,           // 10 פיקסלים מימין (או left אם תרצו)
    
    flexDirection: 'row', // <--- זה התיקון! מיישר אותם בשורה אחת
    alignItems: 'center', // מיישר אותם לגובה (שהכוכב לא יהיה גבוה מהטקסט)
    
    backgroundColor: 'rgba(255,255,255,0.9)', // רקע לבן חצי שקוף לקריאות
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  ratingBadge: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    alignItems: 'center',
  },
  ratingText: {
    fontSize: 10,
    fontWeight: 'bold',
    marginLeft: 3,
  },
  popularInfo: {
    padding: 10,
  },
  popularCity: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  popularCountry: {
    fontSize: 12,
    color: '#666',
  },
  travelerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5,
  },
  travelerText: {
    fontSize: 10,
    color: '#888',
    marginLeft: 3,
  },
  emptyText: {
    textAlign: 'center',
    color: '#888',
    marginTop: 20,
    width: '100%',
  },
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FF9F1C',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
  },
});