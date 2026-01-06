import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
// שימו לב להוספת collectionGroup
import { getDocs, query, limit, collectionGroup } from 'firebase/firestore';
import CityCard from '../../../components/CityCard';
import { db } from '../../../config/firebase';
import { colors, spacing, typography, buttons, shadows, common, cards } from '../../../styles';
import GooglePlacesInput from '../../../components/GooglePlacesInput'; 
import { getOrCreateDestination } from '../../../services/LocationService';
import { USE_DEVELOPER_DESTINATION_SEARCH } from '../../../constants/Constants';
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

  const [useGoogleFallback, setUseGoogleFallback] = useState(false);
  
  // Fetch popular destinations
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
    } finally {
      setRefreshing(false);
    }
  };
  
  // Fetch on mount
  useEffect(() => {
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
    // `description` is typically the formatted_address from Google (often includes the country name).
    const description = (city.description || '').toLowerCase();
    const countryId = (city.countryId || '').toLowerCase();

    // Search by city name or country name
    return name.includes(q) || description.includes(q) || countryId.includes(q);
  });

  const handleGoogleSelect = async (placeId) => {
    try {
      console.log("Selected Place ID:", placeId);
      const result = await getOrCreateDestination(placeId);
      console.log("Service Result:", result);

      if (result) {
        setUseGoogleFallback(false);
        navigation.navigate('LandingPage', {
          cityId: result.city.id,
          countryId: result.country.id,
        });
      }
    } catch (error) {
      console.error(error);
      alert("Could not load destination.");
    }
  };

  return (
    <SafeAreaView style={common.container}>
      <ScrollView
        contentContainerStyle={common.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        {/* Header */}
        <View style={common.homeHeader}>
          <Text style={common.homeHeaderTitle}>יאלללה, לאן טסים?</Text>
          <View style={styles.searchContainer}>
            {USE_DEVELOPER_DESTINATION_SEARCH && !useGoogleFallback ? (
              <GooglePlacesInput
                mode="filter"
                value={searchQuery}
                onChangeValue={setSearchQuery}
                hasLocalResults={filteredDestinations.length > 0}
                onRequestGoogleSearch={(q) => {
                  setSearchQuery(q);
                  setUseGoogleFallback(true);
                }}
              />
            ) : (
              <GooglePlacesInput
                mode="google"
                seedQuery={USE_DEVELOPER_DESTINATION_SEARCH ? searchQuery : undefined}
                onSelect={handleGoogleSelect}
              />
            )}
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
                <CityCard
                  key={city.id}
                  city={city}
                  onPress={() => navigation.navigate('LandingPage', {
                    cityId: city.id,
                    countryId: city.countryId
                  })}
                />
              ))
            )}
          </View>
        </View>

        {/* Spacer for FAB */}
        <View style={styles.spacer} />
      </ScrollView>

      
      {/* Temporary button removed as we now have real cards */}

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  searchContainer: {
    width: '100%',
    position: 'relative',
    zIndex: 10000,
  },
  spacer: {
    height: 80,
  },
});
