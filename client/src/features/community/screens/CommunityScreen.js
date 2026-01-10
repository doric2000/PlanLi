import React, { useState } from 'react';
import { 
  View, 
  Text, 
  TextInput,
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

// --- Hooks ---
import { useRecommendations } from '../../../hooks/useRecommendations';
import { useRecommendationFilter } from '../../../hooks/useRecommendationFilter';

// --- Global Styles ---
import { colors, common, spacing, typography, shadows } from '../../../styles';

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

      <FabButton onPress={() => navigation.navigate('AddRecommendation')} />

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
      <Modal visible={sortMenuVisible} transparent={true} animationType="fade" onRequestClose={() => setSortMenuVisible(false)}>
        <TouchableOpacity style={localStyles.modalOverlay} activeOpacity={1} onPress={() => setSortMenuVisible(false)}>
            <View style={localStyles.sortMenu}>
                <Text style={{ ...typography.h3, textAlign: 'center', marginBottom: spacing.md }}>מיין לפי</Text>
                {['popularity', 'newest'].map((option) => (
                    <TouchableOpacity 
                        key={option}
                        style={[localStyles.sortOption, sortBy === option && { backgroundColor: colors.background }]}
                        onPress={() => handleSortSelect(option)}
                    >
                    <View style={localStyles.sortOptionLabelRow}>
                      <Ionicons
                        name={option === 'popularity' ? 'trending-up-outline' : 'time-outline'}
                        size={16}
                        color={sortBy === option ? colors.primary : colors.textSecondary}
                        style={{ marginLeft: 6 }}
                      />
                      <Text style={{ color: sortBy === option ? colors.primary : colors.textPrimary }}>
                        {option === 'popularity' ? 'הכי פופולרי' : 'הכי חדש'}
                      </Text>
                    </View>
                        {sortBy === option && <Ionicons name="checkmark" size={18} color={colors.primary} />}
                    </TouchableOpacity>
                ))}
            </View>
        </TouchableOpacity>
      </Modal>

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