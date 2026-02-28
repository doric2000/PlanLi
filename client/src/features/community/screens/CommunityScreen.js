import React, { useEffect, useMemo, useState } from 'react';
import { 
  View, 
  Text, 
  TextInput,
  Alert,
  ActivityIndicator, 
  FlatList, 
  RefreshControl, 
  TouchableOpacity,
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
import CommunityInlineMap from '../components/CommunityInlineMap';

// --- Hooks ---
import { useRecommendations } from '../../../hooks/useRecommendations';
import { useRecommendationFilter } from '../../../hooks/useRecommendationFilter';
import { useUserLocation } from '../../../hooks/useUserLocation';

// --- Global Styles ---
import { colors, common, community } from '../../../styles';
import { auth } from '../../../config/firebase';
import { getUserTier } from '../../../utils/userTier';
import { getPlaceCoordinates, haversineDistanceKm } from '../../../utils/distance';

export default function CommunityScreen({ navigation }) {
  // --- State ---
  const [sortBy, setSortBy] = useState('popularity');
  const [sortMenuVisible, setSortMenuVisible] = useState(false);
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [commentsModalVisible, setCommentsModalVisible] = useState(false);
  const [selectedPostId, setSelectedPostId] = useState(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [destinationEditing, setDestinationEditing] = useState(false);

  // --- Hooks ---
  const { data: recommendations, loading, refreshing, refresh, removeRecommendation } = useRecommendations(sortBy);
  const { filteredData, filters, isFiltered, updateFilters, clearFilters } = useRecommendationFilter(recommendations);
  const { location: userLocation, requestLocation } = useUserLocation();

  // --- Handlers ---
  const handleSortSelect = async (option) => {
    setSortBy(option);
    setSortMenuVisible(false);

    if (option === 'nearby') {
      const loc = await requestLocation();
      if (!loc) {
        Alert.alert(
          'מיקום לא זמין',
          'כדי למיין לפי קרבה צריך לאפשר הרשאת מיקום. אם לא ניתן לאשר, הרשימה תישאר במיון רגיל.'
        );
      }
    }
  };
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

  const sortLabel = sortBy === 'popularity' ? 'פופולרי' : sortBy === 'newest' ? 'חדש' : 'קרוב אליי';

  const displayData = useMemo(() => {
    if (sortBy !== 'nearby') return filteredData;
    if (!userLocation) return filteredData;

    const from = { lat: userLocation.lat, lng: userLocation.lng };

    return filteredData
      .map((item, index) => {
        const coords = getPlaceCoordinates(item?.place);
        const distanceKm = coords ? haversineDistanceKm(from, coords) : NaN;
        const normalizedDistance = Number.isFinite(distanceKm) ? distanceKm : null;
        return { item, index, distanceKm: normalizedDistance };
      })
      .sort((a, b) => {
        if (a.distanceKm === null && b.distanceKm === null) return a.index - b.index;
        if (a.distanceKm === null) return 1;
        if (b.distanceKm === null) return -1;
        if (a.distanceKm === b.distanceKm) return a.index - b.index;
        return a.distanceKm - b.distanceKm;
      })
        .map((x) => (x.distanceKm === null ? x.item : { ...x.item, distanceKm: x.distanceKm }));
  }, [filteredData, sortBy, userLocation]);

  const mapPins = useMemo(() => {
    return displayData
      .map((item) => {
        const coords = getPlaceCoordinates(item?.place);
        if (!coords) return null;
        return {
          id: item.id,
          title: item.title || item.location || 'המלצה',
          coordinates: coords,
        };
      })
      .filter(Boolean);
  }, [displayData]);

  const destinationQuery = (filters?.destination || '').trim();

  // Debounce typing so we don't refocus/re-render native maps on every keystroke.
  const [debouncedDestinationQuery, setDebouncedDestinationQuery] = useState(destinationQuery);
  const [debouncedMapPins, setDebouncedMapPins] = useState(mapPins);

  useEffect(() => {
    if (destinationEditing) return;
    const t = setTimeout(() => setDebouncedDestinationQuery(destinationQuery), 500);
    return () => clearTimeout(t);
  }, [destinationEditing, destinationQuery]);

  useEffect(() => {
    if (!mapOpen) {
      setDebouncedMapPins(mapPins);
      return;
    }
    if (destinationEditing) return;
    const t = setTimeout(() => setDebouncedMapPins(mapPins), 500);
    return () => clearTimeout(t);
  }, [destinationEditing, mapPins, mapOpen]);

  const focusMapOnPins = debouncedDestinationQuery.length >= 2;

  return (
    <SafeAreaView style={community.screen}>
      
      {/* --- HEADER --- */}
      <ScreenHeader
        title="קהילת המטיילים"
        subtitle="גלו המלצות חדשות!"
        compact
        renderRight={() => (
          <TouchableOpacity
            style={community.headerIconButton}
            onPress={() => {
              setMapOpen((prev) => !prev);
            }}
            accessibilityRole="button"
            accessibilityLabel="מפה"
          >
            <Ionicons name="map-outline" size={18} color={colors.textPrimary} />
          </TouchableOpacity>
        )}
        renderLeft={() => (
          <TouchableOpacity 
            style={community.sortButton}
            onPress={() => setSortMenuVisible(true)}
          >
            <Ionicons name="chevron-down" size={20} color={colors.textPrimary} />
            <Text style={community.sortButtonText}>
              {sortLabel}
            </Text>
          </TouchableOpacity>
        )}
      />

      {/* --- DESTINATION QUICK FILTER (Option A) --- */}
      <View style={community.destinationSearchWrap}>
        <View style={community.destinationSearchRow}>
          <TouchableOpacity
            onPress={() => setFilterModalVisible(true)}
            style={community.destinationFilterBtn}
            accessibilityRole="button"
            accessibilityLabel="מסננים"
          >
            <Ionicons
              name="filter"
              size={18}
              color={isFiltered ? colors.primary : colors.textSecondary}
            />
          </TouchableOpacity>

          <View style={community.destinationSearchPill}>
            <Ionicons
              name="search"
              size={18}
              color={colors.textSecondary}
              style={community.destinationSearchPillIcon}
            />

            <TextInput
              value={filters.destination}
              onChangeText={(text) => updateFilters({ destination: text })}
              onFocus={() => setDestinationEditing(true)}
              onBlur={() => setDestinationEditing(false)}
              onSubmitEditing={() => setDestinationEditing(false)}
              placeholder="חפש יעד (עיר / מדינה)..."
              placeholderTextColor={colors.textMuted}
              style={community.destinationSearchInput}
              textAlign="right"
              autoCorrect={false}
              autoCapitalize="none"
            />

            {!!filters.destination && (
              <TouchableOpacity
                onPress={() => updateFilters({ destination: '' })}
                style={community.destinationClearBtn}
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

      {mapOpen && (
        <View style={community.inlineMapSection}>
          <CommunityInlineMap
            pins={debouncedMapPins}
            focusOnPins={focusMapOnPins}
            onOpenPost={(postId) => navigation.navigate('RecommendationDetail', { postId })}
          />
        </View>
      )}

      {/* --- RECOMMENDATIONS LIST --- */}
      {!mapOpen && (
        loading ? (
          <View style={common.center}>
              <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={displayData}
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
        )
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
