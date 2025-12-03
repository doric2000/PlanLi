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
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../config/firebase';

export default function HomeScreen({ navigation }) {
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchRecommendations = async () => {
    try {
      // In a real app, we might paginate or limit
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

  // Fetch when screen focuses (in case we added a new one)
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

  const renderPopularDestination = (city, country, rating, travelers, imageColor) => (
    <View style={styles.popularCard} key={city}>
      <View style={[styles.popularImagePlaceholder, { backgroundColor: imageColor }]}>
        <View style={styles.ratingBadge}>
          <Ionicons name="star" size={12} color="#FFD700" />
          <Text style={styles.ratingText}>{rating}</Text>
        </View>
      </View>
      <View style={styles.popularInfo}>
        <Text style={styles.popularCity}>{city}</Text>
        <Text style={styles.popularCountry}>{country}</Text>
        <View style={styles.travelerInfo}>
          <Ionicons name="location-outline" size={12} color="#666" />
          <Text style={styles.travelerText}>{travelers} travelers</Text>
        </View>
      </View>
    </View>
  );

  const renderRecommendation = (item) => (
    <View style={styles.recCard} key={item.id}>
      <View style={styles.recHeader}>
        <View style={styles.recUserAvatar} />
        <View>
          <Text style={styles.recTitle}>{item.title}</Text>
          <Text style={styles.recCategory}>{item.category}</Text>
        </View>
      </View>

      {item.images && item.images.length > 0 && (
        <Image source={{ uri: item.images[0] }} style={styles.recImage} />
      )}

      <View style={styles.recBody}>
        <Text style={styles.recDesc} numberOfLines={3}>{item.description}</Text>
        <View style={styles.recTags}>
          {item.tags && item.tags.map((tag, index) => (
            <View key={index} style={styles.recTag}>
              <Text style={styles.recTagText}>{tag}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );

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
            />
          </View>
        </View>

        {/* Trending Now */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Trending Now 📈</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalScroll}>
            {['Thailand', 'Greece', 'Iceland', 'Portugal'].map(renderTrendingItem)}
          </ScrollView>
        </View>

        {/* Popular Destinations */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Popular Destinations</Text>
            <TouchableOpacity><Text style={styles.seeAllText}>View All</Text></TouchableOpacity>
          </View>
          <View style={styles.grid}>
            {renderPopularDestination('Paris', 'France', '4.8', '2.4K', '#87CEEB')}
            {renderPopularDestination('Tokyo', 'Japan', '4.9', '3.1K', '#FFB6C1')}
            {renderPopularDestination('Bali', 'Indonesia', '4.7', '1.8K', '#90EE90')}
            {renderPopularDestination('New York', 'USA', '4.8', '2.9K', '#D3D3D3')}
          </View>
        </View>

        {/* Community Feed - Dynamic from Firestore */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Community Feed (Recent)</Text>
          {loading ? (
            <ActivityIndicator size="large" color="#2EC4B6" />
          ) : recommendations.length === 0 ? (
            <Text style={styles.emptyText}>No recommendations yet. Be the first to add one!</Text>
          ) : (
            recommendations.map(renderRecommendation)
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
  // Recommendation Card
  recCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    overflow: 'hidden',
  },
  recHeader: {
    flexDirection: 'row',
    padding: 10,
    alignItems: 'center',
  },
  recUserAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ddd',
    marginRight: 10,
  },
  recTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'left',
  },
  recCategory: {
    fontSize: 12,
    color: '#666',
    textAlign: 'left',
  },
  recImage: {
    width: '100%',
    height: 200,
    backgroundColor: '#eee',
  },
  recBody: {
    padding: 10,
  },
  recDesc: {
    fontSize: 14,
    color: '#444',
    marginBottom: 10,
    lineHeight: 20,
    textAlign: 'left',
  },
  recTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  recTag: {
    backgroundColor: '#f0f2f5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginRight: 6,
    marginBottom: 6,
  },
  recTagText: {
    fontSize: 12,
    color: '#555',
  },
  emptyText: {
    textAlign: 'center',
    color: '#888',
    marginTop: 20,
  },
  // FAB
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FF9F1C', // Orange
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
  },
});
