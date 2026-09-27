import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StatusBar, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AppText from '../../../components/AppText';
import BackButton from '../../../components/BackButton';
import CachedImage from '../../../components/CachedImage';
import FavoriteButton from '../../../components/FavoriteButton';
import ActionBar from '../../../components/ActionBar';
import { useRecommendationById } from '../../../hooks/useRecommendationById';
import { useBlockedUsers } from '../../moderation/BlockedUsersContext';
import { getRecommendationImageUrls } from '../../../utils/mediaAssets';
import { communityPalette as c } from '../../../styles/communityDiscovery';
import { cityMapItems, cityMapRegion, cityMapViewport } from '../utils/cityMap';
import { useCityDiscovery } from '../hooks/useCityDiscovery';
import CityMapCanvas from './CityMapCanvas';
import { CitySearch } from './CitySearch';

function SelectedRecommendation({ item: summary, onClose, onOpen, onComments, styles }) {
  const { data, loading, error, resolved, refresh } = useRecommendationById(summary.id);
  const { isBlocked } = useBlockedUsers();
  const available = resolved && data?.id === summary.id && data.status === 'active' && !isBlocked(data.ownerId);
  const item = available ? data : summary;
  const image = getRecommendationImageUrls(item, 'thumb')[0];
  return <View style={styles.selectedCard} testID="city-map-selected" accessibilityLiveRegion="polite">
    <View style={styles.selectedRow}>
      {!!image && <CachedImage source={{ uri: image }} contentFit="cover" style={styles.selectedPhoto} />}
      <View style={styles.selectedCopy}>
        <AppText style={styles.selectedTitle} numberOfLines={2}>{item.title}</AppText>
        <AppText style={styles.description} numberOfLines={2}>{item.description || item.place?.address}</AppText>
      </View>
      <Pressable onPress={onClose} style={styles.iconButton} accessibilityRole="button" accessibilityLabel="סגירת ההמלצה במפה">
        <Ionicons name="close" size={20} color={c.navy} />
      </Pressable>
    </View>
    {available ? <><View style={styles.selectedActions}>
      <Pressable onPress={() => onOpen(item)} style={styles.clearButton} accessibilityRole="button" accessibilityLabel={`לפרטי ההמלצה ${item.title}`}>
        <AppText style={styles.showMoreText}>לפרטי ההמלצה</AppText>
      </Pressable>
      <FavoriteButton type="recommendations" id={item.id} variant="light" style={styles.iconButton}
        snapshotData={{ name: item.title, thumbnail_url: image }} />
    </View>
    <ActionBar item={item} compact onCommentPress={onComments} /></> : <View style={styles.sections}>
      {loading ? <ActivityIndicator color={c.navy} /> : <AppText style={styles.stateText}>{error ? 'פרטי ההמלצה לא נטענו כרגע.' : 'ההמלצה אינה זמינה כרגע.'}</AppText>}
      {!loading && !!error && <Pressable onPress={refresh} style={styles.showMoreButton} accessibilityRole="button" accessibilityLabel="ניסיון נוסף לטעינת ההמלצה שנבחרה">
        <AppText style={styles.showMoreText}>ניסיון נוסף</AppText>
      </Pressable>}
    </View>}
  </View>;
}

