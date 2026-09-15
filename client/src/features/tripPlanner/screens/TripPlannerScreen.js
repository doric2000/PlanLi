import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, StatusBar, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import uuid from 'react-native-uuid';

import AppText from '../../../components/AppText';
import AppTextInput from '../../../components/AppTextInput';
import { colors, tripPlannerStyles as styles } from '../../../styles';
import {
  applyPrivateTripOperations, cacheTrip, computePrivateTripRoute, createPrivateTrip,
  flushTripOperationQueue, getPrivateTrip, isOfflineTripError, loadCachedTrip,
  queueTripOperations, tripErrorMessage, tripErrorReason,
} from '../../../services/TripService';
import TripDayTabs from '../components/TripDayTabs';
import TripPlannerMap from '../components/TripPlannerMap';
import TripPlannerSheet from '../components/TripPlannerSheet';
import TripShareModal from '../components/TripShareModal';
import TripStopList from '../components/TripStopList';
import { applyOperationsLocally, getDay, orderedStops, routeSummary } from '../utils/tripPlannerModel';

export default function TripPlannerScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const requestedTripId = route?.params?.tripId || '';
  const creating = useRef(false);
  const tripRef = useRef(null);
  const [tripId, setTripId] = useState(requestedTripId);
  const [createAttempt, setCreateAttempt] = useState(0);
  const [trip, setTrip] = useState(null);
  const [title, setTitle] = useState('');
  const [selectedDayId, setSelectedDayId] = useState('');
  const [selectedStopId, setSelectedStopId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState(null);
  const [routeData, setRouteData] = useState(null);
  const [shareVisible, setShareVisible] = useState(false);
  const [conflict, setConflict] = useState(null);
  const [movingStop, setMovingStop] = useState(null);

  const absorb = useCallback((value) => {
    if (!value) return;
    tripRef.current = value;
    setTrip(value); setTitle(value.title || 'הטיול שלי');
    setSelectedDayId((current) => value.days?.some((day) => day.id === current) ? current : value.days?.find((day) => day.kind === 'day')?.id || value.ideasDayId || value.days?.[0]?.id || '');
  }, []);

  const load = useCallback(async (id, { quiet = false } = {}) => {
    if (!id) return;
    if (!quiet) setLoading(true);
    try {
      const cached = await loadCachedTrip(id);
      if (cached && !tripRef.current) absorb(cached);
      const fresh = await getPrivateTrip(id);
      absorb(fresh);
      const flushed = await flushTripOperationQueue(id);
      if (flushed.applied) absorb(await getPrivateTrip(id));
      if (flushed.remaining) setBanner({ kind: 'offline', text: 'יש שינויים שממתינים לסנכרון. ננסה שוב כשהחיבור יתייצב.' });
      else setBanner((current) => current?.kind === 'offline' ? null : current);
    } catch (cause) {
      if (!tripRef.current) setBanner({ kind: 'error', text: tripErrorMessage(cause, 'לא הצלחנו לטעון את הטיול.') });
    } finally { setLoading(false); }
  }, [absorb]);

  useEffect(() => {
    if (tripId || creating.current) { if (tripId) load(tripId); return; }
    creating.current = true;
    setLoading(true);
    createPrivateTrip({ title: 'הטיול החדש שלי' }).then((result) => {
      setTripId(result.tripId);
      navigation.setParams?.({ tripId: result.tripId });
    }).catch((cause) => {
      setBanner({ kind: 'error', text: tripErrorMessage(cause, 'לא הצלחנו ליצור טיול חדש.') });
      setLoading(false);
    }).finally(() => { creating.current = false; });
  }, [createAttempt, load, navigation, tripId]);

  useFocusEffect(useCallback(() => {
    if (tripId && tripRef.current) load(tripId, { quiet: true });
  }, [load, tripId]));

  const selectedDay = useMemo(() => getDay(trip, selectedDayId), [trip, selectedDayId]);
  const stops = useMemo(() => orderedStops(selectedDay), [selectedDay]);

  useEffect(() => {
    if (!tripId || !selectedDayId || stops.filter((stop) => stop.coordinates).length < 2) { setRouteData(null); return; }
    let active = true;
    const timer = setTimeout(() => {
      computePrivateTripRoute(tripId, selectedDayId).then((result) => {
        if (active) { setRouteData(result); setBanner((current) => current?.kind === 'route' ? null : current); }
      }).catch((cause) => {
        if (active) { setRouteData(null); setBanner({ kind: 'route', text: tripErrorMessage(cause) }); }
      });
    }, 450);
    return () => { active = false; clearTimeout(timer); };
  }, [selectedDayId, stops.map((stop) => `${stop.id}:${stop.order}`).join('|'), tripId, trip?.revision]);

  const mutate = useCallback(async (operations, { optimistic = true } = {}) => {
    if (!trip || busy) return null;
    const base = trip;
    if (optimistic) { const next = applyOperationsLocally(base, operations); setTrip(next); cacheTrip(next).catch(() => {}); }
    setBusy(true); setConflict(null);
    try {
      const result = await applyPrivateTripOperations({ tripId: base.id, expectedRevision: base.revision, operations });
      await load(base.id, { quiet: true });
      return result;
    } catch (cause) {
      if (isOfflineTripError(cause)) {
        await queueTripOperations({ tripId: base.id, expectedRevision: base.revision, operations });
        setBanner({ kind: 'offline', text: 'השינוי נשמר במכשיר ויסונכרן אוטומטית כשיהיה חיבור.' });
        return { queued: true };
      }
      if (tripErrorReason(cause) === 'REVISION_CONFLICT') {
        setConflict({ operations, message: tripErrorMessage(cause) });
        await load(base.id, { quiet: true });
      } else {
        absorb(base);
        setBanner({ kind: 'error', text: tripErrorMessage(cause) });
      }
      return null;
    } finally { setBusy(false); }
  }, [absorb, busy, load, trip]);

  const saveTitle = () => {
    const next = title.trim();
    if (trip && next && next !== trip.title) mutate([{ type: 'set_title', title: next }]);
    else setTitle(trip?.title || '');
  };
  const addDay = () => {
    if (!trip) return;
    const number = (trip.days || []).filter((day) => day.kind === 'day').length + 1;
    const clientId = `day-${uuid.v4()}`;
    mutate([{ type: 'add_day', clientId, title: `יום ${number}`, travelMode: 'DRIVE' }]).then((result) => { if (result) setSelectedDayId(clientId); });
  };
  const reorder = (next) => mutate([{ type: 'reorder_stops', dayId: selectedDay.id, stopIds: next.map((stop) => stop.id) }]);
  const remove = (stop) => Alert.alert('להסיר את העצירה?', stop.title, [
    { text: 'ביטול', style: 'cancel' },
    { text: 'הסרה', style: 'destructive', onPress: () => mutate([{ type: 'delete_stop', dayId: selectedDay.id, stopId: stop.id }]) },
  ]);
  const updateMode = (travelMode) => mutate([{ type: 'update_day', dayId: selectedDay.id, travelMode }]);
  const moveStop = async (targetDayId) => {
    const stop = movingStop;
    setMovingStop(null);
    if (!stop || targetDayId === selectedDay.id) return;
    await mutate([{ type: 'move_stop', dayId: selectedDay.id, targetDayId, stopId: stop.id }]);
  };
  const reapplyConflict = async () => {
    if (!conflict || !trip) return;
    const operations = conflict.operations;
    setConflict(null);
    await mutate(operations);
  };

  if (loading && !trip) return <View style={styles.fullScreen}><StatusBar barStyle="dark-content" /><View style={styles.loadingOverlay}><ActivityIndicator size="large" color={colors.primary} /><AppText style={styles.loadingText}>מכינים את סביבת התכנון שלך…</AppText></View></View>;
  if (!trip) return <View style={styles.fullScreen}><View style={styles.empty}><Ionicons name="cloud-offline-outline" size={42} color={colors.primary} /><AppText style={styles.emptyTitle}>לא הצלחנו לפתוח את הטיול</AppText><AppText style={styles.emptyText}>{banner?.text}</AppText><TouchableOpacity style={[styles.primaryButton, { marginTop: 18 }]} onPress={() => { setBanner(null); if (tripId) load(tripId); else { setLoading(true); setCreateAttempt((current) => current + 1); } }}><AppText style={styles.primaryButtonText}>ניסיון נוסף</AppText></TouchableOpacity></View></View>;

  return (
    <View style={styles.screen} testID="trip-planner-screen">
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />
      <TripPlannerMap stops={stops} route={routeData} selectedStopId={selectedStopId} onSelectStop={setSelectedStopId} />
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 8) }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.iconButton} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="חזרה"><Ionicons name="arrow-forward" size={22} color={colors.primary} /></TouchableOpacity>
          <View style={styles.headerCopy}>
            <AppTextInput value={title} onChangeText={setTitle} onBlur={saveTitle} maxLength={120} selectTextOnFocus style={styles.headerTitle} accessibilityLabel="שם הטיול" />
            <AppText style={styles.headerSubtitle}>פרטי · נשמר אוטומטית · {trip.stopCount} עצירות</AppText>
          </View>
          <TouchableOpacity style={[styles.iconButton, styles.iconButtonPrimary]} onPress={() => setShareVisible(true)} accessibilityRole="button" accessibilityLabel="שיתוף פרטי"><Ionicons name="share-outline" size={21} color={colors.primary} /></TouchableOpacity>
          <TouchableOpacity style={styles.iconButton} onPress={() => navigation.navigate('MyTrips')} accessibilityRole="button" accessibilityLabel="הטיולים שלי"><Ionicons name="albums-outline" size={21} color={colors.primary} /></TouchableOpacity>
        </View>
      </View>
      {banner ? <View style={[styles.banner, banner.kind === 'offline' && styles.bannerOffline]}><Ionicons name={banner.kind === 'offline' ? 'cloud-offline-outline' : 'information-circle-outline'} size={20} color={banner.kind === 'offline' ? colors.primary : '#C2410C'} /><AppText style={styles.bannerText}>{banner.text}</AppText><TouchableOpacity onPress={() => setBanner(null)} style={styles.iconButton} accessibilityLabel="סגירה"><Ionicons name="close" size={18} color={colors.primary} /></TouchableOpacity></View> : null}
      <TripPlannerSheet>
        <TripDayTabs trip={trip} selectedDayId={selectedDayId} onSelect={setSelectedDayId} onAddDay={addDay} />
        <View style={styles.summary}>
          <View><AppText style={styles.summaryTitle}>{selectedDay?.kind === 'ideas' ? 'רעיונות לטיול' : selectedDay?.title}</AppText><AppText style={styles.summaryMeta}>{stops.length} עצירות{routeSummary(routeData) ? ` · ${routeSummary(routeData)}` : ''}</AppText></View>
          {selectedDay?.kind === 'day' ? <View style={styles.modeToggle}>
            {['DRIVE', 'WALK'].map((mode) => { const active = selectedDay.travelMode === mode; return <TouchableOpacity key={mode} style={[styles.modeButton, active && styles.modeButtonSelected]} onPress={() => updateMode(mode)} accessibilityRole="button" accessibilityState={{ selected: active }}><Ionicons name={mode === 'DRIVE' ? 'car-outline' : 'walk-outline'} size={17} color={colors.primary} /><AppText style={[styles.modeText, active && styles.modeTextSelected]}>{mode === 'DRIVE' ? 'רכב' : 'הליכה'}</AppText></TouchableOpacity>; })}
          </View> : null}
        </View>
        {conflict ? <View style={[styles.conflictCard, { marginHorizontal: 14 }]}><AppText style={styles.errorText}>{conflict.message}</AppText><View style={{ flexDirection: 'row-reverse', gap: 8 }}><TouchableOpacity style={[styles.primaryButton, { flex: 1 }]} onPress={reapplyConflict}><AppText style={styles.primaryButtonText}>החלת השינוי מחדש</AppText></TouchableOpacity><TouchableOpacity style={[styles.secondaryButton, { flex: 1 }]} onPress={() => setConflict(null)}><AppText style={styles.secondaryButtonText}>השארת העדכני</AppText></TouchableOpacity></View></View> : null}
        {stops.length ? <TripStopList stops={stops} selectedStopId={selectedStopId} onSelect={setSelectedStopId} onReorder={reorder} onDelete={remove} onMoveToDay={setMovingStop} /> : <View style={styles.empty}><View style={styles.emptyIcon}><Ionicons name="map-outline" size={30} color={colors.accentAction} /></View><AppText style={styles.emptyTitle}>{selectedDay?.kind === 'ideas' ? 'אוספים רעיונות לטיול' : 'היום הזה מחכה לעצירה הראשונה'}</AppText><AppText style={styles.emptyText}>בחרו המלצות קיימות, או הוסיפו מקום ורעיון משלכם.</AppText></View>}
        <View style={[styles.composerBar, { bottom: Math.max(insets.bottom, 12) }]}>
          <TouchableOpacity style={[styles.composerAction, styles.composerActionPrimary]} onPress={() => navigation.navigate('TripDiscovery', { tripId: trip.id, dayId: selectedDay.id, revision: trip.revision })} accessibilityRole="button"><Ionicons name="sparkles-outline" size={19} color="#FFFFFF" /><AppText style={styles.composerActionText}>בחירת המלצות</AppText></TouchableOpacity>
          <TouchableOpacity style={styles.composerAction} onPress={() => navigation.navigate('TripCustomStop', { tripId: trip.id, dayId: selectedDay.id, revision: trip.revision })} accessibilityRole="button"><Ionicons name="add-circle-outline" size={20} color="#FFFFFF" /><AppText style={styles.composerActionText}>עצירה משלי</AppText></TouchableOpacity>
        </View>
      </TripPlannerSheet>
      {busy ? <View pointerEvents="none" style={{ position: 'absolute', top: Math.max(insets.top, 8) + 18, left: 70, zIndex: 30 }}><ActivityIndicator color={colors.accentAction} /></View> : null}
      <TripShareModal visible={shareVisible} trip={trip} onClose={() => setShareVisible(false)} onChanged={(shareActive) => setTrip((current) => ({ ...current, shareActive }))} />
      <Modal transparent visible={Boolean(movingStop)} animationType="fade" onRequestClose={() => setMovingStop(null)}>
        <TouchableOpacity activeOpacity={1} style={styles.modalBackdrop} onPress={() => setMovingStop(null)}>
          <TouchableOpacity activeOpacity={1} style={styles.modalSheet} onPress={() => {}} accessibilityViewIsModal>
            <AppText style={styles.modalTitle}>לאיזה יום להעביר?</AppText>
            <AppText style={styles.modalText}>{movingStop?.title}</AppText>
            {(trip.days || []).filter((day) => day.id !== selectedDay.id).sort((a, b) => a.order - b.order).map((day) => (
              <TouchableOpacity key={day.id} onPress={() => moveStop(day.id)} style={styles.tripCard} accessibilityRole="button">
                <View style={styles.tripCardHeader}><View style={styles.tripCardIcon}><Ionicons name={day.kind === 'ideas' ? 'bulb-outline' : 'calendar-outline'} size={22} color={colors.primary} /></View><View style={styles.tripCardCopy}><AppText style={styles.tripCardTitle}>{day.kind === 'ideas' ? 'רעיונות' : day.title}</AppText><AppText style={styles.tripCardMeta}>{day.stopCount || 0} עצירות</AppText></View><Ionicons name="arrow-back" size={20} color={colors.primary} /></View>
              </TouchableOpacity>
            ))}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}
