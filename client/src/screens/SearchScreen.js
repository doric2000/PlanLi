import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  Keyboard
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db } from '../config/firebase';
import RecommendationCard from '../components/RecommendationCard';

export default function SearchScreen({ navigation }) {
  const [searchText, setSearchText] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [initialRecommendations, setInitialRecommendations] = useState([]);

  // Fetch some initial recommendations to show before search
  useEffect(() => {
    fetchInitialRecommendations();
  }, []);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchText.trim() === '') {
        setResults(initialRecommendations);
      } else {
        performSearch(searchText);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [searchText, initialRecommendations]);

  const fetchInitialRecommendations = async () => {
    setLoading(true);
    try {
      const q = query(
        collection(db, 'recommendations'),
        orderBy('createdAt', 'desc'),
        limit(10)
      );
      const querySnapshot = await getDocs(q);
      const recs = [];
      querySnapshot.forEach((doc) => {
        recs.push({ id: doc.id, ...doc.data() });
      });
      setInitialRecommendations(recs);
      // Results will be updated by the useEffect when initialRecommendations changes
      if (searchText.trim() === '') {
        setResults(recs);
      }
    } catch (error) {
      console.error("Error fetching initial recommendations: ", error);
    } finally {
      setLoading(false);
    }
  };

  const performSearch = async (text) => {
    setLoading(true);
    try {
      // Note: Firestore does not support native case-insensitive search or full-text search.
      // We are using a simple prefix search here.
      // Ideally, store a lowercase version of the title for searching or use Algolia.

      // Strategy: Search by title prefix (case-sensitive unfortunately)
      const q = query(
        collection(db, 'recommendations'),
        where('title', '>=', text),
        where('title', '<=', text + '\uf8ff'),
        limit(20)
      );

      const querySnapshot = await getDocs(q);
      const recs = [];
      querySnapshot.forEach((doc) => {
        recs.push({ id: doc.id, ...doc.data() });
      });
      setResults(recs);
    } catch (error) {
      console.error("Error searching: ", error);
    } finally {
      setLoading(false);
    }
  };

  const clearSearch = () => {
    setSearchText('');
    setResults(initialRecommendations);
    Keyboard.dismiss();
  };

  const renderItem = ({ item }) => (
    <RecommendationCard item={item} />
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Search Header */}
      <View style={styles.header}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color="#666" style={styles.searchIcon} />
          <TextInput
            style={styles.input}
            placeholder="Search recommendations..."
            value={searchText}
            onChangeText={setSearchText}
            placeholderTextColor="#999"
            autoCapitalize="none"
          />
          {searchText.length > 0 && (
            <TouchableOpacity onPress={clearSearch}>
              <Ionicons name="close-circle" size={20} color="#666" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Content */}
      <View style={styles.content}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#FF8C00" />
          </View>
        ) : (
          <FlatList
            data={results}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="search-outline" size={64} color="#ccc" />
                <Text style={styles.emptyText}>
                  {searchText ? "No results found" : "Start searching for your next adventure"}
                </Text>
              </View>
            }
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f2f5',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
  },
  searchIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#333',
    height: '100%',
  },
  content: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    paddingBottom: 80, // Extra space for bottom tab
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 60,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
  },
});
