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
import { db } from '../config/firebase';
import RecommendationCard from '../components/RecommendationCard';
import CommentsSection from '../components/CommentSection'; // <--- 1. הוספת הייבוא

const CATEGORIES = ['Food', 'Attraction', 'Hotel', 'Nightlife', 'Shopping'];
const BUDGETS = ['$', '$$', '$$$', '$$$$'];

export default function CommunityScreen({ navigation }) {
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // --- ניהול הפילטרים ---
  const [filterVisible, setFilterVisible] = useState(false);
  const [filterCategories, setFilterCategories] = useState([]);
  const [filterBudgets, setFilterBudgets] = useState([]);      
  const [filterDestination, setFilterDestination] = useState('');

  // --- ניהול המודל של התגובות ---
  const [commentsModalVisible, setCommentsModalVisible] = useState(false);
  const [selectedPostId, setSelectedPostId] = useState(null);

  // פונקציה שנשלחת לכרטיסייה לפתיחת התגובות
  const handleOpenComments = (postId) => {
    setSelectedPostId(postId);
    setCommentsModalVisible(true);
  };

  // פונקציה לשליפת כל ההמלצות
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

  // --- לוגיקת הסינון ---
  const filteredRecommendations = recommendations.filter((item) => {
    const queries = filterDestination
      .split(',')                  
      .map((q) => q.trim().toLowerCase())
      .filter((q) => q.length > 0);  

    if (queries.length > 0) {
      const title = (item.title || '').toLowerCase();
      const location = (item.location || '').toLowerCase();   // יכול להיות "Tel Aviv"
      const description = (item.description || '').toLowerCase();

      // שדות נוספים – אם קיימים בדוקומנט:
      const city = (item.city || '').toLowerCase();
      const country = (item.country || '').toLowerCase();     // למשל "Israel", "Greece"

      // מחברים את כולם לטקסט אחד לחיפוש
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
            <Ionicons name="options-outline" size={24} color={isFiltered ? '#2EC4B6' : '#333'} />
        </TouchableOpacity>
      </View>

      {/* Main List */}
      {loading ? (
        <View style={styles.center}>
            <ActivityIndicator size="large" color="#2EC4B6" />
        </View>
      ) : (
        <FlatList
          data={filteredRecommendations}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            // --- 2. העברת הפונקציה לכרטיסייה ---
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
              <Ionicons name="images-outline" size={50} color="#ccc" />
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

      {/* --- Filter Modal (קיים) --- */}
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
                <Ionicons name="close" size={22} color="#111827" />
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

            <Text style={[styles.modalLabel, { marginTop: 16 }]}>קטגוריה</Text>
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

            <Text style={[styles.modalLabel, { marginTop: 16 }]}>תקציב</Text>
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

      {/* --- 3. Comments Modal (חדש!) --- */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={commentsModalVisible}
        onRequestClose={() => setCommentsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.commentsModalContent}> {/* עיצוב מיוחד לתגובות */}
            
            {/* Header של התגובות */}
            <View style={styles.modalHeaderRow}>
                <Text style={styles.modalTitle}>תגובות</Text>
                <TouchableOpacity onPress={() => setCommentsModalVisible(false)}>
                    <Ionicons name="close" size={24} color="#333" />
                </TouchableOpacity>
            </View>
            
            {/* הטמעת רכיב התגובות */}
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
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { padding: 20, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee', alignItems: 'center', position: 'relative' },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#1E3A5F' },
  headerSubtitle: { fontSize: 14, color: '#666', marginTop: 5 },
  filterButton: { position: 'absolute', right: 20, top: 25, padding: 5 },
  listContent: { padding: 15, paddingBottom: 80 },
  emptyState: { alignItems: 'center', marginTop: 50 },
  emptyText: { marginTop: 10, fontSize: 18, color: '#888' },
  emptySubText: { fontSize: 14, color: '#2EC4B6', fontWeight: 'bold' },
  fab: { position: 'absolute', bottom: 20, left: 20, width: 60, height: 60, borderRadius: 30, backgroundColor: '#FF9F1C', justifyContent: 'center', alignItems: 'center', shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 4.65, elevation: 8 },
  
  // Modal Common Styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, borderBottomWidth: 1, borderBottomColor: '#eee', paddingBottom: 10 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  
  // Filter Modal Styles
  modalContent: { backgroundColor: '#fff', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  modalLabel: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 6, textAlign: 'right' },
  modalInput: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: '#F9FAFB', fontSize: 14 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end' },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#F3F4F6', marginLeft: 8, marginBottom: 8 },
  chipSelected: { backgroundColor: '#E6F7F6', borderWidth: 1, borderColor: '#2EC4B6' },
  chipText: { fontSize: 13, color: '#4B5563' },
  chipTextSelected: { color: '#2EC4B6', fontWeight: '700' },
  budgetChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: '#F3F4F6', marginLeft: 8, marginBottom: 8 },
  budgetChipSelected: { backgroundColor: '#2EC4B6' },
  budgetChipText: { fontSize: 13, color: '#374151', fontWeight: '600' },
  budgetChipTextSelected: { color: '#fff' },
  modalActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 20 },
  clearButton: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 10, borderWidth: 1, borderColor: '#D1D5DB', backgroundColor: '#F9FAFB' },
  clearButtonText: { fontSize: 14, color: '#374151', fontWeight: '500' },
  applyButton: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 10, backgroundColor: '#1E3A5F' },
  applyButtonText: { fontSize: 14, color: '#fff', fontWeight: '600' },

  // --- עיצוב חדש למודל של התגובות ---
  commentsModalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: '75%', // גבוה יותר מהפילטרים
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  }
});