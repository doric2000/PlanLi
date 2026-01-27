import React, { useState } from 'react';
import { 
  View, 
  Text, 
  TextInput,
  Alert,
  ActivityIndicator, 
  FlatList, 
  RefreshControl, 
  TouchableOpacity, 
  Modal, 
  StyleSheet 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

// --- Components ---
import ScreenHeader from '../../../components/ScreenHeader'; 
import RecommendationsFilterModal from '../../../components/RecommendationsFilterModal';
import RecommendationCard from '../../../components/RecommendationCard';
import { CommentsModal } from '../../../components/CommentsModal';
import FabButton from '../../../components/FabButton';
import ActiveFiltersList from '../../../components/ActiveFiltersList';
import { SortMenuModal } from '../components/SortMenuModal';

// --- Hooks ---
import { useRecommendations } from '../../../hooks/useRecommendations';
import { useRecommendationFilter } from '../../../hooks/useRecommendationFilter';

// --- Global Styles ---
import { colors, common, spacing, typography, shadows } from '../../../styles';
import { auth } from '../../../config/firebase';
import { getUserTier } from '../../../utils/userTier';

export default function CommunityScreen({ navigation }) {
  // --- State ---
  const [sortBy, setSortBy] = useState('popularity');
  const [sortMenuVisible, setSortMenuVisible] = useState(false);
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [commentsModalVisible, setCommentsModalVisible] = useState(false);
  const [selectedPostId, setSelectedPostId] = useState(null);

  // --- Hooks ---
  const { data: recommendations, loading, refreshing, refresh, removeRecommendation } = useRecommendations(sortBy);
  const { filteredData, filters, isFiltered, updateFilters, clearFilters } = useRecommendationFilter(recommendations);

  // --- Handlers ---
  const handleSortSelect = (option) => { setSortBy(option); setSortMenuVisible(false); };
  const handleOpenComments = (postId) => { setSelectedPostId(postId); setCommentsModalVisible(true); };
  
  // FIXED: Added the logic to handle 'tag' removal
  const handleRemoveFilter = (type, value) => {
    if (type === 'destination') {
      updateFilters({ destination: '' });
    } else if (type === 'category') {
      updateFilters({ categories: filters.categories.filter((c) => c !== value) });
    } else if (type === 'budget') {
      updateFilters({ budgets: filters.budgets.filter((b) => b !== value) });
    } else if (type === 'tag') {
      // Logic for removing a specific tag from the array
      updateFilters({ tags: filters.tags.filter((t) => t !== value) });
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      
      {/* --- HEADER --- */}
      <ScreenHeader
        title="קהילת המטיילים"
        subtitle="גלו המלצות חדשות!"
        compact
        renderLeft={() => (
          <TouchableOpacity 
            style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}
            onPress={() => setSortMenuVisible(true)}
          >
            <Ionicons name="chevron-down" size={20} color={colors.textPrimary} />
            <Text style={{ ...typography.caption, fontWeight: 'bold', color: colors.textPrimary }}>
              {sortBy === 'popularity' ? 'פופולרי' : 'חדש'}
            </Text>
          </TouchableOpacity>
        )}
      />

      {/* --- DESTINATION QUICK FILTER (Option A) --- */}
      <View style={localStyles.destinationSearchWrap}>
        <View style={localStyles.destinationSearchRow}>
          <TouchableOpacity
            onPress={() => setFilterModalVisible(true)}
            style={localStyles.destinationFilterBtn}
            accessibilityRole="button"
            accessibilityLabel="מסננים"
          >
            <Ionicons
              name="filter"
              size={18}
              color={isFiltered ? colors.primary : colors.textSecondary}
            />
          </TouchableOpacity>

          <View style={localStyles.destinationSearchPill}>
            <Ionicons
              name="search"
              size={18}
              color={colors.textSecondary}
              style={localStyles.destinationSearchPillIcon}
            />

            <TextInput
              value={filters.destination}
              onChangeText={(text) => updateFilters({ destination: text })}
              placeholder="חפש יעד (עיר / מדינה)..."
              placeholderTextColor={colors.textMuted}
              style={localStyles.destinationSearchInput}
              textAlign="right"
              autoCorrect={false}
              autoCapitalize="none"
            />

            {!!filters.destination && (
              <TouchableOpacity
                onPress={() => updateFilters({ destination: '' })}
                style={localStyles.destinationClearBtn}
                accessibilityRole="button"
                accessibilityLabel="נקה יעד"
              >
                <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      {/* --- ACTIVE FILTERS BAR --- */}
      <ActiveFiltersList filters={filters} onRemove={handleRemoveFilter} />

      {/* --- RECOMMENDATIONS LIST --- */}
      {loading ? (
        <View style={common.center}>
            <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredData}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <RecommendationCard 
                item={item} 
                onCommentPress={handleOpenComments} 
                onDeleted={removeRecommendation}
            />
          )}
          contentContainerStyle={common.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
          ListEmptyComponent={
            <View style={common.emptyState}>
              <Ionicons name="images-outline" size={50} color={colors.textMuted} />
              <Text style={common.emptyText}>{isFiltered ? 'אין תוצאות.' : 'אין המלצות עדיין.'}</Text>
            </View>
          }
        />
      )}

      <FabButton
        onPress={() => {
          const tier = getUserTier(auth.currentUser);
          if (tier === 'guest') {
            Alert.alert('יש להתחבר', 'כדי ליצור המלצה צריך להתחבר.');
            navigation.navigate('Login');
            return;
          }
          if (tier === 'unverified') {
            Alert.alert('נדרש אימות', 'כדי ליצור המלצה צריך לאמת את האימייל.');
            navigation.navigate('VerifyEmail');
            return;
          }
          navigation.navigate('AddRecommendation');
        }}
      />

      {/* --- FILTER MODAL --- */}
      <RecommendationsFilterModal
        visible={filterModalVisible}
        onClose={() => setFilterModalVisible(false)}
        filters={filters}
        onApply={(next) => { 
          updateFilters(next); 
          setFilterModalVisible(false); 
        }}
        onClear={() => { 
          clearFilters(); 
          setFilterModalVisible(false); 
        }}
      />
      
      <CommentsModal 
        visible={commentsModalVisible} 
        onClose={() => setCommentsModalVisible(false)} 
        postId={selectedPostId} 
      />

      {/* Sort Menu Modal */}
    <SortMenuModal 
      visible={sortMenuVisible} 
      onClose={() => setSortMenuVisible(false)} 
      sortBy={sortBy} 
      onSelect={handleSortSelect} 
/>

    </SafeAreaView>
  );
}

const localStyles = StyleSheet.create({
  destinationSearchWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: 0,
    paddingBottom: spacing.xs,
  },
  destinationSearchRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
  },
  destinationFilterBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.borderLight || '#F3F4F6',
    ...shadows.small,
    marginLeft: spacing.sm,
  },
  destinationSearchPill: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.borderLight || '#F3F4F6',
    borderRadius: 18,
    paddingHorizontal: spacing.md,
    height: 36,
    ...shadows.small,
  },
  destinationSearchPillIcon: {
    marginLeft: spacing.sm,
  },
  destinationSearchInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 14,
    paddingVertical: 0,
    writingDirection: 'rtl',
  },
  destinationClearBtn: {
    marginRight: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center'
  },
  sortMenu: {
    width: 220, backgroundColor: 'white', borderRadius: 12, padding: spacing.md, elevation: 5
  },
  sortOption: {
    flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee'
  },
  sortOptionLabelRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
  }
});