export default function CityMapSection({ destination, cityId, countryId, recommendations, seedLoading, filters, onFiltersChange, navigation, onComments, styles }) {
  const focused = useIsFocused();
  const seedRegion = useMemo(() => cityMapRegion(destination, recommendations), [destination, recommendations]);
  const [region, setRegion] = useState(null);
  const [viewport, setViewport] = useState(null);
  const [pendingRegion, setPendingRegion] = useState(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [mapStatus, setMapStatus] = useState('loading');
  useEffect(() => {
    if (!region && seedRegion) { setRegion(seedRegion); setViewport(cityMapViewport(seedRegion)); }
  }, [seedRegion, region]);
  const discovery = useCityDiscovery({ cityId, countryId, kind: 'map', filters, viewport, enabled: focused && !!region });
  const items = useMemo(() => cityMapItems(discovery.items), [discovery.items]);
  const selected = items.find((item) => item.id === selectedId)?.recommendation;
  useEffect(() => { if (!selected) setSelectedId(null); }, [selected]);
  useEffect(() => { setMapStatus('loading'); }, [attempt, fullscreen, !!region]);
  useEffect(() => {
    if (!focused || !region || mapStatus !== 'loading') return undefined;
    const timer = setTimeout(() => setMapStatus('error'), 12000);
    return () => clearTimeout(timer);
  }, [focused, region, mapStatus, attempt, fullscreen]);
  useEffect(() => { if (!focused) setFullscreen(false); }, [focused]);
  const retryMap = () => { setMapStatus('loading'); setAttempt((value) => value + 1); };
  const openSelected = (item) => {
    setFullscreen(false);
    navigation.navigate('RecommendationDetail', { postId: item.id, item });
  };
  const preview = selected ? <SelectedRecommendation item={selected} styles={styles} onClose={() => setSelectedId(null)}
    onOpen={openSelected} onComments={(id) => { setFullscreen(false); onComments(id); }} /> : null;
  const map = <View style={fullscreen ? styles.modalMap : styles.mapFrame} testID="city-map-frame">
    {region && focused && <CityMapCanvas key={`${fullscreen}:${attempt}`} region={region} items={items} styles={styles}
      selectedId={selectedId} onSelect={setSelectedId} interactive={fullscreen}
      onReady={() => setMapStatus('ready')} onError={() => setMapStatus('error')}
      onRegionChange={setPendingRegion} onMapPress={() => setSelectedId(null)} />}
    {(!region || mapStatus !== 'ready') && <View style={styles.mapOverlay} pointerEvents={mapStatus === 'error' ? 'auto' : 'none'}>
      {mapStatus !== 'error' && (region || seedLoading) ? <><ActivityIndicator color={c.navy} /><AppText style={styles.stateText}>טוענים את המפה…</AppText></> : <>
        <Ionicons name="map-outline" size={28} color={c.navy} />
        <AppText style={styles.stateTitle}>{region ? 'המפה לא נטענה כרגע' : 'עדיין אין מיקומים להצגה'}</AppText>
        <AppText style={styles.stateText}>המידע על העיר וההמלצות עדיין זמינים.</AppText>
        {!!region && <Pressable accessibilityRole="button" accessibilityLabel="ניסיון נוסף לטעינת המפה" onPress={retryMap} style={styles.showMoreButton}>
          <AppText style={styles.showMoreText}>ניסיון נוסף</AppText>
        </Pressable>}
      </>}
    </View>}
    {!fullscreen && !!region && <Pressable onPress={() => { setPendingRegion(null); setFullscreen(true); }} style={styles.mapExpand}
      accessibilityRole="button" accessibilityLabel="הגדלת מפת העיר" testID="city-map-expand">
      <Ionicons name="expand-outline" size={20} color={c.navy} />
    </Pressable>}
    {mapStatus === 'ready' && discovery.loading && <View style={styles.mapPill} pointerEvents="none"><ActivityIndicator color={c.navy} /></View>}
    {fullscreen && pendingRegion && <Pressable style={styles.mapSearchArea} accessibilityRole="button" onPress={() => {
      setRegion(pendingRegion); setViewport(cityMapViewport(pendingRegion)); setPendingRegion(null); setSelectedId(null);
    }}><AppText style={styles.showMoreText}>חיפוש באזור המוצג</AppText></Pressable>}
  </View>;
  const status = discovery.error ? <Pressable style={styles.showMoreButton} onPress={discovery.retry} accessibilityRole="button" accessibilityLabel="ניסיון נוסף לטעינת ההמלצות במפה">
    <AppText style={styles.showMoreText}>ההמלצות לא נטענו · ניסיון נוסף</AppText>
  </Pressable> : <AppText style={styles.factDetail} accessibilityLiveRegion="polite">
    {discovery.loading ? 'טוענים המלצות בעיר…' : discovery.zoomInRequired || discovery.truncated ? 'יש כאן עוד המלצות — התקרבו במפה כדי לראות אותן'
      : items.length === 1 ? 'המלצה אחת עם מיקום · לחצו על הסמן לפרטים'
        : items.length ? `${items.length} המלצות עם מיקום · לחצו על סמן לפרטים` : 'אין המלצות עם מיקום שמתאימות לחיפוש'}
  </AppText>;
  return <View style={styles.section}>
    <AppText style={styles.sectionTitle}>העיר על המפה</AppText>
    {!fullscreen && <>{map}{status}{preview}</>}
    {fullscreen && <Modal visible animationType="fade" onRequestClose={() => setFullscreen(false)}>
      <SafeAreaView style={styles.mapModal} edges={['top', 'left', 'right', 'bottom']}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.modalHeader}>
          <BackButton color="dark" variant="solid" onPress={() => setFullscreen(false)} accessibilityLabel="חזרה לעמוד העיר" />
          <AppText style={styles.modalHeading} numberOfLines={2}>{destination.name}</AppText>
        </View>
        <View style={styles.sections}>
          <CitySearch kind="recommendations" value={filters.query} onChange={(query) => onFiltersChange({ ...filters, query })} styles={styles} />
          <ScrollView horizontal contentContainerStyle={styles.searchRow} showsHorizontalScrollIndicator={false}>
            {[['', 'הכול'], ['food', 'אוכל ושתייה'], ['nature', 'טבע'], ['stay', 'לינה']].map(([id, title]) => {
              const active = id ? filters.categoryIds.includes(id) : !filters.categoryIds.length;
              return <Pressable key={id} accessibilityRole="button" accessibilityState={{ selected: active }}
                onPress={() => onFiltersChange({ ...filters, categoryIds: id ? [id] : [], subcategoryIds: [] })} style={[styles.showMoreButton, active && styles.mapCategorySelected]}>
                <AppText style={[styles.showMoreText, active && styles.mapCategoryTextSelected]}>{title}</AppText>
              </Pressable>;
            })}
          </ScrollView>
          {status}
        </View>
        {map}
        {!!preview && <ScrollView style={styles.modalCard}>{preview}</ScrollView>}
      </SafeAreaView>
    </Modal>}
  </View>;
}
