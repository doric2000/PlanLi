import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Alert, ActivityIndicator, FlatList, RefreshControl, TouchableOpacity, StatusBar } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import PageHeader from '../../../components/PageHeader';

// --- Components ---
import RecommendationsFilterModal from '../../../components/RecommendationsFilterModal';
import RecommendationCard from '../../../components/RecommendationCard';
import { CommentsModal } from '../../../components/CommentsModal';
import FabButton from '../../../components/FabButton';
import ActiveFiltersList from '../../../components/ActiveFiltersList';
import { SortMenuModal } from '../components/SortMenuModal';
import CommunityInlineMap from '../components/CommunityInlineMap';

// --- Hooks ---
import { useRecommendations } from '../../../hooks/useRecommendations';
import { useMapRecommendations } from '../../../hooks/useMapRecommendations';
import { useRecommendationFilter } from '../../../hooks/useRecommendationFilter';
import { useUserLocation } from '../../../hooks/useUserLocation';
import { useTabPressScrollOrRefresh } from '../../../hooks/useTabPressScrollOrRefresh';
import { useSmartProfile } from '../../../hooks/useSmartProfile';

// --- Global Styles ---
import {
  colors,
  common,
  community,
  radii,
  communityScreenStyles as styles,
  discoveryFilterTriggerStyles as filterUiStyles,
} from '../../../styles';
import { auth } from '../../../config/firebase';
import { getUserTier } from '../../../utils/userTier';
import { getPlaceCoordinates, haversineDistanceKm } from '../../../utils/distance';
import {
  getFabBottomInset,
  getTabOverlayBottomInset,
  getTabSceneListPaddingBottom,
} from '../../../navigation/tabBarLayout';
import { applySmartProfileFilters, discoveryRequestFromFilters, removeDiscoveryFilter } from '../../../utils/discoveryFilters';
import { normalizeClientSmartProfile } from '../../profile/utils/preferenceSetup';
import { countDiscoveryFilters } from '../../../utils/progressiveDiscoveryFilters';

