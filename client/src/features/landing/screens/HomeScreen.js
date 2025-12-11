import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
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
import { colors, spacing, typography, buttons, shadows, common, cards } from '../../../styles';

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
    <View style={cards.trending} key={name}>
      <Text style={cards.trendingText}>{name}</Text>
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
    <SafeAreaView style={common.container}>
      <ScrollView
        contentContainerStyle={common.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Header */}
        <View style={common.homeHeader}>
          <Text style={common.homeHeaderTitle}>Where will your next adventure take you?</Text>
          <View style={common.homeSearchBar}>
            <Ionicons name="search" size={20} color={colors.textSecondary} style={common.homeSearchIcon} />
            <TextInput
               placeholder="Search destinations..."
               style={common.homeSearchInput}
               textAlign="right"
               value={searchQuery}
               onChangeText={setSearchQuery}
            />
          </View>
        </View>

        {/* Trending Now (Static for now) */}
        <View style={common.homeSection}>
          <Text style={common.homeSectionTitle}>Trending Now 📈</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={common.homeHorizontalScroll}>
            {['Thailand', 'Greece', 'Iceland', 'Portugal'].map(renderTrendingItem)}
          </ScrollView>
        </View>

        {/* Popular Destinations - DYNAMIC FROM FIREBASE */}
        <View style={common.homeSection}>
          <View style={common.homeSectionHeaderRow}>
            <Text style={common.homeSectionTitle}>Popular Destinations</Text>
            <TouchableOpacity><Text style={common.homeSeeAllText}>View All</Text></TouchableOpacity>
          </View>
          
          <View style={common.homeGrid}>
            {destinations.length === 0 ? (
              <Text style={common.emptyText}>Loading destinations...</Text>
            ) : filteredDestinations.length === 0 ? (
              <Text style={common.emptyText}>
                No destinations match "{searchQuery}"
              </Text>
            ) : (
              filteredDestinations.map((city) => (
                <TouchableOpacity 
                  key={city.id} 
                  style={cards.popular}
                  onPress={() => navigation.navigate('LandingPage', { 
                    cityId: city.id, 
                    countryId: city.countryId 
                  })}
                >
                  <View style={cards.popularImageContainer}>
                    {city.imageUrl ? (
                      <Image
                        source={{ uri: city.imageUrl }}
                        style={cards.popularImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <View
                        style={[
                          cards.popularImagePlaceholder,
                          { backgroundColor: '#87CEEB' },
                        ]}
                      />
                    )}

                    <View style={cards.popularRatingBadge}>
                      <Ionicons name="star" size={12} color="#FFD700" />
                      <Text style={cards.popularRatingText}>{city.rating}</Text>
                    </View>
                  </View>

                  <View style={cards.popularInfo}>
                    <Text style={cards.popularCity}>{city.name || city.id}</Text>
                    <Text style={cards.popularCountry}>{city.countryId}</Text>
                    <View style={cards.popularTravelerRow}>
                      <Ionicons name="location-outline" size={12} color="#666" />
                      <Text style={cards.popularTravelerText}>
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

