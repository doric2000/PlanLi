import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StatusBar,
  TouchableOpacity,
  View,
} from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import AppText from '../../../components/AppText';
import CachedImage from '../../../components/CachedImage';
import CityCard from '../../../components/CityCard';
import { CenteredRefreshControl, CenteredRefreshState } from '../../../components/CenteredRefresh';
import DestinationFilterModal from '../../../components/DestinationFilterModal';
import DestinationNameConfirmationModal from '../../../components/DestinationNameConfirmationModal';
import GooglePlacesInput from '../../../components/GooglePlacesInput';
import PageHeader from '../../../components/PageHeader';
import SearchFilterRow from '../../../components/SearchFilterRow';
import { CAPABILITIES } from '../../../constants/authPolicy';
import { useAuthUser } from '../../../hooks/useAuthUser';
import { useFavoriteCityIds } from '../../../hooks/useFavoriteCityIds';
import { useSmartProfile } from '../../../hooks/useSmartProfile';
import { useTabPressScrollOrRefresh } from '../../../hooks/useTabPressScrollOrRefresh';
import {
  destinationCatalogItemToCity,
  searchDestinations,
} from '../../../services/DestinationService';
import {
  confirmProvisionalDestinationName,
  resolveDestinationForPlacePreview,
} from '../../../services/LocationService';
import {
  requestPersonalizedRecommendations,
  requestPersonalizedRoutes,
} from '../../../services/PersonalizationService';
import { saveNoyaOnboardingStatus } from '../../../services/ProfileService';
import { getCurrentRouteDraft } from '../../../services/RouteService';
import {
  colors,
  homeScreenStyles as styles,
  preferenceSetupStyles as preferenceStyles,
  tabHeroStyles,
  TAB_HERO_SEARCH_ICON_SIZE,
} from '../../../styles';
import {
  compactDestinationText,
  filterAndSortDestinations,
  mergeDestinations,
} from '../../../utils/destinationSearch';
import {
  loadRecentDiscoveryDestinations,
  rememberDiscoveryDestinations,
} from '../../../utils/recentDiscoveryDestinations';
import { waitForRefreshConfirmation } from '../../../utils/refreshFeedback';
import { useAuth } from '../../auth/AuthContext';
import {
  useNoyaMainTabRegistration,
  useNoyaMainTabSceneReady,
  useNoyaTourTargetRegistration,
} from '../../noya/NoyaTourContext';
import { NOYA_MAIN_TARGETS } from '../../noya/NoyaTourDefinitions';
import {
  dismissGuestNoya,
  loadGuestNoyaProfile,
  NOYA_ONBOARDING_VERSION,
  shouldInviteGuestToNoya,
  wasNoyaAccountHandled,
} from '../../profile/services/NoyaOnboardingStorage';
import {
  HomeContentRail,
  HomeContinuationCard,
  HomeQuickActions,
} from '../components/HomeDashboard';
import HomeRegionPreviewChip from '../../region/components/HomeRegionPreviewChip';
import { useOptionalRegionSelection } from '../../region/context/RegionSelectionState';
import { isRegionDiscoveryEnabled, isRegionSelectorPreviewEnabled } from '../../region/regionDefinitions';
import { shouldAutoOpenRegionSelector } from '../../region/utils/regionSelectorHomeGate';

const NOYA_IMAGE = require('../../../../assets/noya-assistant.png');
const DESTINATION_PLACEHOLDER_COLORS = ['#78909C', '#607D8B', '#526878'];
const ZERO_SCROLL_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };
const ZERO_SCROLL_OFFSET = { x: 0, y: 0 };

function recentDestinationToCity(destination) {
  if (!destination?.countryId || !destination?.cityId) return null;
  return {
    id: destination.cityId,
    cityId: destination.cityId,
    countryId: destination.countryId,
    name: destination.name || destination.label || destination.cityId,
    description: destination.countryName || '',
    countryName: destination.countryName || '',
    discoveryRegionId: destination.discoveryRegionId || null,
    label: destination.label,
  };
}

function cityToRecentDestination(city) {
  const cityId = city?.cityId || city?.id;
  if (!city?.countryId || !cityId) return null;
  const name = city?.identity?.names?.he || city?.names?.he || city?.name || cityId;
  const countryName = city?.countryNames?.he || city?.countryName || city?.description || city.countryId;
  return {
    countryId: city.countryId,
    cityId,
    name,
    countryName,
    discoveryRegionId: city?.discoveryRegionId || null,
    label: [name, countryName].filter(Boolean).join(' · '),
  };
}

