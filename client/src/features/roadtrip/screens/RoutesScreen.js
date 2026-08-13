import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
	ActivityIndicator,
	Alert,
	FlatList,
	RefreshControl,
	StatusBar,
	TouchableOpacity,
	View,
} from 'react-native';
import AppText from "../../../components/AppText";
import AppTextInput from "../../../components/AppTextInput";
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import PageHeader from '../../../components/PageHeader';
import SearchFilterRow from '../../../components/SearchFilterRow';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import RoutesFilterModal from '../../../components/RoutesFilterModal';
import { auth } from '../../../config/firebase';
import { getUserTier } from '../../../utils/userTier';
import { useTabPressScrollOrRefresh } from '../../../hooks/useTabPressScrollOrRefresh';
import { useSmartProfile } from '../../../hooks/useSmartProfile';
import {
  common,
  colors,
  routesScreenStyles as styles,
  discoveryFilterTriggerStyles as filterUiStyles,
} from '../../../styles';
import FabButton from '../../../components/FabButton';
import { RouteCard } from '../components/RouteCard';
import { GenerateTripCard } from '../components/GenerateTripCard';
import { CommentsModal } from '../../../components/CommentsModal';
import ActiveRouteFiltersList from '../components/ActiveRouteFiltersList';
import { getFabBottomInset, getTabSceneListPaddingBottom } from '../../../navigation/tabBarLayout';
import { deleteContent } from '../../../services/SocialService';
import { discoverRoutes, loadRouteDetails } from '../../../services/RouteService';
import { SortMenuModal } from '../../community/components/SortMenuModal';
import {
  applySmartProfileFilters,
  createEmptyDiscoveryFilters,
  discoveryRequestFromFilters,
  hasDiscoveryFilters,
  removeDiscoveryFilter,
} from '../../../utils/discoveryFilters';
import { normalizeClientSmartProfile } from '../../profile/utils/preferenceSetup';
import { countDiscoveryFilters } from '../../../utils/progressiveDiscoveryFilters';
import { useContentPublish } from '../../publishing/ContentPublishContext';

const text = {
  title: 'מסלולים',
  searchPlaceholder: 'חפשו מסלול, מקום או תחום עניין...',
  noFiltered: 'אין מסלולים שמתאימים לחיפוש ולמסננים שבחרתם.',
  noRoutes: 'עדיין אין מסלולים.',
  firstRoute: 'היו הראשונים לשתף מסלול!',
};

const serverSort = (sortBy) => sortBy === 'personalized' ? 'forYou' : sortBy === 'newest' ? 'newest' : 'popular';

