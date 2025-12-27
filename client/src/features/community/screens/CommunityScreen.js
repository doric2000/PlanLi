import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  FlatList,
  RefreshControl, 
} from 'react-native';
import FilterIconButton from '../../../components/FilterIconButton';
import RecommendationsFilterModal from '../../../components/RecommendationsFilterModal';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import FabButton from '../../../components/FabButton';
import { useFocusEffect } from '@react-navigation/native';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import RecommendationCard from '../../../components/RecommendationCard';
import { CommentsModal } from '../../../components/CommentsModal';
import { colors, spacing, common, buttons, tags } from '../../../styles';
import { PRICE_TAGS,CATEGORY_TAGS } from '../../../constants/Constatns';


/**
 * Screen displaying community recommendations.
 * Allows users to view, like, and comment on recommendations.
 *
 * @param {Object} navigation - Navigation object.
 */
export default function CommunityScreen({ navigation }) {
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // --- Filter Management ---
  const [filterVisible, setFilterVisible] = useState(false);
  const [filterCategories, setFilterCategories] = useState([]);
  const [filterBudgets, setFilterBudgets] = useState([]);      
  const [filterDestination, setFilterDestination] = useState('');



  // --- Comments Modal Management ---
  const [commentsModalVisible, setCommentsModalVisible] = useState(false);
  const [selectedPostId, setSelectedPostId] = useState(null);

  // Function passed to card to open comments
  const handleOpenComments = (postId) => {
    setSelectedPostId(postId);
    setCommentsModalVisible(true);
  };

  // Function to fetch all recommendations
  const fetchRecommendations = async () => {
    try {
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

  useFocusEffect(
    useCallback(() => {
      fetchRecommendations();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchRecommendations();
  };

  // --- Filtering Logic ---
  const filteredRecommendations = recommendations.filter((item) => {
    const queries = filterDestination
      .split(',')                  
      .map((q) => q.trim().toLowerCase())
      .filter((q) => q.length > 0);  

    if (queries.length > 0) {
      const title = (item.title || '').toLowerCase();
      const location = (item.location || '').toLowerCase();   // Can be "Tel Aviv"
      const description = (item.description || '').toLowerCase();

      // Additional fields - if present in document:
      const city = (item.city || '').toLowerCase();
      const country = (item.country || '').toLowerCase();     // e.g. "Israel", "Greece"

      // Combine all to single text for search
      const text = `${title} ${location} ${description} ${city} ${country}`;
      const matchesText = queries.some((q) => text.includes(q));
      if (!matchesText) return false;
    }

    if (filterCategories.length > 0 && !filterCategories.includes(item.category)) {
      return false;
    }

    if (filterBudgets.length > 0 && !filterBudgets.includes(item.budget)) {
      return false;
    }

    return true;
  });

  const isFiltered =
    filterDestination.trim() !== '' ||
    filterCategories.length > 0 ||
    filterBudgets.length > 0;

  const handleClearFilters = () => {
    setFilterCategories([]);
    setFilterBudgets([]);
    setFilterDestination('');
    setFilterVisible(false);
  };

  const applyFilters = (next) => {
    setFilterCategories(Array.isArray(next?.categories) ? next.categories : []);
    setFilterBudgets(Array.isArray(next?.budgets) ? next.budgets : []);
    setFilterDestination(next?.destination || '');
    setFilterVisible(false);
  };


  return (
    <SafeAreaView style={common.container}>
      
      {/* Header */}
      <View style={common.screenHeader}>
        <Text style={common.screenHeaderTitle}>קהילת המטיילים</Text>
        <Text style={common.screenHeaderSubtitle}>גלו המלצות חדשות!</Text>
        
        <FilterIconButton active={isFiltered} onPress={() => setFilterVisible(true)} />
      </View>

      {/* Main List */}
      {loading ? (
        <View style={common.center}>
            <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredRecommendations}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            // --- Passing function to card ---
            <RecommendationCard 
                item={item} 
                onCommentPress={handleOpenComments} 
                onDeleted={(deletedId) => {
                  setRecommendations((prev) => prev.filter((r) => r.id !== deletedId));
                }}
            />
          )}
          contentContainerStyle={common.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <View style={common.emptyState}>
              <Ionicons name="images-outline" size={50} color={colors.textMuted} />
              <Text style={common.emptyText}>
                {isFiltered ? 'אין תוצאות מתאימות למסננים שבחרת.' : 'עדיין אין המלצות.'}
              </Text>
              {!isFiltered && (
                <Text style={common.emptySubText}>היה הראשון לשתף!</Text>
              )}
            </View>
          }
        />
      )}

      {/* Floating Action Button (FAB) */}
      <FabButton onPress={() => navigation.navigate('AddRecommendation')} />

      {/* --- Filter Modal (Existing) --- */}
      <RecommendationsFilterModal
        visible={filterVisible}
        onClose={() => setFilterVisible(false)}
        filters={{
          destination: filterDestination,
          categories: filterCategories,
          budgets: filterBudgets,
        }}
        onApply={applyFilters}
        onClear={handleClearFilters}
      />


      <CommentsModal
        visible={commentsModalVisible}
        onClose={() => setCommentsModalVisible(false)}
        postId={selectedPostId}
      />
      
    </SafeAreaView>
  );
}