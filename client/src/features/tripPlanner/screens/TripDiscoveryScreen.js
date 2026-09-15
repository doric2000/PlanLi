import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StatusBar, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';

import AppText from '../../../components/AppText';
import AppTextInput from '../../../components/AppTextInput';
import CachedImage from '../../../components/CachedImage';
import { colors, tripPlannerStyles as styles } from '../../../styles';
import { applyPrivateTripOperations, discoverTripRecommendations, tripErrorMessage } from '../../../services/TripService';
import TripPlannerMap from '../components/TripPlannerMap';
import { DEFAULT_REGION, viewportForRegion } from '../utils/tripPlannerModel';

const FILTERS = [
  { id: 'all', label: 'הכול' },
  { id: 'nearRoute', label: 'קרוב למסלול', icon: 'git-branch-outline' },
];

export default function TripDiscoveryScreen({ navigation, route }) {
  const { tripId, dayId } = route.params;
  const [revision, setRevision] = useState(route.params.revision);
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [region, setRegion] = useState(DEFAULT_REGION);
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const search = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const result = await discoverTripRecommendations({
        tripId, dayId, viewport: viewportForRegion(region), query,
        nearRoute: activeFilter === 'nearRoute', maxDetourKm: 30,
      });
      setItems(result.items || []);
      if (result.zoomInRequired) setError('התקרבו מעט במפה כדי לראות המלצות מדויקות יותר.');
    } catch (cause) { setError(tripErrorMessage(cause, 'לא הצלחנו לטעון המלצות באזור הזה.')); }
    finally { setLoading(false); }
  }, [activeFilter, dayId, query, region, tripId]);

  useFocusEffect(useCallback(() => { search(); }, [tripId, dayId, activeFilter]));
  const mapStops = useMemo(() => items.map((item) => ({ id: item.id, title: item.title, subtitle: item.place?.address, coordinates: item.place?.coordinates, sourceType: 'recommendation' })), [items]);
  const toggle = (id) => setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  const add = async () => {
    if (!selected.length || saving) return;
    setSaving(true); setError('');
    try {
      const result = await applyPrivateTripOperations({ tripId, expectedRevision: revision, operations: [{ type: 'add_recommendation_stops', dayId, recommendationIds: selected }] });
      setRevision(result.revision);
      navigation.goBack();
    } catch (cause) { setError(tripErrorMessage(cause)); }
    finally { setSaving(false); }
  };

  return (
    <SafeAreaView style={styles.fullScreen} edges={['top', 'left', 'right', 'bottom']}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.pageHeader}>
        <TouchableOpacity style={styles.iconButton} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="חזרה"><Ionicons name="arrow-forward" size={22} color={colors.primary} /></TouchableOpacity>
        <AppText style={styles.pageHeaderTitle}>בחירת המלצות</AppText>
      </View>
      <ScrollView contentContainerStyle={[styles.pageContent, { paddingBottom: selected.length ? 112 : 32 }]} keyboardShouldPersistTaps="handled">
        <View style={styles.searchBox}>
          <Ionicons name="search" size={20} color={colors.primary} />
          <AppTextInput value={query} onChangeText={setQuery} onSubmitEditing={search} returnKeyType="search" placeholder="חיפוש מקום, אוכל או חוויה…" style={styles.searchInput} />
          <TouchableOpacity onPress={search} style={styles.iconButton} accessibilityRole="button" accessibilityLabel="חיפוש"><Ionicons name="arrow-back" size={19} color={colors.primary} /></TouchableOpacity>
        </View>
        <View style={styles.filterRow}>{FILTERS.map((filter) => { const active = activeFilter === filter.id; return <TouchableOpacity key={filter.id} onPress={() => setActiveFilter(filter.id)} style={[styles.filterChip, active && styles.filterChipSelected]} accessibilityRole="button" accessibilityState={{ selected: active }}>{filter.icon ? <Ionicons name={filter.icon} size={16} color={colors.primary} /> : null}<AppText style={styles.filterText}>{filter.label}</AppText></TouchableOpacity>; })}</View>
        <View style={styles.discoveryMap}><TripPlannerMap stops={mapStops} selectedStopId={selected[selected.length - 1]} onSelectStop={toggle} onRegionChange={setRegion} style={{ position: 'absolute' }} /></View>
        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' }}><AppText style={styles.summaryTitle}>המלצות באזור המפה</AppText><TouchableOpacity onPress={search} style={styles.filterChip}><Ionicons name="refresh" size={16} color={colors.primary} /><AppText style={styles.filterText}>חיפוש באזור הזה</AppText></TouchableOpacity></View>
        {!!error && <AppText style={styles.errorText}>{error}</AppText>}
        {loading ? <ActivityIndicator color={colors.primary} /> : (
          <View style={styles.discoveryList}>
            {items.map((item) => {
              const checked = selected.includes(item.id);
              const thumb = item.media?.[0]?.thumb?.url;
              return (
                <TouchableOpacity key={item.id} onPress={() => toggle(item.id)} style={[styles.discoveryCard, checked && styles.discoveryCardSelected]} accessibilityRole="checkbox" accessibilityState={{ checked }}>
                  {thumb ? <CachedImage source={{ uri: thumb }} style={styles.discoveryThumb} contentFit="cover" /> : <View style={[styles.discoveryThumb, { alignItems: 'center', justifyContent: 'center' }]}><Ionicons name="image-outline" size={24} color={colors.textMuted} /></View>}
                  <View style={styles.stopCopy}><AppText style={styles.stopTitle} numberOfLines={1}>{item.title}</AppText><AppText style={styles.stopSubtitle} numberOfLines={2}>{item.place?.address || [item.destination?.cityName, item.destination?.countryName].filter(Boolean).join(' · ')}</AppText>{Number.isFinite(item.detourKm) ? <AppText style={styles.stopSource}>{item.detourKm} ק״מ מהמסלול</AppText> : null}</View>
                  <View style={[styles.check, checked && styles.checkSelected]}>{checked ? <Ionicons name="checkmark" size={18} color="#FFFFFF" /> : null}</View>
                </TouchableOpacity>
              );
            })}
            {!items.length && !loading ? <View style={styles.empty}><AppText style={styles.emptyTitle}>עוד לא מצאנו כאן המלצות</AppText><AppText style={styles.emptyText}>הזיזו או קרבו את המפה, ואז חפשו באזור החדש.</AppText></View> : null}
          </View>
        )}
      </ScrollView>
      {selected.length ? <View style={styles.selectionTray}><AppText style={styles.selectionCount}>{selected.length === 1 ? 'המלצה אחת נבחרה' : `${selected.length} המלצות נבחרו`}</AppText><TouchableOpacity onPress={add} disabled={saving} style={styles.selectionButton}>{saving ? <ActivityIndicator color="#FFFFFF" /> : <AppText style={styles.selectionButtonText}>הוספה למסלול</AppText>}</TouchableOpacity></View> : null}
    </SafeAreaView>
  );
}