export function buildHomeSearchPool({
  regionDiscoveryEnabled,
  selectedRegionId,
  searchResultsLoaded,
  searchDestinationsList,
  recentDestinations,
  favoriteDestinations,
}) {
  const localDestinations = mergeDestinations(recentDestinations, favoriteDestinations);
  if (!regionDiscoveryEnabled) {
    return mergeDestinations(
      searchResultsLoaded ? searchDestinationsList : recentDestinations,
      favoriteDestinations,
    );
  }
  const regionSafeLocalDestinations = localDestinations.filter(
    (destination) => destination.discoveryRegionId === selectedRegionId,
  );
  return searchResultsLoaded
    ? mergeDestinations(searchDestinationsList, regionSafeLocalDestinations)
    : regionSafeLocalDestinations;
}

function catalogItemsToCities(items) {
  return (Array.isArray(items) ? items : []).map((item, index) => (
    destinationCatalogItemToCity(
      item,
      DESTINATION_PLACEHOLDER_COLORS[index % DESTINATION_PLACEHOLDER_COLORS.length],
    )
  ));
}

function openPreferenceSetupFrom(navigation, source = 'home') {
  let rootNavigation = navigation;
  let parent = rootNavigation?.getParent?.();
  while (parent) {
    rootNavigation = parent;
    parent = rootNavigation?.getParent?.();
  }
  rootNavigation?.navigate?.('PreferenceSetup', { source });
}

function openRegionSelectorFrom(navigation, source = 'home') {
  let rootNavigation = navigation;
  let parent = rootNavigation?.getParent?.();
  while (parent) {
    rootNavigation = parent;
    parent = rootNavigation?.getParent?.();
  }
  rootNavigation?.navigate?.('RegionSelector', { source });
}

function requestMetadata(attempt) {
  return {
    requested: attempt?.requested === true || attempt?.source === 'in-flight',
    source: attempt?.source || 'unknown',
  };
}

