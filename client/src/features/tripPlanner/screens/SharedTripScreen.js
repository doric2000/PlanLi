import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, StatusBar, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AppText from '../../../components/AppText';
import { colors, tripPlannerStyles as styles } from '../../../styles';
import { copySharedTrip, getSharedTrip, sharedTripErrorMessage, tripErrorMessage } from '../../../services/TripService';
import TripDayTabs from '../components/TripDayTabs';
import TripPlannerMapCard from '../components/TripPlannerMapCard';
import MapStopDetails from '../../../components/MapStopDetails';
import { getRecommendationImageUrls } from '../../../utils/mediaAssets';
import TripStopList from '../components/TripStopList';
import { coordinatesForStop, getDay, orderedStops } from '../utils/tripPlannerModel';

export default function SharedTripScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const token = route.params?.token || '';
  const [trip, setTrip] = useState(null);
  const [dayId, setDayId] = useState('');
  const [selectedStopId, setSelectedStopId] = useState('');
  const [mapExpanded, setMapExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [copying, setCopying] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError('');
    try {
      const value = await getSharedTrip(token);
      if (requestId.current !== currentRequest) return;
      setTrip(value);
      setDayId((current) => value.days?.some((day) => day.id === current)
        ? current : value.days?.find((day) => day.kind === 'day')?.id || value.ideasDayId);
    } catch (cause) { if (requestId.current === currentRequest) setError(sharedTripErrorMessage(cause)); }
    finally { if (requestId.current === currentRequest) setLoading(false); }
  }, [token]);
  useEffect(() => {
    load();
    return () => { requestId.current += 1; };
  }, [load]);

  const day = useMemo(() => getDay(trip, dayId), [dayId, trip]);
  const stops = useMemo(() => orderedStops(day), [day]);
  const pointCount = stops.filter(coordinatesForStop).length;
  const hasLocation = pointCount > 0;
  const selectedStop = stops.find((stop) => stop.id === selectedStopId);
  const copy = async () => {
    if (copying) return;
    setCopying(true); setError('');
    try {
      const result = await copySharedTrip(token);
      navigation.replace('TripPlanner', { tripId: result.tripId });
    } catch (cause) { setError(tripErrorMessage(cause, 'לא הצלחנו ליצור עותק.')); }
    finally { setCopying(false); }
  };

  const stateInsets = { paddingTop: insets.top, paddingBottom: insets.bottom,
    paddingLeft: insets.left, paddingRight: insets.right };
  if (loading && !trip) return <View style={[styles.fullScreen, stateInsets]}><StatusBar barStyle="dark-content" /><View style={styles.sharedStateLoading}><ActivityIndicator size="large" color={colors.primary} /><AppText style={styles.loadingText}>טוענים את הטיול המשותף…</AppText></View></View>;
  if (!trip) return <View style={[styles.fullScreen, stateInsets]} testID="shared-trip-error-safe-area">
    <StatusBar barStyle="dark-content" />
    <View style={[styles.empty, styles.sharedStateError]}>
      <Ionicons name="link-outline" size={42} color={colors.primary} />
      <AppText style={styles.emptyTitle}>לא הצלחנו לפתוח את הטיול</AppText>
      <AppText style={styles.errorText}>{error}</AppText>
      <TouchableOpacity style={styles.secondaryButton} onPress={load} accessibilityRole="button"><AppText style={styles.secondaryButtonText}>ניסיון נוסף</AppText></TouchableOpacity>
      <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.goBack()} accessibilityRole="button"><AppText style={styles.secondaryButtonText}>חזרה</AppText></TouchableOpacity>
    </View>
  </View>;

  return <View style={styles.editorScreen} testID="shared-trip-screen">
    <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />
    <View style={[styles.editorHeader, { paddingTop: Math.max(insets.top, 8) }]}><View style={styles.headerRow}>
      <TouchableOpacity style={styles.iconButton} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="חזרה"><Ionicons name="arrow-forward" size={22} color={colors.primary} /></TouchableOpacity>
      <View style={styles.headerCopy}><AppText style={styles.headerTitle}>{trip.title}</AppText><AppText style={styles.headerSubtitle}>מסלול פרטי של {trip.shared?.owner?.displayName || 'מטייל/ת'}</AppText></View>
      <View style={styles.readOnlyBadge}><AppText style={styles.readOnlyText}>צפייה בלבד</AppText></View>
    </View></View>
    {!!error && <View style={[styles.conflictCard, { margin: 12 }]}><AppText style={styles.errorText}>{error}</AppText></View>}
    <View style={styles.editorBody}>
      <TripDayTabs trip={trip} selectedDayId={dayId} onSelect={(id) => { setDayId(id); setSelectedStopId(''); }} readOnly />
      <View style={styles.summary}><View><AppText style={styles.summaryTitle}>{day?.kind === 'ideas' ? 'רעיונות' : day?.title}</AppText><AppText style={styles.summaryMeta}>{stops.length} עצירות</AppText></View></View>
      {hasLocation ? <TripPlannerMapCard key={dayId} stops={stops} selectedStopId={selectedStopId} onSelectStop={setSelectedStopId}
        onMapPress={() => setSelectedStopId('')} active={focused && !mapExpanded} onExpand={() => setMapExpanded(true)} />
        : <View style={styles.editorMapCard}><View style={styles.editorMapHint}><Ionicons name="map-outline" size={26} color={colors.primary} /><AppText style={styles.editorMapHintText}>{stops.length ? 'לעצירות האלה אין מיקום במפה' : 'אין עדיין עצירות ביום הזה'}</AppText></View></View>}
      {stops.length ? <TripStopList stops={stops} selectedStopId={selectedStopId} onSelect={(id) => setSelectedStopId((current) => current === id ? '' : id)} onOpenRecommendation={(stop) => navigation.navigate('RecommendationDetail', { postId: stop.recommendationId })} readOnly /> : <View style={[styles.empty, { flex: 1 }]}><AppText style={styles.emptyTitle}>אין עצירות ביום הזה</AppText></View>}
    </View>
    <View style={[styles.editorFooter, { paddingBottom: Math.max(insets.bottom, 12) }]}><TouchableOpacity onPress={copy} disabled={copying} style={[styles.primaryButton, { flex: 1 }]} accessibilityRole="button" testID="shared-trip-copy">{copying ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="copy-outline" size={18} color="#FFFFFF" />}<AppText style={styles.primaryButtonText}>יצירת עותק לתכנון משלי</AppText></TouchableOpacity></View>
    <Modal visible={mapExpanded} animationType="slide" onRequestClose={() => setMapExpanded(false)}>
      <View style={styles.mapFullScreen}>
        <View style={[styles.editorMapFullHeader, { paddingTop: Math.max(insets.top, 8) }]} testID="shared-trip-map-header">
          <View style={styles.headerRow}>
            <TouchableOpacity style={styles.iconButton} onPress={() => setMapExpanded(false)} accessibilityRole="button" accessibilityLabel="חזרה לרשימת העצירות"><Ionicons name="close" size={22} color={colors.primary} /></TouchableOpacity>
            <View style={styles.headerCopy}>
              <AppText style={styles.editorMapFullTitle} numberOfLines={1}>{day?.title || 'מפת הטיול'}</AppText>
              <AppText style={styles.headerSubtitle}>{pointCount === 1 ? 'נקודה מדויקת אחת' : `${pointCount} נקודות מדויקות`}</AppText>
            </View>
          </View>
        </View>
        {mapExpanded && hasLocation ? <TripPlannerMapCard key={dayId} stops={stops} selectedStopId={selectedStopId}
          onSelectStop={setSelectedStopId} onMapPress={() => setSelectedStopId('')} active={focused && mapExpanded} expanded /> : null}
        {selectedStop ? <MapStopDetails title={selectedStop.title} number={stops.findIndex((stop) => stop.id === selectedStopId) + 1}
          dayLabel={day?.title} imageUrl={getRecommendationImageUrls(selectedStop, 'thumb')[0]}
          address={selectedStop.subtitle} description={selectedStop.note} style={{ bottom: Math.max(insets.bottom, 18) }}
          onClose={() => setSelectedStopId('')} actionLabel="חזרה לרשימה ולפרטי העצירה" onAction={() => setMapExpanded(false)} /> : null}
      </View>
    </Modal>
  </View>;
}
