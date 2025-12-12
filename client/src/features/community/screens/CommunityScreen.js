import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Modal,   
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import RecommendationCard from '../components/RecommendationCard';
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

  // Temp states for filter modal
  const [tempCategories, setTempCategories] = useState([]);
  const [tempBudgets, setTempBudgets] = useState([]);
  const [tempDestination, setTempDestination] = useState('');

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
    setTempCategories([]);
    setTempBudgets([]);
    setTempDestination('');
  };

  const applyFilters = () => {
    setFilterCategories(tempCategories);
    setFilterBudgets(tempBudgets);
    setFilterDestination(tempDestination);
    setFilterVisible(false);
  };

  return (
    <SafeAreaView style={common.container}>
      
      {/* Header */}
      <View style={common.screenHeader}>
        <Text style={common.screenHeaderTitle}>קהילת המטיילים</Text>
        <Text style={common.screenHeaderSubtitle}>גלו המלצות חדשות!</Text>
        
        <TouchableOpacity style={buttons.filterIcon} onPress={() => setFilterVisible(true)}>
            <Ionicons name="options-outline" size={24} color={isFiltered ? colors.primary : colors.textPrimary} />
        </TouchableOpacity>
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
      <TouchableOpacity
        style={buttons.fab}
        onPress={() => navigation.navigate('AddRecommendation')}
      >
        <Ionicons name="add" size={32} color="#fff" />
      </TouchableOpacity>

      {/* --- Filter Modal (Existing) --- */}
      <Modal
        visible={filterVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setFilterVisible(false)}
      >
        <View style={common.modalOverlay}>
          <View style={common.modalContent}>
            <View style={common.modalHeader}>
              <Text style={common.modalTitle}>מסננים</Text>
              <TouchableOpacity onPress={() => setFilterVisible(false)}>
                <Ionicons name="close" size={22} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <Text style={common.modalLabel}>יעד / עיר / מדינה</Text>
            <TextInput
              style={common.modalInput}
              placeholder="תל אביב, יוון, תאילנד..."
              value={tempDestination}
              onChangeText={setTempDestination}
              textAlign="right"
            />

            <Text style={[common.modalLabel, { marginTop: spacing.lg }]}>קטגוריה</Text>
            <View style={tags.chipRow}>
              {CATEGORY_TAGS.map((cat) => {
                const selected = tempCategories.includes(cat);
                return (
                  <TouchableOpacity
                    key={cat}
                    style={[tags.filterChip, selected && tags.filterChipSelected]}
                    onPress={() =>
                      setTempCategories((prev) =>
                        prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
                      )
                    }
                  >
                    <Text style={[tags.filterChipText, selected && tags.filterChipTextSelected]}>{cat}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[common.modalLabel, { marginTop: spacing.lg }]}>תקציב</Text>
            <View style={tags.chipRow}>
              {PRICE_TAGS.map((b) => {
                const selected = tempBudgets.includes(b);
                return (
                  <TouchableOpacity
                    key={b}
                    style={[tags.budgetChip, selected && tags.budgetChipSelected]}
                    onPress={() =>
                      setTempBudgets((prev) =>
                        prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b]
                      )
                    }
                  >
                    <Text style={[tags.budgetChipText, selected && tags.budgetChipTextSelected]}>{b}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={common.modalActions}>
              <TouchableOpacity style={buttons.clear} onPress={handleClearFilters}>
                <Text style={buttons.clearText}>נקה</Text>
              </TouchableOpacity>
              <TouchableOpacity style={buttons.apply} onPress={applyFilters}>
                <Text style={buttons.applyText}>הפעל מסננים</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <CommentsModal
        visible={commentsModalVisible}
        onClose={() => setCommentsModalVisible(false)}
        postId={selectedPostId}
      />

    </SafeAreaView>
  );
}