export default function CommunityScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  // --- State ---
  const [sortBy, setSortBy] = useState('popularity');
  const [sortMenuVisible, setSortMenuVisible] = useState(false);
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [commentsModalVisible, setCommentsModalVisible] = useState(false);
  const [selectedPostId, setSelectedPostId] = useState(null);
  const [mapOpen, setMapOpen] = useState(false);
  const personalizationInitialized = useRef(false);

  // --- Hooks ---
  const {
    data: recommendations,
    error,
    loading,
    refreshing,
    refresh,
    removeRecommendation,
    setDiscoveryRequest,
  } = useRecommendations(sortBy);
  const { filteredData, filters, isFiltered, updateFilters, replaceFilters, clearFilters } = useRecommendationFilter(recommendations);
  const discoveryRequest = useMemo(() => discoveryRequestFromFilters(filters), [filters]);
  const {
    items: mapRecommendations,
    loading: mapLoading,
    error: mapError,
    truncated: mapTruncated,
    zoomInRequired,
    searchViewport,
  } = useMapRecommendations({ enabled: mapOpen, request: discoveryRequest });
  const { location: userLocation, requestLocation } = useUserLocation();
  const { smartProfile, completed: personalizationAvailable, loading: profileLoading } = useSmartProfile();
  const normalizedProfile = useMemo(() => normalizeClientSmartProfile(smartProfile || {}), [smartProfile]);
  const feedListRef = useRef(null);

  useEffect(() => {
    if (profileLoading || personalizationInitialized.current) return;
    personalizationInitialized.current = true;
    if (personalizationAvailable) setSortBy('personalized');
  }, [personalizationAvailable, profileLoading]);

  useEffect(() => {
    setDiscoveryRequest(discoveryRequest);
  }, [discoveryRequest, setDiscoveryRequest]);

  const { onScroll } = useTabPressScrollOrRefresh({
    variant: 'flatlist',
    scrollRef: feedListRef,
    onRefresh: refresh,
    enabled: !mapOpen && !loading,
    scrollYResetKey: mapOpen,
  });

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

  const handleRemoveFilter = (type, value) => {
    replaceFilters(removeDiscoveryFilter(filters, type, value));
  };

  const sortLabel = sortBy === 'personalized'
    ? 'בשבילך'
    : sortBy === 'popularity' ? 'פופולרי' : sortBy === 'newest' ? 'חדש' : 'קרוב אליי';

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

  const activeFilterCount = countDiscoveryFilters(filters, { includeQuery: false });

  const renderTopArea = () => (
    <PageHeader variant="hero" overlapNext>
      <View style={styles.topActionsRow}>
        <TouchableOpacity
          style={styles.glassIconButton}
          onPress={() => setMapOpen((previous) => {
            if (!previous) setSortMenuVisible(false);
            return !previous;
          })}
          accessibilityRole="button"
          accessibilityLabel="מפה"
          testID="community-map-toggle"
        >
          <Ionicons name={mapOpen ? "map" : "map-outline"} size={20} color="#FFFFFF" />
        </TouchableOpacity>

        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>קהילה</Text>
        </View>

        {mapOpen ? (
          <View style={[styles.sortGlassButton, styles.mapModeSummary]} testID="map-all-recommendations-label">
            <Ionicons name="location" size={16} color="#FFFFFF" />
            <Text style={styles.sortGlassText}>כל ההמלצות באזור</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.sortGlassButton}
            onPress={() => setSortMenuVisible(true)}
            testID="community-sort-button"
          >
            <Ionicons name="chevron-down" size={18} color="#FFFFFF" />
            <Text style={styles.sortGlassText}>{sortLabel}</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.searchRow}>
        <TouchableOpacity
          onPress={() => setFilterModalVisible(true)}
          style={[styles.glassIconButton, isFiltered && styles.glassIconButtonActive]}
          accessibilityRole="button"
          accessibilityLabel="סינון"
        >
          <Ionicons name="filter" size={19} color="#FFFFFF" />
          {activeFilterCount > 0 && (
            <View style={filterUiStyles.badge}>
              <Text style={filterUiStyles.badgeText}>{activeFilterCount > 9 ? '9+' : activeFilterCount}</Text>
            </View>
          )}
        </TouchableOpacity>

        <View style={styles.searchPill}>
          <Ionicons name="search" size={19} color="rgba(255,255,255,0.62)" />
          <TextInput
            value={filters.query}
            onChangeText={(text) => updateFilters({ query: text })}
            placeholder="חפש המלצה"
            placeholderTextColor="rgba(255,255,255,0.48)"
            style={styles.searchInput}
            textAlign="right"
            autoCorrect={false}
            autoCapitalize="none"
            testID="community-search-input"
          />
          {!!filters.query && (
            <TouchableOpacity
              onPress={() => updateFilters({ query: '' })}
              style={community.destinationClearBtn}
              accessibilityRole="button"
              accessibilityLabel="חפש המלצה"
            >
              <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.76)" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </PageHeader>
  );

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right"]}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      {renderTopArea()}
      {/* --- ACTIVE FILTERS BAR --- */}
      <View style={isFiltered ? styles.filtersAfterOverlappingHeader : null}>
        <ActiveFiltersList filters={filters} onRemove={handleRemoveFilter} onClear={clearFilters} />
      </View>

      {mapOpen && (
        <View style={community.inlineMapSection}>
          <CommunityInlineMap
            recommendations={mapRecommendations}
            loading={mapLoading}
            error={mapError}
            truncated={mapTruncated}
            zoomInRequired={zoomInRequired}
            onSearchViewport={searchViewport}
            overlayBottomInset={getTabOverlayBottomInset(insets)}
            onOpenRecommendation={(postId) => navigation.navigate('RecommendationDetail', { postId })}
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
            ref={feedListRef}
            data={displayData}
            keyExtractor={(item) => item.id}
            initialNumToRender={3}
            maxToRenderPerBatch={3}
            windowSize={5}
            onScroll={onScroll}
            scrollEventThrottle={16}
            renderItem={({ item, index }) => (
              <RecommendationCard
                  item={item}
                  onCommentPress={handleOpenComments}
                  onDeleted={removeRecommendation}
                  variant="feed"
                  topContentInset={!isFiltered && index === 0 ? radii.xl : 0}
              />
            )}
            contentContainerStyle={[styles.feedContent, { paddingBottom: getTabSceneListPaddingBottom(insets) }]}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
            ListEmptyComponent={
              <View style={common.emptyState}>
                <Ionicons name="images-outline" size={50} color={colors.textMuted} />
                <Text style={common.emptyText}>{error
                  ? 'לא הצלחנו לטעון תוצאות. משכו מטה כדי לנסות שוב.'
                  : isFiltered ? 'אין תוצאות.' : 'אין המלצות עדיין.'}</Text>
                {isFiltered && (
                  <View style={filterUiStyles.emptyActions}>
                    <TouchableOpacity style={[filterUiStyles.emptyAction, filterUiStyles.emptyActionPrimary]}
                      onPress={() => setFilterModalVisible(true)} accessibilityRole="button">
                      <Text style={[filterUiStyles.emptyActionText, filterUiStyles.emptyActionTextPrimary]}>עריכת סינון</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={filterUiStyles.emptyAction} onPress={clearFilters} accessibilityRole="button">
                      <Text style={filterUiStyles.emptyActionText}>נקה הכול</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            }
          />
        )
      )}

      {!mapOpen && (
        <FabButton
          style={{ bottom: getFabBottomInset(insets), zIndex: 10 }}
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
      )}

      {/* --- FILTER MODAL --- */}
      <RecommendationsFilterModal
        visible={filterModalVisible}
        onClose={() => setFilterModalVisible(false)}
        filters={filters}
        onApply={(next) => {
          updateFilters(next);
          setFilterModalVisible(false);
        }}
        onUseProfile={(current) => applySmartProfileFilters(current, normalizedProfile)}
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
        personalizationAvailable={personalizationAvailable}
      />

    </SafeAreaView>
  );
}
