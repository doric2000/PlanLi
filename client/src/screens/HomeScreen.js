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
// 砖讬诪讜 诇讘 诇讛讜住驻转 collectionGroup
import { collection, getDocs, query, orderBy, limit, collectionGroup } from 'firebase/firestore';
import { db } from '../config/firebase';
import RecommendationCard from '../components/RecommendationCard';

export default function HomeScreen({ navigation }) {
  const [recommendations, setRecommendations] = useState([]);
  const [destinations, setDestinations] = useState([]); // 讻讗谉 谞砖诪讜专 讗转 讛注专讬诐
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  
  // 1. 驻讜谞拽爪讬讛 诇砖诇讬驻转 注专讬诐 驻讜驻讜诇专讬讜转 (专爪讛 驻注诐 讗讞转 讘注诇讬讬讛)
  useEffect(() => {
    const fetchDestinations = async () => {
      try {
        // 砖诇讬驻讛 诪讻诇 讛拽讜诇拽爪讬讜转 砖谞拽专讗讜转 'cities' 诇讗 诪砖谞讛 转讞转 讗讬讝讜 诪讚讬谞讛
        const citiesQuery = query(collectionGroup(db, 'cities'), limit(10));
        const querySnapshot = await getDocs(citiesQuery);
        
        const citiesList = querySnapshot.docs.map(doc => {
          // 讞讬诇讜抓 讛-ID 砖诇 讛诪讚讬谞讛 (讛讛讜专讛 砖诇 讛讛讜专讛)
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

  // 2. 驻讜谞拽爪讬讛 诇砖诇讬驻转 讛驻讬讚 (讛诪诇爪讜转 诪砖转诪砖讬诐)
  const fetchRecommendations = async () => {
    try {
      const q = query(collection(db, 'recommendations'), orderBy('createdAt', 'desc'), limit(20));
      const querySnapshot = await getDocs(q);
      const recs = [];
      querySnapshot.forEach((doc) => {
        recs.push({ id: doc.id, ...doc.data() });
      });
      setRecommendations(recs);
    } catch (error) {
      console.error("Error fetching recommendations: ", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchRecommendations();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchRecommendations();
  };

  const renderTrendingItem = (name) => (
    <View style={styles.trendingItem} key={name}>
      <Text style={styles.trendingText}>{name}</Text>
    </View>
  );

  const filteredDestinations = destinations.filter((city) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true; // 讗讬谉 讞讬驻讜砖 -> 讛爪讙 讛讻讜诇

    const name = (city.name || '').toLowerCase();
    const country = (city.countryId || '').toLowerCase();

    // 讞讬驻讜砖 诇驻讬 砖诐 注讬专 讗讜 砖诐 诪讚讬谞讛
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
          <Text style={styles.headerTitle}>诇讗谉 讛讛专驻转拽讛 讛讘讗讛 砖诇讱 转讬拽讞 讗讜转讱?</Text>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={20} color="#666" style={styles.searchIcon} />
            <TextInput
               placeholder="讞驻砖 讬注讚讬诐..."
               style={styles.searchInput}
               textAlign="right"
               value={searchQuery}
               onChangeText={setSearchQuery}
            />
          </View>
        </View>

        {/* Trending Now (Static for now) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Trending Now 馃搱</Text>
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

        {/* Community Feed */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Community Feed (Recent)</Text>
          {loading ? (
            <ActivityIndicator size="large" color="#2EC4B6" />
          ) : recommendations.length === 0 ? (
            <Text style={styles.emptyText}>No recommendations yet. Be the first to add one!</Text>
          ) : (
            recommendations.map((item) => <RecommendationCard key={item.id} item={item} />)
          )}
        </View>

        {/* Spacer for FAB */}
        <View style={{ height: 80 }} />
      </ScrollView>

      {/* Floating Action Button */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('AddRecommendation')}
      >
        <Ionicons name="add" size={32} color="#fff" />
      </TouchableOpacity>
      
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
  // 讛诪讬讻诇 砖注讜讟祝 讗转 讛转诪讜谞讛 讜讛讚讬专讜讙
  popularImageContainer: {
    width: '100%',
    height: 120,
    position: 'relative', // 讞砖讜讘! 诪讗驻砖专 诇讚讬专讜讙 诇爪讜祝 诪注诇讬讜 讘诪讬拽讜诐 讗讘住讜诇讜讟讬
  },

  // 讛转诪讜谞讛 注爪诪讛
  cardImage: {
    width: '100%',
    height: '100%',
    // 讗诐 讛讻专讟讬住讬讬讛 注爪诪讛 注诐 borderRadius, 讻讚讗讬 砖讙诐 诇转诪讜谞讛 讬讛讬讛:
    borderTopLeftRadius: 12, 
    borderTopRightRadius: 12,
  },

  // 讛转讬拽讜谉 诇讚讬专讜讙:
  ratingBadgeOverImage: {
    position: 'absolute', // 讙讜专诐 诇讜 诇爪讜祝 诪注诇 讛转诪讜谞讛
    top: 10,             // 10 驻讬拽住诇讬诐 诪诇诪注诇讛
    right: 10,           // 10 驻讬拽住诇讬诐 诪讬诪讬谉 (讗讜 left 讗诐 转专爪讜)
    
    flexDirection: 'row', // <--- 讝讛 讛转讬拽讜谉! 诪讬讬砖专 讗讜转诐 讘砖讜专讛 讗讞转
    alignItems: 'center', // 诪讬讬砖专 讗讜转诐 诇讙讜讘讛 (砖讛讻讜讻讘 诇讗 讬讛讬讛 讙讘讜讛 诪讛讟拽住讟)
    
    backgroundColor: 'rgba(255,255,255,0.9)', // 专拽注 诇讘谉 讞爪讬 砖拽讜祝 诇拽专讬讗讜转
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