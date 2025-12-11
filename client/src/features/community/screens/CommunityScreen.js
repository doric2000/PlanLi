import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
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
import CommentsSection from '../components/CommentSection';
import { colors, spacing, typography, buttons, tags } from '../../../styles';

const CATEGORIES = ['Food', 'Attraction', 'Hotel', 'Nightlife', 'Shopping'];
const BUDGETS = ['$', '$$', '$$$', '$$$$'];

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
  };

  return (
    <SafeAreaView style={styles.container}>
      
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>קהילת המטיילים 🌍</Text>
        <Text style={styles.headerSubtitle}>גלה המלצות חדשות מרחבי העולם</Text>
        
        <TouchableOpacity style={styles.filterButton} onPress={() => setFilterVisible(true)}>
            <Ionicons name="options-outline" size={24} color={isFiltered ? colors.primary : colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* Main List */}
      {loading ? (
        <View style={styles.center}>
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
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="images-outline" size={50} color={colors.textMuted} />
              <Text style={styles.emptyText}>
                {isFiltered ? 'אין תוצאות מתאימות למסננים שבחרת.' : 'עדיין אין המלצות.'}
              </Text>
              {!isFiltered && (
                <Text style={styles.emptySubText}>היה הראשון לשתף!</Text>
              )}
            </View>
          }
        />
      )}

      {/* Floating Action Button (FAB) */}
      <TouchableOpacity
        style={styles.fab}
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
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>מסננים</Text>
              <TouchableOpacity onPress={() => setFilterVisible(false)}>
                <Ionicons name="close" size={22} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalLabel}>יעד / עיר / מדינה</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="תל אביב, יוון, תאילנד..."
              value={filterDestination}
              onChangeText={setFilterDestination}
              textAlign="right"
            />

            <Text style={[styles.modalLabel, { marginTop: spacing.lg }]}>קטגוריה</Text>
            <View style={styles.chipRow}>
              {CATEGORIES.map((cat) => {
                const selected = filterCategories.includes(cat);
                return (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.chip, selected && styles.chipSelected]}
                    onPress={() =>
                      setFilterCategories((prev) =>
                        prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
                      )
                    }
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{cat}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.modalLabel, { marginTop: spacing.lg }]}>תקציב</Text>
            <View style={styles.chipRow}>
              {BUDGETS.map((b) => {
                const selected = filterBudgets.includes(b);
                return (
                  <TouchableOpacity
                    key={b}
                    style={[styles.budgetChip, selected && styles.budgetChipSelected]}
                    onPress={() =>
                      setFilterBudgets((prev) =>
                        prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b]
                      )
                    }
                  >
                    <Text style={[styles.budgetChipText, selected && styles.budgetChipTextSelected]}>{b}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.clearButton} onPress={handleClearFilters}>
                <Text style={styles.clearButtonText}>נקה</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.applyButton} onPress={() => setFilterVisible(false)}>
                <Text style={styles.applyButtonText}>הפעל מסננים</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* --- Comments Modal (New) --- */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={commentsModalVisible}
        onRequestClose={() => setCommentsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.commentsModalContent}> {/* Special design for comments */}
            
            {/* Comments Header */}
            <View style={styles.modalHeaderRow}>
                <Text style={styles.modalTitle}>תגובות</Text>
                <TouchableOpacity onPress={() => setCommentsModalVisible(false)}>
                    <Ionicons name="close" size={24} color={colors.textPrimary} />
                </TouchableOpacity>
            </View>
            
            {/* Embedding the comments component */}
            {selectedPostId && (
                <CommentsSection 
                    collectionName="recommendations" 
                    postId={selectedPostId} 
                />
            )}
            
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    padding: spacing.xl,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    alignItems: 'center',
    position: 'relative'
  },
  headerTitle: { ...typography.h3, color: '#1E3A5F' }, // Kept specific brand color
  headerSubtitle: { ...typography.bodySmall, color: colors.textSecondary, marginTop: spacing.xs },
  filterButton: { position: 'absolute', right: 20, top: 25, padding: 5 },
  listContent: { padding: spacing.lg, paddingBottom: 80 },
  emptyState: { alignItems: 'center', marginTop: 50 },
  emptyText: { marginTop: spacing.md, fontSize: 18, color: colors.textMuted },
  emptySubText: { fontSize: 14, color: colors.primary, fontWeight: 'bold' },
  fab: buttons.fab,
  
  // Modal Common Styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    paddingBottom: spacing.sm
  },
  modalTitle: { ...typography.h4 },
  
  // Filter Modal Styles
  modalContent: {
    backgroundColor: colors.white,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20
  },
  modalLabel: {
    ...typography.label,
    marginBottom: 6,
    textAlign: 'right'
  },
  modalInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: colors.background,
    fontSize: 14
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end' },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.borderLight,
    marginLeft: 8,
    marginBottom: 8
  },
  chipSelected: {
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: colors.primary
  },
  chipText: { fontSize: 13, color: colors.textSecondary },
  chipTextSelected: { color: colors.primary, fontWeight: '700' },
  budgetChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.borderLight,
    marginLeft: 8,
    marginBottom: 8
  },
  budgetChipSelected: { backgroundColor: colors.primary },
  budgetChipText: { fontSize: 13, color: colors.textPrimary, fontWeight: '600' },
  budgetChipTextSelected: { color: colors.white },
  modalActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xl },
  clearButton: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.textMuted,
    backgroundColor: colors.background
  },
  clearButtonText: { fontSize: 14, color: colors.textPrimary, fontWeight: '500' },
  applyButton: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: '#1E3A5F'
  },
  applyButtonText: { fontSize: 14, color: colors.white, fontWeight: '600' },

  // --- Comments Modal ---
  commentsModalContent: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: '75%',
    padding: spacing.xl,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  }
});