export default function HomePlanningHubScreen({ navigation }) {
  useNoyaMainTabRegistration(navigation);
  const homeSearchTourTarget = useNoyaTourTargetRegistration(NOYA_MAIN_TARGETS.homeSearch);
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const { user, isGuest, isActive, loading: authLoading } = useAuthUser();
  const { ensureCapability, handleCallableAuthError, userDocument } = useAuth();
  const { completed: preferencesCompleted, loading: preferencesLoading } = useSmartProfile();
  const favoriteCities = useFavoriteCityIds({ enabled: Boolean(user) && !isGuest });
  const {
    selectedRegionId,
    hasSeenPrompt: hasSeenRegionPrompt,
    loading: regionSelectionLoading,
  } = useOptionalRegionSelection();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchDestinationsList, setSearchDestinationsList] = useState([]);
  const [searchResultsLoaded, setSearchResultsLoaded] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [destinationFilterVisible, setDestinationFilterVisible] = useState(false);
  const [savedOnly, setSavedOnly] = useState(false);
  const [destinationNameConfirmation, setDestinationNameConfirmation] = useState(null);
  const [destinationNameInput, setDestinationNameInput] = useState('');
  const [destinationNameBusy, setDestinationNameBusy] = useState(false);
  const [destinationNameError, setDestinationNameError] = useState('');

  const [recentDestinations, setRecentDestinations] = useState([]);
  const [recentLoading, setRecentLoading] = useState(true);
  const [draft, setDraft] = useState(null);
  const [draftLoading, setDraftLoading] = useState(true);
  const [draftError, setDraftError] = useState(null);
  const [routes, setRoutes] = useState([]);
  const [routesMode, setRoutesMode] = useState('generic');
  const [routesLoading, setRoutesLoading] = useState(true);
  const [routesError, setRoutesError] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [recommendationsMode, setRecommendationsMode] = useState('generic');
  const [recommendationsLoading, setRecommendationsLoading] = useState(true);
  const [recommendationsError, setRecommendationsError] = useState(null);

  const [refreshing, setRefreshing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [guestNoyaInvitation, setGuestNoyaInvitation] = useState(false);
  const [guestNoyaCompleted, setGuestNoyaCompleted] = useState(false);
  const [guestProfileLoaded, setGuestProfileLoaded] = useState(false);

  const existingNoyaOpenedRef = useRef(false);
  const regionAutoPromptOpenedRef = useRef(false);
  const mainScrollRef = useRef(null);
  const searchInputRef = useRef(null);
  const searchRequestRef = useRef(0);
  const searchDebounceRef = useRef(null);
  const recentRequestRef = useRef(0);
  const draftRequestRef = useRef(0);
  const routesRequestRef = useRef(0);
  const recommendationsRequestRef = useRef(0);

  const principal = user?.uid || 'guest';
  const hasPersonalization = isGuest ? guestNoyaCompleted : preferencesCompleted;
  const personalizationReady = !authLoading && (isGuest ? guestProfileLoaded : !preferencesLoading);
  const discoverySort = hasPersonalization ? 'forYou' : 'newest';

  useEffect(() => {
    if (!isRegionDiscoveryEnabled()) return;
    routesRequestRef.current += 1;
    recommendationsRequestRef.current += 1;
    setRoutes([]);
    setRecommendations([]);
    setRoutesError(null);
    setRecommendationsError(null);
    setRoutesLoading(true);
    setRecommendationsLoading(true);
  }, [selectedRegionId]);

  useEffect(() => {
    if (!isFocused) return undefined;
    let active = true;

    if (isGuest) {
      setGuestProfileLoaded(false);
      Promise.allSettled([shouldInviteGuestToNoya(), loadGuestNoyaProfile()])
        .then(([invitationResult, profileResult]) => {
          if (!active) return;
          setGuestNoyaInvitation(
            invitationResult.status === 'fulfilled' ? Boolean(invitationResult.value) : false,
          );
          setGuestNoyaCompleted(
            profileResult.status === 'fulfilled' ? Boolean(profileResult.value) : false,
          );
          setGuestProfileLoaded(true);
        });
      return () => { active = false; };
    }

    setGuestNoyaInvitation(false);
    setGuestNoyaCompleted(false);
    setGuestProfileLoaded(true);
    const noyaVersion = Number(userDocument?.onboarding?.noya?.version || 0);
    if (
      user?.uid
      && userDocument
      && noyaVersion < NOYA_ONBOARDING_VERSION
      && !existingNoyaOpenedRef.current
      && !wasNoyaAccountHandled(user.uid)
    ) {
      existingNoyaOpenedRef.current = true;
      openPreferenceSetupFrom(navigation, 'existing-account');
    }
    return () => { active = false; };
  }, [isFocused, isGuest, navigation, user?.uid, userDocument?.onboarding?.noya?.version]);

  useEffect(() => {
    const dashboardSettled = !recentLoading
      && !draftLoading
      && !routesLoading
      && !recommendationsLoading;
    const shouldOpen = shouldAutoOpenRegionSelector({
      previewEnabled: isRegionSelectorPreviewEnabled(),
      selectionLoading: regionSelectionLoading,
      hasSeenPrompt: hasSeenRegionPrompt,
      isFocused,
      personalizationReady,
      dashboardSettled,
      refreshing,
      confirming,
      noyaOpenedThisVisit: existingNoyaOpenedRef.current,
      alreadyOpened: regionAutoPromptOpenedRef.current,
    });
    if (!shouldOpen) return undefined;

    const timer = setTimeout(() => {
      if (existingNoyaOpenedRef.current) return;
      regionAutoPromptOpenedRef.current = true;
      openRegionSelectorFrom(navigation, 'home-auto-preview');
    }, 250);
    return () => clearTimeout(timer);
  }, [
    confirming,
    draftLoading,
    hasSeenRegionPrompt,
    isFocused,
    navigation,
    personalizationReady,
    recentLoading,
    recommendationsLoading,
    refreshing,
    regionSelectionLoading,
    routesLoading,
  ]);

  const loadRecentDestinations = useCallback(async () => {
    const requestId = recentRequestRef.current + 1;
    recentRequestRef.current = requestId;
    setRecentLoading(true);
    try {
      const items = await loadRecentDiscoveryDestinations();
      if (recentRequestRef.current !== requestId) return { requested: false, source: 'stale' };
      setRecentDestinations(items.map(recentDestinationToCity).filter(Boolean));
      return { requested: false, source: 'local' };
    } catch (error) {
      if (recentRequestRef.current === requestId) {
        console.error('Failed to load recent Home destinations:', error);
      }
      return { requested: false, source: 'local-error' };
    } finally {
      if (recentRequestRef.current === requestId) setRecentLoading(false);
    }
  }, []);

  const loadDraft = useCallback(async () => {
    const requestId = draftRequestRef.current + 1;
    draftRequestRef.current = requestId;
    setDraftError(null);
    if (!isActive) {
      setDraft(null);
      setDraftLoading(false);
      return { requested: false, source: 'not-active' };
    }
    setDraftLoading(true);
    try {
      const currentDraft = await getCurrentRouteDraft();
      if (draftRequestRef.current !== requestId) return { requested: true, source: 'stale' };
      setDraft(currentDraft || null);
      return { requested: true, source: 'network' };
    } catch (error) {
      if (draftRequestRef.current === requestId) {
        setDraftError(error);
        console.error('Failed to load the current route draft for Home:', error);
      }
      return { requested: true, source: 'network-error' };
    } finally {
      if (draftRequestRef.current === requestId) setDraftLoading(false);
    }
  }, [isActive]);

  const loadRoutes = useCallback(async () => {
    const requestId = routesRequestRef.current + 1;
    routesRequestRef.current = requestId;
    setRoutesLoading(true);
    setRoutesError(null);
    let attempt = null;
    try {
      attempt = requestPersonalizedRoutes({ sort: discoverySort, limit: 4, ...(isRegionDiscoveryEnabled() && selectedRegionId ? { regionId: selectedRegionId } : {}) });
      const response = await attempt.promise;
      if (routesRequestRef.current !== requestId) return { ...requestMetadata(attempt), source: 'stale' };
      setRoutes(Array.isArray(response?.items) ? response.items : []);
      setRoutesMode(response?.mode || 'generic');
      return requestMetadata(attempt);
    } catch (error) {
      if (routesRequestRef.current === requestId) {
        setRoutesError(error);
        console.error('Failed to load Home routes:', error);
      }
      return { ...requestMetadata(attempt), source: 'error' };
    } finally {
      if (routesRequestRef.current === requestId) setRoutesLoading(false);
    }
  }, [discoverySort, principal, selectedRegionId]);

  const loadRecommendations = useCallback(async () => {
    const requestId = recommendationsRequestRef.current + 1;
    recommendationsRequestRef.current = requestId;
    setRecommendationsLoading(true);
    setRecommendationsError(null);
    let attempt = null;
    try {
      attempt = requestPersonalizedRecommendations({ sort: discoverySort, limit: 4, ...(isRegionDiscoveryEnabled() && selectedRegionId ? { regionId: selectedRegionId } : {}) });
      const response = await attempt.promise;
      if (recommendationsRequestRef.current !== requestId) {
        return { ...requestMetadata(attempt), source: 'stale' };
      }
      setRecommendations(Array.isArray(response?.items) ? response.items : []);
      setRecommendationsMode(response?.mode || 'generic');
      return requestMetadata(attempt);
    } catch (error) {
      if (recommendationsRequestRef.current === requestId) {
        setRecommendationsError(error);
        console.error('Failed to load Home recommendations:', error);
      }
      return { ...requestMetadata(attempt), source: 'error' };
    } finally {
      if (recommendationsRequestRef.current === requestId) setRecommendationsLoading(false);
    }
  }, [discoverySort, principal, selectedRegionId]);

  const loadDashboard = useCallback(() => Promise.all([
    loadRecentDestinations(),
    loadDraft(),
    loadRoutes(),
    loadRecommendations(),
  ]), [loadDraft, loadRecentDestinations, loadRecommendations, loadRoutes]);

  useEffect(() => {
    if (!isFocused || !personalizationReady) return undefined;
    loadDashboard();
    return () => {
      recentRequestRef.current += 1;
      draftRequestRef.current += 1;
      routesRequestRef.current += 1;
      recommendationsRequestRef.current += 1;
    };
  }, [isFocused, loadDashboard, personalizationReady, principal]);

  const fetchSearchDestinations = useCallback(async (queryText) => {
    const requestId = searchRequestRef.current + 1;
    searchRequestRef.current = requestId;
    setSearchResultsLoaded(false);
    setSearchError(null);
    try {
      const catalog = await searchDestinations({ query: queryText, sort: 'name', limit: 30, ...(isRegionDiscoveryEnabled() && selectedRegionId ? { regionId: selectedRegionId } : {}) });
      if (searchRequestRef.current !== requestId) return { requested: true, source: 'stale' };
      setSearchDestinationsList(catalogItemsToCities(catalog?.items));
      setSearchResultsLoaded(true);
      return { requested: true, source: 'network' };
    } catch (error) {
      if (searchRequestRef.current === requestId) {
        setSearchDestinationsList([]);
        setSearchResultsLoaded(true);
        setSearchError(error);
        console.error('Failed to search Home destinations:', error);
      }
      return { requested: true, source: 'network-error' };
    }
  }, [selectedRegionId]);

  useEffect(() => {
    const query = searchQuery.trim();
    if (compactDestinationText(query).length < 2) {
      searchRequestRef.current += 1;
      setSearchDestinationsList([]);
      setSearchResultsLoaded(false);
      setSearchError(null);
      return undefined;
    }

    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => fetchSearchDestinations(query), 400);
    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
        searchDebounceRef.current = null;
      }
    };
  }, [fetchSearchDestinations, searchQuery]);

  const onRefresh = useCallback(async () => {
    if (refreshing || confirming) return;
    setRefreshing(true);
    const query = searchQuery.trim();
    const favoriteAttempt = favoriteCities.reload();
    const [dashboardAttempts, searchAttempt] = await Promise.all([
      loadDashboard(),
      compactDestinationText(query).length >= 2
        ? fetchSearchDestinations(query)
        : Promise.resolve({ requested: false, source: 'idle' }),
      Promise.resolve(favoriteAttempt.promise).catch(() => undefined),
    ]);
    const allAttempts = [...dashboardAttempts, searchAttempt, requestMetadata(favoriteAttempt)];
    const usedNetwork = allAttempts.some((attempt) => attempt?.requested === true);
    const hadError = allAttempts.some((attempt) => (
      attempt?.source === 'error' || attempt?.source === 'network-error'
    ));
    setRefreshing(false);
    if (!usedNetwork && !hadError) {
      setConfirming(true);
      await waitForRefreshConfirmation();
      setConfirming(false);
    }
  }, [
    confirming,
    favoriteCities.reload,
    fetchSearchDestinations,
    loadDashboard,
    refreshing,
    searchQuery,
  ]);

  const { onScroll } = useTabPressScrollOrRefresh({
    variant: 'scrollview',
    scrollRef: mainScrollRef,
    onRefresh,
  });

  const normalizedSearchQuery = compactDestinationText(searchQuery);
  const hasSearchQuery = normalizedSearchQuery.length > 0;
  const favoriteKeys = useMemo(
    () => new Set(favoriteCities.favorites.map((city) => `${city.countryId}:${city.id}`)),
    [favoriteCities.favorites],
  );
  const searchPool = useMemo(() => buildHomeSearchPool({
    regionDiscoveryEnabled: isRegionDiscoveryEnabled(),
    selectedRegionId,
    searchResultsLoaded,
    searchDestinationsList,
    recentDestinations,
    favoriteDestinations: favoriteCities.favorites,
  }), [favoriteCities.favorites, recentDestinations, searchDestinationsList, searchResultsLoaded, selectedRegionId]);
  const filteredDestinations = useMemo(() => filterAndSortDestinations(searchPool, {
    query: searchQuery,
    sortBy: 'name',
    savedOnly,
    favoriteKeys,
  }), [favoriteKeys, savedOnly, searchPool, searchQuery]);
  const localAutocompleteResults = hasSearchQuery ? filteredDestinations.slice(0, 20) : [];
  const localResultsLoading = normalizedSearchQuery.length >= 2 && !searchResultsLoaded;
  const isResultsView = hasSearchQuery || savedOnly;

  useNoyaMainTabSceneReady(
    'Home',
    personalizationReady
      && !preferencesLoading
      && !recentLoading
      && !draftLoading
      && !routesLoading
      && !recommendationsLoading
      && !refreshing
      && !confirming,
  );

  const rememberHomeDestination = useCallback((city) => {
    const entry = cityToRecentDestination(city);
    if (!entry) return;
    setRecentDestinations((current) => {
      const nextCity = recentDestinationToCity(entry);
      return [
        nextCity,
        ...current.filter((item) => (
          `${item.countryId}:${item.id}` !== `${nextCity.countryId}:${nextCity.id}`
        )),
      ].slice(0, 5);
    });
    rememberDiscoveryDestinations([entry])
      .then((items) => setRecentDestinations(items.map(recentDestinationToCity).filter(Boolean)))
      .catch(() => {});
  }, []);

  const goToDestination = useCallback((city) => {
    if (!city?.id || !city?.countryId) return;
    navigation.navigate('LandingPage', { cityId: city.id, countryId: city.countryId });
  }, [navigation]);

  const selectLocalDestination = useCallback((city) => {
    rememberHomeDestination(city);
    setSearchQuery('');
    goToDestination(city);
  }, [goToDestination, rememberHomeDestination]);

  const openResolvedGoogleDestination = (result) => {
    if (result?.persisted) {
      rememberHomeDestination({
        ...result.destination.city,
        countryId: result.destination.country.id,
        countryName: result.destination.country.name,
      });
      setSearchQuery('');
      navigation.navigate('LandingPage', {
        cityId: result.destination.city.id,
        countryId: result.destination.country.id,
      });
      return;
    }
    navigation.navigate('AddRecommendation', {
      prefillLocation: {
        destination: {
          country: result.destination.country,
          city: result.destination.city,
        },
        place: result.place,
      },
    });
  };

  const closeDestinationNameConfirmation = () => {
    if (destinationNameBusy) return;
    setDestinationNameConfirmation(null);
    setDestinationNameInput('');
    setDestinationNameError('');
  };

  const confirmHomeDestinationName = async () => {
    const confirmedHebrewName = destinationNameInput.trim();
    if (!destinationNameConfirmation?.resolvedPlaceToken || !confirmedHebrewName) return;
    setDestinationNameBusy(true);
    setDestinationNameError('');
    try {
      const confirmed = await confirmProvisionalDestinationName({
        resolvedPlaceToken: destinationNameConfirmation.resolvedPlaceToken,
        incidentId: destinationNameConfirmation.incidentId,
        confirmedHebrewName,
      });
      setDestinationNameConfirmation(null);
      setDestinationNameInput('');
      openResolvedGoogleDestination(confirmed);
    } catch {
      setDestinationNameError('השם חייב להיות שם עברי קצר וברור.');
    } finally {
      setDestinationNameBusy(false);
    }
  };

  const handleGoogleSelect = async (selection) => {
    try {
      if (!await ensureCapability(CAPABILITIES.ACTIVE, { name: 'Main' })) return;
      const result = await resolveDestinationForPlacePreview(selection, {
        selectionIntent: 'destination',
      });
      if (result?.status === 'destination_name_confirmation_required') {
        const suggestedName = result.nameConfirmation?.suggestedHebrewName || '';
        setDestinationNameConfirmation(result);
        setDestinationNameInput(suggestedName);
        setDestinationNameError('');
        return;
      }
      if (result?.status === 'destination_choice_required') {
        Alert.alert('נדרשת בחירת יעד', 'חפשו ובחרו עיר או אזור מתאימים מתוך רשימת היעדים.');
        return;
      }
      openResolvedGoogleDestination(result);
    } catch (error) {
      console.error(error);
      Alert.alert('שגיאה', 'לא ניתן לטעון את היעד.');
    }
  };

  const toggleCityFavorite = async (city) => {
    if (!await ensureCapability(CAPABILITIES.ACTIVE, { name: 'Main' })) return;
    try {
      await favoriteCities.toggleFavorite(city);
    } catch (error) {
      if (handleCallableAuthError?.(error, { name: 'Main' })) return;
      console.error('Failed to toggle destination favorite:', error);
      Alert.alert('שגיאה', 'לא הצלחנו לעדכן את המועדפים. נסו שוב.');
    }
  };

  const openRouteBuilder = async () => {
    if (!await ensureCapability(CAPABILITIES.ACTIVE, { name: 'AddRoutesScreen' })) return;
    navigation.navigate('AddRoutesScreen');
  };

  const openFavorites = async () => {
    const returnTo = { name: 'Main', params: { screen: 'Favorites' } };
    if (!await ensureCapability(CAPABILITIES.SIGNED_IN, returnTo)) return;
    navigation.navigate('Favorites');
  };

  const focusHomeSearch = () => {
    mainScrollRef.current?.scrollTo?.({ y: 0, animated: true });
    searchInputRef.current?.focus?.();
  };

  const handleContinuationPress = () => {
    if (draft) return openRouteBuilder();
    if (recentDestinations[0]) return goToDestination(recentDestinations[0]);
    return focusHomeSearch();
  };

  const dismissNoyaInvitation = () => {
    setGuestNoyaInvitation(false);
    if (isGuest) dismissGuestNoya().catch(() => {});
    else saveNoyaOnboardingStatus('dismissed', NOYA_ONBOARDING_VERSION).catch(() => {});
  };

  const renderPreferencePrompt = () => {
    if (preferencesLoading) return null;
    if (!guestNoyaInvitation && (isGuest || preferencesCompleted)) return null;
    return (
      <View style={preferenceStyles.promptCard} testID="home-preferences-prompt">
        <View style={preferenceStyles.promptRow}>
          <CachedImage
            source={NOYA_IMAGE}
            style={preferenceStyles.promptAvatar}
            contentFit="cover"
            contentPosition={{ left: '50%', top: '32%' }}
            transition={0}
            accessibilityLabel="נועה"
          />
          <View style={preferenceStyles.promptCopy}>
            <AppText style={preferenceStyles.promptTitle}>רוצה המלצות שמתאימות יותר?</AppText>
            <AppText style={preferenceStyles.promptText}>נועה תסדר לך התחלה טובה בשלוש שאלות קצרות.</AppText>
          </View>
        </View>
        <View style={preferenceStyles.promptActions}>
          <TouchableOpacity
            style={preferenceStyles.promptButton}
            onPress={() => openPreferenceSetupFrom(navigation, 'guest-invitation')}
            accessibilityRole="button"
          >
            <AppText style={preferenceStyles.promptButtonText}>היכרות קצרה עם נועה</AppText>
          </TouchableOpacity>
          <TouchableOpacity
            style={preferenceStyles.promptSecondaryButton}
            onPress={dismissNoyaInvitation}
            accessibilityRole="button"
          >
            <AppText style={preferenceStyles.promptSecondaryText}>לא עכשיו</AppText>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderHeader = () => (
    <PageHeader
      variant="hero"
      title="מה מתכננים היום?"
      allowOverflow
      style={tabHeroStyles.fixedHeader}
      testID="home-tab-header"
    >
      <SearchFilterRow
        style={tabHeroStyles.searchRow}
        searchTargetRef={homeSearchTourTarget.ref}
        searchTargetTestID="home-search-tour-target"
        onSearchTargetLayout={homeSearchTourTarget.onLayout}
        onFilterPress={() => setDestinationFilterVisible(true)}
        activeFilterCount={savedOnly ? 1 : 0}
        accessibilityLabel="סינון יעדים"
        testID="home-search-row"
        filterTestID="home-filter-button"
      >
        <GooglePlacesInput
          mode={isRegionDiscoveryEnabled() ? "local" : "google"}
          value={searchQuery}
          onChangeValue={setSearchQuery}
          localResults={localAutocompleteResults}
          idleLocalResults={isRegionDiscoveryEnabled()
            ? recentDestinations.filter((item) => item.discoveryRegionId === selectedRegionId)
            : recentDestinations}
          idleLocalTitle="חיפושים אחרונים"
          localResultsLoading={localResultsLoading}
          returnSelection
          inputRef={searchInputRef}
          inputTestID="home-search-input"
          placeholder="חיפוש עיר או יעד…"
          onSelectLocal={selectLocalDestination}
          onSelect={handleGoogleSelect}
          googleFallbackDelayMs={2000}
          searchIconColor="rgba(255,255,255,0.62)"
          searchIconSize={TAB_HERO_SEARCH_ICON_SIZE}
          searchIconStyle={tabHeroStyles.searchIcon}
          placeholderTextColor="rgba(255,255,255,0.48)"
          loaderColor="#FFFFFF"
          loaderStyle={styles.searchLoader}
          inputWrapperStyle={tabHeroStyles.searchField}
          inputWrapperTestID="home-search-field"
          inputStyle={tabHeroStyles.searchInput}
          listContainerStyle={styles.searchDropdown}
        />
      </SearchFilterRow>
    </PageHeader>
  );

  const renderDashboard = () => (
    <View style={styles.dashboard} testID="home-dashboard">
      {isRegionSelectorPreviewEnabled() || isRegionDiscoveryEnabled() ? (
        <HomeRegionPreviewChip
          regionId={selectedRegionId}
          onPress={() => openRegionSelectorFrom(navigation, 'home-change')}
        />
      ) : null}
      <HomeContinuationCard
        loading={draftLoading || recentLoading}
        error={draftError}
        draft={draft}
        recentDestination={recentDestinations[0]}
        onPress={handleContinuationPress}
        onRetry={loadDraft}
      />
      <HomeQuickActions
        onCreateRoute={openRouteBuilder}
        onOpenCommunity={() => navigation.navigate('Community')}
        onOpenFavorites={openFavorites}
      />
      {renderPreferencePrompt()}
      <HomeContentRail
        kind="route"
        items={routes}
        loading={routesLoading}
        error={routesError}
        mode={routesMode}
        onRetry={loadRoutes}
        onSeeAll={() => navigation.navigate('Routes')}
        onItemPress={(item) => navigation.navigate('RouteDetail', { routeId: item.id })}
      />
      <HomeContentRail
        kind="recommendation"
        items={recommendations}
        loading={recommendationsLoading}
        error={recommendationsError}
        mode={recommendationsMode}
        onRetry={loadRecommendations}
        onSeeAll={() => navigation.navigate('Community')}
        onItemPress={(item) => navigation.navigate('RecommendationDetail', { item, postId: item.id })}
      />
    </View>
  );

  const renderDestinationResults = () => {
    const waitingForResults = (
      (normalizedSearchQuery.length >= 2 && !searchResultsLoaded)
      || (savedOnly && favoriteCities.loading)
    ) && filteredDestinations.length === 0;
    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <AppText style={styles.sectionTitle} testID="home-results-title">
            {hasSearchQuery ? 'תוצאות חיפוש' : 'יעדים שמורים'}
          </AppText>
        </View>
        <View style={styles.destinationGrid}>
          {waitingForResults ? (
            <View style={styles.fullWidthStatus}>
              <ActivityIndicator color={colors.navActive} />
              <AppText style={styles.statusText}>מחפשים את היעדים המתאימים…</AppText>
            </View>
          ) : searchError && filteredDestinations.length === 0 ? (
            <View style={styles.fullWidthStatus} accessibilityRole="alert" testID="home-search-error">
              <AppText style={styles.statusText}>לא הצלחנו לטעון תוצאות. אפשר לנסות שוב.</AppText>
              <TouchableOpacity
                style={styles.inlineRetryButton}
                onPress={() => fetchSearchDestinations(searchQuery.trim())}
                accessibilityRole="button"
              >
                <AppText style={styles.inlineRetryText}>ניסיון נוסף</AppText>
              </TouchableOpacity>
            </View>
          ) : filteredDestinations.length === 0 ? (
            <AppText style={styles.emptyText} testID="home-empty-state">
              {savedOnly && !hasSearchQuery ? 'עוד לא שמרת יעדים' : 'לא נמצאו יעדים'}
            </AppText>
          ) : (
            filteredDestinations.map((city) => (
              <CityCard
                key={`${city.countryId}:${city.id}`}
                city={city}
                variant="home"
                showTravelers={false}
                showSaveButton
                saved={favoriteKeys.has(`${city.countryId}:${city.id}`)}
                onSavePress={() => toggleCityFavorite(city)}
                onPress={() => selectLocalDestination(city)}
              />
            ))
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.screen} edges={['left', 'right']}>
      {isFocused ? (
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      ) : null}
      {renderHeader()}
      <ScrollView
        ref={mainScrollRef}
        testID="home-scroll"
        style={styles.scroll}
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        automaticallyAdjustsScrollIndicatorInsets={false}
        contentInset={ZERO_SCROLL_INSETS}
        scrollIndicatorInsets={ZERO_SCROLL_INSETS}
        contentOffset={ZERO_SCROLL_OFFSET}
        contentContainerStyle={[
          styles.scrollContent,
          tabHeroStyles.bodyContentInset,
          { paddingBottom: 116 + insets.bottom },
        ]}
        onScroll={onScroll}
        scrollEventThrottle={16}
        refreshControl={(
          <CenteredRefreshControl refreshing={refreshing || confirming} onRefresh={onRefresh} />
        )}
      >
        {refreshing || confirming ? (
          <CenteredRefreshState
            accessibilityLabel={confirming ? 'עמוד הבית מעודכן' : 'מרענן את עמוד הבית'}
            confirming={confirming}
            testID={confirming ? 'home-refresh-confirmation' : 'home-refresh-state'}
          />
        ) : isResultsView ? (
          <View style={styles.body}>{renderDestinationResults()}</View>
        ) : renderDashboard()}
      </ScrollView>
      <DestinationFilterModal
        visible={destinationFilterVisible}
        onClose={() => setDestinationFilterVisible(false)}
        savedOnly={savedOnly}
        onSavedOnlyChange={setSavedOnly}
        favoritesAvailable={Boolean(user) && !isGuest}
      />
      <DestinationNameConfirmationModal
        visible={Boolean(destinationNameConfirmation)}
        englishName={destinationNameConfirmation?.nameConfirmation?.englishName || ''}
        value={destinationNameInput}
        busy={destinationNameBusy}
        error={destinationNameError}
        onChangeText={(value) => { setDestinationNameInput(value); setDestinationNameError(''); }}
        onCancel={closeDestinationNameConfirmation}
        onConfirm={confirmHomeDestinationName}
      />
    </SafeAreaView>
  );
}
