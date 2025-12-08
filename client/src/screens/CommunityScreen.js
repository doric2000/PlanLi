import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  TouchableOpacity,
  RefreshControl
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../config/firebase';
import RecommendationCard from '../components/RecommendationCard';

export default function CommunityScreen({ navigation }) {
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // פונקציה לשליפת כל ההמלצות (מהחדש לישן)
  const fetchRecommendations = async () => {
    try {
      // שאילתה בסיסית: תביא את כל ההמלצות, ממוינות לפי זמן יצירה יורד
      const q = query(
        collection(db, 'recommendations'),
        orderBy('createdAt', 'desc')
      );
      
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

  // רענון אוטומטי בכל פעם שנכנסים לעמוד
  useFocusEffect(
    useCallback(() => {
      fetchRecommendations();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchRecommendations();
  };

  return (
    <SafeAreaView style={styles.container}>
      
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>קהילת המטיילים 🌍</Text>
        <Text style={styles.headerSubtitle}>גלה המלצות חדשות מרחבי העולם</Text>
        
        {/* כפתור סינון (כרגע רק אייקון, נפעיל אותו בשלב הבא) */}
        <TouchableOpacity style={styles.filterButton} onPress={() => alert('מסננים בקרוב...')}>
            <Ionicons name="options-outline" size={24} color="#333" />
        </TouchableOpacity>
      </View>

      {/* Main List */}
      {loading ? (
        <View style={styles.center}>
            <ActivityIndicator size="large" color="#2EC4B6" />
        </View>
      ) : (
        <FlatList
          data={recommendations}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <RecommendationCard item={item} />}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
                <Ionicons name="images-outline" size={50} color="#ccc" />
                <Text style={styles.emptyText}>עדיין אין המלצות.</Text>
                <Text style={styles.emptySubText}>היה הראשון לשתף!</Text>
            </View>
          }
        />
      )}

      {/* Floating Action Button (FAB) - הועבר לכאן! */}
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
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  header: {
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    alignItems: 'center',
    position: 'relative' // בשביל כפתור הסינון
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1E3A5F',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 5
  },
  filterButton: {
    position: 'absolute',
    right: 20,
    top: 25,
    padding: 5
  },
  listContent: {
    padding: 15,
    paddingBottom: 80, // מקום לכפתור הצף
  },
  emptyState: {
    alignItems: 'center',
    marginTop: 50,
  },
  emptyText: {
    marginTop: 10,
    fontSize: 18,
    color: '#888',
  },
  emptySubText: {
    fontSize: 14,
    color: '#2EC4B6',
    fontWeight: 'bold',
  },
  fab: {
    position: 'absolute',
    bottom: 20,
    left: 20, // בצד שמאל (או ימין אם תעדיף right: 20)
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FF9F1C', // הכתום של המותג
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
  },
});