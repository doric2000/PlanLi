import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, ScrollView, StatusBar, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';

import AppText from '../../../components/AppText';
import AppTextInput from '../../../components/AppTextInput';
import CachedImage from '../../../components/CachedImage';
import { useFavoriteRecommendationsFull } from '../../../hooks/useFavoriteRecommendationsFull';
import { getMediaVariantUrl } from '../../../utils/mediaAssets';
import { getPersonalizedRecommendations } from '../../../services/PersonalizationService';
import { colors, tripPlannerStyles as styles } from '../../../styles';
import { applyPrivateTripOperations, cacheTrip, discoverTripRecommendations, getPrivateTrip, hasQueuedTripOperations, isOfflineTripError, loadCachedTrip, operationId, queueTripOperations, tripErrorMessage } from '../../../services/TripService';
import SingleDestinationPicker from '../../community/components/SingleDestinationPicker';
import TripPlannerMap from '../components/TripPlannerMap';
import { applyOperationsLocally, orderedDays, regionForStops, viewportForRegion } from '../utils/tripPlannerModel';

const SOURCES = [
  { id: 'saved', label: 'שמורים' },
  { id: 'search', label: 'חיפוש' },
  { id: 'map', label: 'מפה' },
];

export default function TripDiscoveryScreen({ navigation, route }) {
  const { tripId, dayId } = route.params;
  const [trip, setTrip] = useState(null);
  const [tripLoading, setTripLoading] = useState(true);
  const [source, setSource] = useState('saved');
  const [targetDayId, setTargetDayId] = useState(dayId);
  const [query, setQuery] = useState('');
  const [settledQuery, setSettledQuery] = useState('');
  const [destination, setDestination] = useState(null);
  const [destinationOpen, setDestinationOpen] = useState(false);
  const [pageSize, setPageSize] = useState(50);
  const [searchItems, setSearchItems] = useState([]);
  const [mapItems, setMapItems] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState('');
  const [mapRegion, setMapRegion] = useState(null);
  const [nearRoute, setNearRoute] = useState(false);
  const selectedPreviews = useRef({});
  const addAttempt = useRef(null);
  const tripRequest = useRef(0);
  const saved = useFavoriteRecommendationsFull({ pageSize });

  const loadTrip = useCallback(async () => {
    const currentRequest = ++tripRequest.current;
    setTripLoading(true);
    try {
      const pending = await hasQueuedTripOperations(tripId);
      const cached = await loadCachedTrip(tripId);
      const fresh = pending && cached ? cached : await getPrivateTrip(tripId, { cache: false }).catch((cause) => {
        if (cached) return cached;
        throw cause;
      });
      if (tripRequest.current !== currentRequest) return;
      setTrip(fresh);
      setTargetDayId((current) => fresh.days.some((day) => day.id === current)
        ? current : fresh.days.find((day) => day.kind === 'day')?.id || fresh.ideasDayId);
    } catch (cause) { if (tripRequest.current === currentRequest) setError(tripErrorMessage(cause, 'לא הצלחנו לטעון את ימי הטיול.')); }
    finally { if (tripRequest.current === currentRequest) setTripLoading(false); }
  }, [tripId]);
  useFocusEffect(useCallback(() => {
    loadTrip();
    return () => { tripRequest.current += 1; };
  }, [loadTrip]));

  useEffect(() => {
    const timer = setTimeout(() => setSettledQuery(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    if (source !== 'search' || query.trim() !== settledQuery || settledQuery.length === 1 || destinationOpen) return undefined;
    let active = true;
    setLoading(true);
    setError('');
    getPersonalizedRecommendations({
      query: settledQuery,
      sort: settledQuery ? 'relevance' : 'forYou',
      limit: 30,
      ...(destination?.countryId ? { context: { countryId: destination.countryId, ...(destination.cityId ? { cityId: destination.cityId } : {}) } } : {}),
    }, { retryFailed: attempt > 0 }).then((response) => {
      if (active) setSearchItems(Array.isArray(response?.items) ? response.items : []);
    }).catch(() => { if (active) setError('לא הצלחנו לטעון המלצות. אפשר לנסות שוב.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt, destination, destinationOpen, query, settledQuery, source]);

  const days = orderedDays(trip);
  const targetDay = days.find((day) => day.id === targetDayId);
  const existingIds = useMemo(() => new Set((trip?.days || []).flatMap((day) => day.stops || []).map((stop) => stop.recommendationId).filter(Boolean)), [trip]);
  const tripMapStops = useMemo(() => (trip?.days || []).flatMap((day) => day.stops || []).filter((stop) => stop.coordinates), [trip]);
  const region = mapRegion || (tripMapStops.length ? regionForStops(tripMapStops) : null);
  const items = source === 'saved' ? saved.favorites : source === 'search' ? searchItems : mapItems;
  const pending = source === 'saved' ? saved.loading : loading || (source === 'search' && query.trim() !== settledQuery);
  const displayedError = error || (source === 'saved' && saved.error ? 'לא הצלחנו לטעון את ההמלצות השמורות.' : '');

  const searchMap = async () => {
    if (!trip || !region) return;
    setLoading(true); setError('');
    try {
      const result = await discoverTripRecommendations({ tripId, dayId: targetDayId, viewport: viewportForRegion(region), nearRoute, maxDetourKm: 30 });
      setMapItems(result.items || []);
      if (result.zoomInRequired) setError('התקרבו מעט במפה וחפשו שוב באזור הזה.');
    } catch (cause) { setError(tripErrorMessage(cause, 'לא הצלחנו לטעון המלצות באזור הזה.')); }
    finally { setLoading(false); }
  };

  const toggle = (item) => {
    const id = item.id;
    if (existingIds.has(id)) return;
    selectedPreviews.current[id] = item;
    setSelectedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  };
  const add = async () => {
    if (!selectedIds.length || saving || !trip || !targetDay) return;
    setSaving(true); setError('');
    const operation = { type: 'add_recommendation_stops', dayId: targetDayId, recommendationIds: selectedIds };
    const fingerprint = JSON.stringify({ tripId, operation });
    if (addAttempt.current?.fingerprint !== fingerprint) addAttempt.current = { fingerprint, id: operationId('add-recommendations') };
    const id = addAttempt.current.id;
    try {
      if (await hasQueuedTripOperations(tripId)) throw Object.assign(new Error('Pending offline changes'), { code: 'functions/unavailable' });
      await applyPrivateTripOperations({ tripId, expectedRevision: trip.revision, operations: [operation], id });
      navigation.goBack();
    } catch (cause) {
      if (isOfflineTripError(cause)) {
        try {
          await cacheTrip(applyOperationsLocally(trip, [operation], selectedPreviews.current));
          await queueTripOperations({ tripId, expectedRevision: trip.revision, operations: [operation], id });
          navigation.goBack();
        } catch {
          await cacheTrip(trip).catch(() => {});
          setError('לא הצלחנו לשמור את הבחירה במכשיר. נסו שוב כשהחיבור יחזור.');
        }
      } else {
        setError(tripErrorMessage(cause));
        await loadTrip();
      }
    } finally { setSaving(false); }
  };

  const renderItem = ({ item }) => {
    const checked = selectedIds.includes(item.id);
    const alreadyAdded = existingIds.has(item.id);
    const thumb = getMediaVariantUrl(item.media, 'thumb');
    return (
      <View style={[styles.discoveryCard, checked && styles.discoveryCardSelected]} testID={`trip-choice-${item.id}`}>
        {thumb ? <CachedImage source={{ uri: thumb }} style={styles.discoveryThumb} contentFit="cover" /> : <View style={[styles.discoveryThumb, { alignItems: 'center', justifyContent: 'center' }]}><Ionicons name="image-outline" size={24} color={colors.textMuted} /></View>}
        <TouchableOpacity style={styles.stopCopy} onPress={() => navigation.navigate('RecommendationDetail', { postId: item.id })} accessibilityRole="button" accessibilityLabel={`צפייה בהמלצה ${item.title}`}>
          <AppText style={styles.stopTitle} numberOfLines={2}>{item.title}</AppText>
          <AppText style={styles.stopSubtitle} numberOfLines={2}>{item.place?.address || item.destination?.cityName || item.description || 'המלצת PlanLi'}</AppText>
          <AppText style={styles.stopSource}>{alreadyAdded ? 'כבר בטיול' : 'פרטי ההמלצה ←'}</AppText>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.check, checked && styles.checkSelected, alreadyAdded && { opacity: 0.5 }]} onPress={() => toggle(item)} disabled={alreadyAdded} accessibilityRole="checkbox" accessibilityState={{ checked, disabled: alreadyAdded }} accessibilityLabel={`בחירת ${item.title}`} testID={`trip-select-${item.id}`}>{checked || alreadyAdded ? <Ionicons name="checkmark" size={18} color={checked ? '#FFFFFF' : colors.primary} /> : null}</TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.fullScreen} edges={['top', 'left', 'right', 'bottom']}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.pageHeader}><TouchableOpacity style={styles.iconButton} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="חזרה"><Ionicons name="arrow-forward" size={22} color={colors.primary} /></TouchableOpacity><AppText style={styles.pageHeaderTitle}>בחירת המלצות</AppText></View>
      <View style={styles.pickerTabs}>{SOURCES.map((tab) => <TouchableOpacity key={tab.id} style={[styles.pickerTab, source === tab.id && styles.pickerTabActive]} onPress={() => { setSource(tab.id); setError(''); }} accessibilityRole="tab" accessibilityState={{ selected: source === tab.id }} testID={`trip-source-${tab.id}`}><AppText style={[styles.pickerTabText, source === tab.id && styles.pickerTabTextActive]}>{tab.label}</AppText></TouchableOpacity>)}</View>
      {source === 'search' ? <View style={{ paddingHorizontal: 16, paddingTop: 8, backgroundColor: '#FFFFFF', gap: 8 }}>
        <View style={styles.searchBox}><Ionicons name="search" size={20} color={colors.primary} /><AppTextInput value={query} onChangeText={setQuery} returnKeyType="search" placeholder="חיפוש מקום או המלצה בכל PlanLi…" style={styles.searchInput} accessibilityLabel="חיפוש המלצות" testID="trip-search-input" /></View>
        <TouchableOpacity style={styles.filterChip} onPress={() => setDestinationOpen((open) => !open)} accessibilityRole="button" accessibilityState={{ expanded: destinationOpen }}><Ionicons name="location-outline" size={17} color={colors.primary} /><AppText style={styles.filterText}>{destination?.cityName || destination?.countryName || 'כל היעדים'} · שינוי יעד</AppText></TouchableOpacity>
        {destinationOpen ? <View style={styles.formCard}><SingleDestinationPicker value={destination} onChange={setDestination} /><TouchableOpacity style={styles.secondaryButton} onPress={() => { setDestination(null); setDestinationOpen(false); }} accessibilityRole="button"><AppText style={styles.secondaryButtonText}>חיפוש בכל היעדים</AppText></TouchableOpacity><TouchableOpacity style={styles.primaryButton} onPress={() => setDestinationOpen(false)} accessibilityRole="button"><AppText style={styles.primaryButtonText}>הצגת המלצות</AppText></TouchableOpacity></View> : null}
      </View> : null}
      <FlatList data={pending ? [] : items} renderItem={renderItem} keyExtractor={(item) => item.id} contentContainerStyle={[styles.pageContent, { flexGrow: 1 }]} keyboardShouldPersistTaps="handled" testID="trip-discovery-list"
        ListHeaderComponent={source === 'map' ? <View style={{ gap: 10 }}>
          {tripMapStops.length ? <><View style={styles.discoveryMap}><TripPlannerMap stops={tripMapStops} onRegionChange={setMapRegion} style={{ position: 'absolute' }} /></View><View style={styles.filterRow}><TouchableOpacity style={styles.filterChip} onPress={searchMap} accessibilityRole="button"><Ionicons name="search" size={17} color={colors.primary} /><AppText style={styles.filterText}>חיפוש באזור הזה</AppText></TouchableOpacity><TouchableOpacity style={[styles.filterChip, nearRoute && styles.filterChipSelected]} onPress={() => setNearRoute((value) => !value)} accessibilityRole="button" accessibilityState={{ selected: nearRoute }}><AppText style={styles.filterText}>קרוב למסלול</AppText></TouchableOpacity></View></> : <View style={styles.conflictCard}><AppText style={styles.modalText}>כדי לחפש סביב מסלול, הוסיפו קודם עצירה עם מיקום. אפשר כבר עכשיו לבחור מהשמורים או לחפש בכל האפליקציה.</AppText><TouchableOpacity style={styles.secondaryButton} onPress={() => setSource('search')} accessibilityRole="button"><AppText style={styles.secondaryButtonText}>מעבר לחיפוש</AppText></TouchableOpacity></View>}
          <AppText style={styles.summaryTitle}>המלצות על המפה</AppText>
        </View> : <View style={{ gap: 4 }}><AppText style={styles.summaryTitle}>{source === 'saved' ? 'ההמלצות ששמרתם' : 'המלצות מכל PlanLi'}</AppText><AppText style={styles.modalText}>{source === 'saved' ? 'לחצו על הכותרת להצצה, ועל הסימון כדי לבחור.' : 'מצאו מקום, הציצו בפרטים ובחרו את העצירות לטיול.'}</AppText></View>}
        ListEmptyComponent={<View style={styles.empty}>{tripLoading || pending ? <ActivityIndicator color={colors.primary} /> : <><AppText style={styles.emptyTitle}>{displayedError ? 'לא הצלחנו לטעון המלצות' : source === 'saved' ? 'עוד לא שמרתם המלצות' : source === 'map' ? 'עוד אין המלצות באזור הזה' : query.trim().length === 1 ? 'הקלידו עוד תו לחיפוש' : 'לא נמצאו המלצות מתאימות'}</AppText><AppText style={styles.emptyText}>{displayedError || (source === 'saved' ? 'חפשו המלצות ב־PlanLi ושמרו את המקומות שאהבתם.' : 'נסו יעד או חיפוש אחר.')}</AppText></>}{displayedError ? <TouchableOpacity style={[styles.secondaryButton, { marginTop: 12 }]} onPress={() => source === 'saved' ? saved.reload() : source === 'map' ? searchMap() : setAttempt((value) => value + 1)} accessibilityRole="button"><AppText style={styles.secondaryButtonText}>ניסיון נוסף</AppText></TouchableOpacity> : null}</View>}
        ListFooterComponent={source === 'saved' && saved.favorites.length >= pageSize ? <TouchableOpacity style={styles.secondaryButton} onPress={() => setPageSize((size) => Math.min(size + 50, 500))} accessibilityRole="button" accessibilityLabel="טעינת המלצות שמורות נוספות"><AppText style={styles.secondaryButtonText}>עוד המלצות שמורות</AppText></TouchableOpacity> : source === 'search' && searchItems.length >= 30 ? <AppText style={styles.modalText}>לא מצאתם? נסו לדייק את שם המקום או לבחור יעד.</AppText> : null}
      />
      <View style={styles.pickerTray}>
        <AppText style={[styles.selectionCount, { color: colors.primary }]}>{selectedIds.length ? `${selectedIds.length} המלצות נבחרו · לאן נוסיף?` : 'בחרו המלצות ואז יום בטיול'}</AppText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row-reverse', gap: 8 }}>{days.map((day) => <TouchableOpacity key={day.id} style={[styles.dayChip, day.id === targetDayId && styles.dayChipSelected]} onPress={() => setTargetDayId(day.id)} accessibilityRole="button" accessibilityState={{ selected: day.id === targetDayId }} testID={`trip-target-${day.id}`}><AppText style={[styles.dayChipText, day.id === targetDayId && styles.dayChipTextSelected]}>{day.kind === 'ideas' ? 'רעיונות' : day.title}</AppText></TouchableOpacity>)}</ScrollView>
        <TouchableOpacity onPress={add} disabled={!selectedIds.length || saving || !trip || tripLoading} style={[styles.primaryButton, (!selectedIds.length || saving || !trip) && styles.primaryButtonDisabled]} accessibilityRole="button" accessibilityLabel={`הוספה אל ${targetDay?.kind === 'ideas' ? 'רעיונות' : targetDay?.title || 'הטיול'}`} testID="trip-add-selected">{saving ? <ActivityIndicator color="#FFFFFF" /> : <AppText style={styles.primaryButtonText}>הוספה אל {targetDay?.kind === 'ideas' ? 'רעיונות' : targetDay?.title || 'הטיול'}</AppText>}</TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
