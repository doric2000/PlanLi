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
import { db } from '../../../config/firebase';
import RecommendationCard from '../../community/components/RecommendationCard';
import { colors, spacing, typography, buttons, shadows } from '../../../styles';

/**
 * Landing screen for the application.
 * Displays trending destinations, popular places, and a community feed.
 *
 * @param {Object} navigation - Navigation object.
 */
export default function HomeScreen({ navigation }) {
  const [recommendations, setRecommendations] = useState([]);
  const [destinations, setDestinations] = useState([]); // כאן נשמור את הערים
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  
  // 1. Fetch popular destinations (Runs once on mount)
  useEffect(() => {
    const fetchDestinations = async () => {
      try {
        // Query all collections named 'cities' regardless of country
        const citiesQuery = query(collectionGroup(db, 'cities'), limit(10));
        const querySnapshot = await getDocs(citiesQuery);
        
        const citiesList = querySnapshot.docs.map(doc => {
          // Extract Parent Country ID
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
    if (!q) return true; // No search -> show all

    const name = (city.name || '').toLowerCase();
    const country = (city.countryId || '').toLowerCase();

    // Search by city name or country name
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
          <Text style={styles.headerTitle}>Where will your next adventure take you?</Text>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={20} color={colors.textSecondary} style={styles.searchIcon} />
            <TextInput
               placeholder="Search destinations..."
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
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  header: {
    backgroundColor: '#1E3A5F', // Keeping brand header
    padding: spacing.screenHorizontal,
    paddingBottom: spacing.xxxl,
    borderBottomLeftRadius: spacing.radiusXL,
    borderBottomRightRadius: spacing.radiusXL,
  },
  headerTitle: {
    ...typography.h3,
    color: colors.white,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  searchBar: {
    backgroundColor: colors.white,
    borderRadius: 25,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    height: 50,
  },
  searchIcon: {
    marginRight: spacing.sm,
  },
  searchInput: {
    flex: 1,
    height: '100%',
    fontSize: 16,
  },
  section: {
    marginTop: spacing.xl,
    paddingHorizontal: spacing.screenHorizontal,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...typography.h4,
    marginBottom: spacing.md,
  },
  seeAllText: {
    color: colors.primary,
    fontWeight: '600',
  },
  horizontalScroll: {
    flexDirection: 'row',
  },
  trendingItem: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: spacing.radiusXL,
    marginRight: spacing.sm,
  },
  trendingText: {
    color: colors.white,
    fontWeight: 'bold',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  popularCard: {
    width: '48%',
    backgroundColor: colors.card,
    borderRadius: 12,
    marginBottom: 15,
    overflow: 'hidden',
    ...shadows.small,
  },
  popularImagePlaceholder: {
    height: 100,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    padding: spacing.sm,
  },
  // Container wrapping image and rating
  popularImageContainer: {
    width: '100%',
    height: 120,
    position: 'relative', // Allows absolute positioning of rating
  },

  // The image itself
  cardImage: {
    width: '100%',
    height: '100%',
    borderTopLeftRadius: 12, 
    borderTopRightRadius: 12,
  },

  // Rating badge fix:
  ratingBadgeOverImage: {
    position: 'absolute',
    top: 10,
    right: 10,
    
    flexDirection: 'row',
    alignItems: 'center',
    
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 12,
  },
  ratingBadge: {
    flexDirection: 'row',
    backgroundColor: colors.white,
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
    padding: spacing.md,
  },
  popularCity: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  popularCountry: {
    fontSize: 12,
    color: colors.textLight,
  },
  travelerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5,
  },
  travelerText: {
    fontSize: 10,
    color: colors.textMuted,
    marginLeft: 3,
  },
  emptyText: {
    textAlign: 'center',
    color: colors.textMuted,
    marginTop: 20,
    width: '100%',
  },
  fab: buttons.fab,
});