export default function RoutesScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState(createEmptyDiscoveryFilters);
  const [debouncedRequest, setDebouncedRequest] = useState(discoveryRequestFromFilters(filters, { surface: 'routes' }));
  const [filterVisible, setFilterVisible] = useState(false);
  const [sortVisible, setSortVisible] = useState(false);
  const [sortBy, setSortBy] = useState('popularity');
  const [commentsModalVisible, setCommentsModalVisible] = useState(false);
  const [selectedRouteId, setSelectedRouteId] = useState(null);
  const personalizationInitialized = useRef(false);
  const requestSerial = useRef(0);
  const routesListRef = useRef(null);
  const currentUser = auth.currentUser;
  const { smartProfile, completed: personalizationAvailable, loading: profileLoading } = useSmartProfile();
  const normalizedProfile = useMemo(() => normalizeClientSmartProfile(smartProfile || {}), [smartProfile]);
  const { completedVersionByType = {} } = useContentPublish();
  const routePublishVersion = Number(completedVersionByType.route || 0);
  const completedRouteVersionRef = useRef(routePublishVersion);

  useEffect(() => {
    if (profileLoading || personalizationInitialized.current) return;
    personalizationInitialized.current = true;
    if (personalizationAvailable) setSortBy('personalized');
  }, [personalizationAvailable, profileLoading]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedRequest(discoveryRequestFromFilters(filters, { surface: 'routes' })), 350);
    return () => clearTimeout(timer);
  }, [filters]);

  const requestKey = JSON.stringify(debouncedRequest);
  const fetchRoutes = useCallback(async ({ showLoader = true } = {}) => {
    const serial = requestSerial.current + 1;
    requestSerial.current = serial;
    if (showLoader) setLoading(true);
    setError(null);
    try {
      const response = await discoverRoutes({ ...debouncedRequest, sort: serverSort(sortBy), limit: 30 });
      if (requestSerial.current !== serial) return;
      setRoutes(Array.isArray(response?.items) ? response.items : []);
    } catch (error) {
      if (requestSerial.current !== serial) return;
      console.error('Failed to load routes', error);
      setRoutes([]);
      setError(error);
    } finally {
      if (requestSerial.current !== serial) return;
      setLoading(false);
      setRefreshing(false);
    }
  }, [requestKey, sortBy]);

  useFocusEffect(useCallback(() => {
    fetchRoutes({ showLoader: routes.length === 0 });
  }, [fetchRoutes]));

  useEffect(() => {
    if (completedRouteVersionRef.current === routePublishVersion) return;
    completedRouteVersionRef.current = routePublishVersion;
    fetchRoutes({ showLoader: false });
  }, [routePublishVersion, fetchRoutes]);

  const refresh = () => {
    setRefreshing(true);
    fetchRoutes({ showLoader: false });
  };
  const { onScroll } = useTabPressScrollOrRefresh({
    variant: 'flatlist',
    scrollRef: routesListRef,
    onRefresh: refresh,
    enabled: !loading,
  });

  const handleDelete = (routeId) => {
    Alert.alert('מחיקת מסלול', 'בטוחים שברצונכם למחוק את המסלול?', [
      { text: 'ביטול', style: 'cancel' },
      { text: 'מחק', style: 'destructive', onPress: async () => {
        try {
          await deleteContent({ type: 'route', id: routeId });
          setRoutes((current) => current.filter((item) => item.id !== routeId));
        } catch (error) {
          console.error('Error deleting route:', error);
          Alert.alert('שגיאה', 'לא הצלחנו למחוק את המסלול.');
        }
      } },
    ]);
  };
  const handleEdit = async (route) => {
    const routeToEdit = await loadRouteDetails(route.id);
    if (routeToEdit) navigation.navigate('AddRoutesScreen', { routeToEdit });
  };
  const openRoute = async (route) => {
    const routeData = await loadRouteDetails(route.id);
    if (routeData) navigation.navigate('RouteDetail', { routeData });
  };
  const isFiltered = hasDiscoveryFilters(filters);
  const activeFilterCount = countDiscoveryFilters(filters, { includeQuery: false });
  const sortLabel = sortBy === 'personalized' ? 'בשבילך' : sortBy === 'newest' ? 'חדש' : 'פופולרי';

  const openCreateRoute = () => {
    const tier = getUserTier(auth.currentUser);
    if (tier === 'guest') {
      Alert.alert('יש להתחבר', 'כדי ליצור מסלול צריך להתחבר.');
      navigation.navigate('Login');
      return;
    }
    if (tier === 'unverified') {
      Alert.alert('נדרש אימות', 'כדי ליצור מסלול צריך לאמת את האימייל.');
      navigation.navigate('VerifyEmail');
      return;
    }
    navigation.navigate('AddRoutesScreen');
  };

  const renderTopArea = () => (
    <PageHeader variant="hero" overlapNext>
      <View style={styles.topActionsRow}>
        <View style={styles.headerSideSpacer} />
        <View style={styles.headerTitleWrap}>
          <AppText style={styles.headerTitle}>{text.title}</AppText>
        </View>
        <TouchableOpacity style={styles.sortGlassButton} onPress={() => setSortVisible(true)} accessibilityLabel="מיון מסלולים">
          <Ionicons name="chevron-down" size={16} color="#FFFFFF" />
          <AppText style={styles.sortGlassText}>{sortLabel}</AppText>
        </TouchableOpacity>
      </View>
      <SearchFilterRow
        style={styles.searchRow}
        onFilterPress={() => setFilterVisible(true)}
        activeFilterCount={activeFilterCount}
        accessibilityLabel="סינון מסלולים"
        filterTestID="routes-filter-button"
      >
        <View style={styles.searchPill}>
          <Ionicons name="search" size={19} color="rgba(255,255,255,0.62)" />
          <AppTextInput value={filters.query} onChangeText={(query) => setFilters((current) => ({ ...current, query }))}
            placeholder={text.searchPlaceholder} placeholderTextColor="rgba(255,255,255,0.48)"
            style={styles.searchInput} textAlign="right" autoCorrect={false} autoCapitalize="none"
            testID="routes-search-input" />
          {!!filters.query && (
            <TouchableOpacity onPress={() => setFilters((current) => ({ ...current, query: '' }))}
              style={styles.destinationClearBtn} accessibilityLabel="נקה חיפוש">
              <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.76)" />
            </TouchableOpacity>
          )}
        </View>
      </SearchFilterRow>
    </PageHeader>
  );

  return (
    <SafeAreaView style={styles.screen} edges={['left', 'right']}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      {renderTopArea()}
      <View style={isFiltered ? styles.filtersAfterOverlappingHeader : null}>
        <ActiveRouteFiltersList filters={filters}
          onRemove={(field, value) => setFilters((current) => removeDiscoveryFilter(current, field, value))}
          onClear={() => setFilters(createEmptyDiscoveryFilters())} />
      </View>
      {loading ? <View style={common.center}><ActivityIndicator size="large" color={colors.primary} /></View> : (
        <FlatList ref={routesListRef} data={routes} keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.feedContent, { paddingBottom: getTabSceneListPaddingBottom(insets) }]}
          initialNumToRender={3} maxToRenderPerBatch={3} windowSize={5} onScroll={onScroll} scrollEventThrottle={16}
          renderItem={({ item }) => (
            <RouteCard item={item} onPress={() => openRoute(item)} isOwner={currentUser && item.ownerId === currentUser.uid}
              onEdit={() => handleEdit(item)} onDelete={() => handleDelete(item.id)}
              onCommentPress={(routeId) => { setSelectedRouteId(routeId); setCommentsModalVisible(true); }} variant="feed" />
          )}
          ListHeaderComponent={<View style={styles.generateCardWrap}><GenerateTripCard onPress={() => Alert.alert('יצירת מסלול אוטומטי בקרוב!')} /></View>}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[colors.primary]} tintColor={colors.primary} />}
          ListEmptyComponent={<View style={common.emptyState}><Ionicons name="trail-sign-outline" size={50} color={colors.textMuted} />
            <AppText style={common.emptyText}>{error
              ? 'לא הצלחנו לטעון מסלולים. משכו מטה כדי לנסות שוב.'
              : isFiltered ? text.noFiltered : text.noRoutes}</AppText>
            {!isFiltered && <AppText style={common.emptySubText}>{text.firstRoute}</AppText>}
            {isFiltered && (
              <View style={filterUiStyles.emptyActions}>
                <TouchableOpacity style={[filterUiStyles.emptyAction, filterUiStyles.emptyActionPrimary]}
                  onPress={() => setFilterVisible(true)} accessibilityRole="button">
                  <AppText style={[filterUiStyles.emptyActionText, filterUiStyles.emptyActionTextPrimary]}>עריכת סינון</AppText>
                </TouchableOpacity>
                <TouchableOpacity style={filterUiStyles.emptyAction}
                  onPress={() => setFilters(createEmptyDiscoveryFilters())} accessibilityRole="button">
                  <AppText style={filterUiStyles.emptyActionText}>נקה הכול</AppText>
                </TouchableOpacity>
              </View>
            )}
          </View>} showsVerticalScrollIndicator={false} />
      )}
      <FabButton style={{ bottom: getFabBottomInset(insets), zIndex: 10 }} onPress={openCreateRoute} />
      <RoutesFilterModal visible={filterVisible} onClose={() => setFilterVisible(false)} filters={filters}
        onApply={(next) => { setFilters({ ...createEmptyDiscoveryFilters(), ...next }); setFilterVisible(false); }}
        onUseProfile={(current) => applySmartProfileFilters(current, normalizedProfile, { surface: 'routes' })} />
      <SortMenuModal visible={sortVisible} onClose={() => setSortVisible(false)} sortBy={sortBy}
        onSelect={(value) => { setSortBy(value); setSortVisible(false); }}
        personalizationAvailable={personalizationAvailable} includeNearby={false} />
      <CommentsModal visible={commentsModalVisible} onClose={() => setCommentsModalVisible(false)}
        postId={selectedRouteId} collectionName="routes" />
    </SafeAreaView>
  );
}
