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
  applyPrivateTripOperations, cacheTrip, computePrivateTripRoute,
  flushTripOperationQueue, getPrivateTrip, hasQueuedTripOperations,
  isCorruptTripQueueError, isOfflineTripError, loadCachedTrip,
  operationId, quarantineTripOperationQueue, queueTripOperations, tripErrorMessage, tripErrorReason,
} from '../../../services/TripService';
import TripDayTabs from '../components/TripDayTabs';
import TripPlannerMap from '../components/TripPlannerMap';
import TripShareModal from '../components/TripShareModal';
import TripStopList from '../components/TripStopList';
import { applyOperationsLocally, coordinatesForStop, getDay, orderedStops, routeSummary } from '../utils/tripPlannerModel';

export default function TripPlannerScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const tripId = route?.params?.tripId || '';
  const tripRef = useRef(null);
  const mutationChain = useRef(Promise.resolve());
  const offlineChanges = useRef(false);
  const [trip, setTrip] = useState(null);
  const [title, setTitle] = useState('');
  const [selectedDayId, setSelectedDayId] = useState('');
  const [selectedStopId, setSelectedStopId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState('saved');
  const [banner, setBanner] = useState(null);
  const [routeData, setRouteData] = useState(null);
  const [shareVisible, setShareVisible] = useState(false);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const [mapKey, setMapKey] = useState(0);
  const [conflict, setConflict] = useState(null);
  const [movingStop, setMovingStop] = useState(null);

  const absorb = useCallback((value) => {
    if (!value) return;
    tripRef.current = value;
    setTrip(value);
    setTitle(value.title || 'הטיול שלי');
    setSelectedDayId((current) => value.days?.some((day) => day.id === current)
      ? current : value.days?.find((day) => day.kind === 'day')?.id || value.ideasDayId || '');
  }, []);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!tripId) return;
    if (!quiet) setLoading(true);
    let cached = null;
    let pending = false;
    try {
      [pending, cached] = await Promise.all([
        hasQueuedTripOperations(tripId),
        loadCachedTrip(tripId),
      ]);
      if (cached && (pending || !tripRef.current)) absorb(cached);
      if (pending) {
        const flushed = await flushTripOperationQueue(tripId);
        if (flushed.corrupt || flushed.conflict) {
          offlineChanges.current = true;
          setSaveStatus('error');
          setBanner({ kind: 'queue-corrupt', text: flushed.corrupt
            ? 'לא הצלחנו לקרוא שינוי מקומי שממתין לסנכרון. אפשר לשמור עותק שלו במכשיר ולהמשיך מהגרסה שבשרת.'
            : 'שינוי מקומי לא יכול להסתנכרן עם גרסת השרת. אפשר לשמור עותק שלו במכשיר ולהמשיך מהגרסה העדכנית.' });
          return;
        }
        if (flushed.remaining) {
          offlineChanges.current = true;
          setSaveStatus('offline');
          setBanner({ kind: 'offline', text: flushed.conflict
            ? 'יש שינוי שלא סונכרן כי הטיול השתנה או שהעצירה אינה זמינה. השינוי עדיין שמור במכשיר; נסו לסנכרן שוב.'
            : 'יש שינויים שממתינים לסנכרון. נסו שוב כשהחיבור יתייצב.' });
          return;
        }
      }
      const fresh = await getPrivateTrip(tripId);
      offlineChanges.current = false;
      absorb(fresh);
      setSaveStatus('saved');
      setBanner((current) => ['offline', 'refresh', 'queue-corrupt'].includes(current?.kind) ? null : current);
    } catch (cause) {
      offlineChanges.current = pending;
      if (cached && (pending || !tripRef.current)) absorb(cached);
      if (tripRef.current) {
        setSaveStatus(pending ? 'offline' : 'saved');
        setBanner({ kind: pending ? 'offline' : 'refresh', text: pending
          ? 'מוצג העותק השמור במכשיר. אפשר להמשיך לתכנן; נסנכרן כשהחיבור יחזור.'
          : 'מוצג העותק האחרון במכשיר. לא הצלחנו לבדוק אם הטיול השתנה; נסו לטעון מחדש.' });
      } else setBanner({ kind: 'error', text: tripErrorMessage(cause, 'לא הצלחנו לטעון את הטיול.') });
    } finally { setLoading(false); }
  }, [absorb, tripId]);

  useEffect(() => {
    if (!tripId) navigation.replace('MyTrips');
  }, [navigation, tripId]);
  useFocusEffect(useCallback(() => { if (tripId) load({ quiet: Boolean(tripRef.current) }); }, [load, tripId]));

  const selectedDay = useMemo(() => getDay(trip, selectedDayId), [trip, selectedDayId]);
  const stops = useMemo(() => orderedStops(selectedDay), [selectedDay]);
  const selectedStop = stops.find((stop) => stop.id === selectedStopId);
  const locatedStops = stops.filter((stop) => coordinatesForStop(stop));
  const hasLocatedStops = locatedStops.length > 0;
  const actualStopCount = (trip?.days || []).reduce((sum, day) => sum + (day.stops?.length || 0), 0);
  const graphMismatch = Boolean(trip && actualStopCount !== Number(trip.stopCount));

  useEffect(() => {
    if (!tripId || !selectedDayId || locatedStops.length < 2 || offlineChanges.current) { setRouteData(null); return undefined; }
    let active = true;
    setRouteData(null);
    const timer = setTimeout(() => {
      computePrivateTripRoute(tripId, selectedDayId).then((result) => {
        if (active) { setRouteData(result); setBanner((current) => current?.kind === 'route' ? null : current); }
      }).catch((cause) => {
        if (active) {
          setRouteData(null);
          setBanner((current) => ['offline', 'refresh', 'queue-corrupt'].includes(current?.kind)
            ? current : { kind: 'route', text: tripErrorMessage(cause) });
        }
      });
    }, 450);
    return () => { active = false; clearTimeout(timer); };
  }, [saveStatus, selectedDayId, stops.map((stop) => `${stop.id}:${stop.order}`).join('|'), tripId, trip?.revision]);

  useEffect(() => {
    if (!locatedStops.length || mapReady) return undefined;
    const timer = setTimeout(() => setMapFailed(true), 10000);
    return () => clearTimeout(timer);
  }, [locatedStops.length, mapReady, mapKey]);

  useEffect(() => {
    setMapReady(false);
    setMapFailed(false);
  }, [selectedDayId, hasLocatedStops]);

  const mutate = useCallback((operations) => {
    const run = async () => {
      const base = tripRef.current;
      if (!base) return null;
      setSaveStatus('saving');
      setConflict(null);
      const optimistic = applyOperationsLocally(base, operations);
      const id = operationId('mutate');
      absorb(optimistic);
      let cached = false;
      try { await cacheTrip(optimistic); cached = true; }
      catch { /* A server save may still succeed; offline recovery needs the cache. */ }
      try {
        if (offlineChanges.current) throw Object.assign(new Error('Pending offline changes'), { code: 'functions/unavailable' });
        const result = await applyPrivateTripOperations({ tripId: base.id, expectedRevision: base.revision, operations, id });
        try { absorb(await getPrivateTrip(base.id)); }
        catch { setBanner({ kind: 'refresh', text: 'השינוי נשמר, אבל לא הצלחנו לרענן את הטיול. לחצו לטעינה מחדש.' }); }
        setSaveStatus('saved');
        return result;
      } catch (cause) {
        if (isOfflineTripError(cause)) {
          if (!cached) {
            absorb(base);
            setSaveStatus('error');
            setBanner({ kind: 'error', text: 'לא הצלחנו לשמור את השינוי במכשיר. נסו שוב כשהחיבור יחזור.' });
            return null;
          }
          try { await queueTripOperations({ tripId: base.id, expectedRevision: base.revision, operations, id }); }
          catch (queueCause) {
            absorb(base);
            await cacheTrip(base).catch(() => {});
            setSaveStatus('error');
            setBanner(isCorruptTripQueueError(queueCause)
              ? { kind: 'queue-corrupt', text: 'לא הצלחנו לקרוא שינוי מקומי שממתין לסנכרון. שמרו עותק שלו והמשיכו מהגרסה שבשרת.' }
              : { kind: 'error', text: 'לא הצלחנו לשמור את השינוי במכשיר. נסו שוב.' });
            return null;
          }
          offlineChanges.current = true;
          setSaveStatus('offline');
          setBanner({ kind: 'offline', text: 'השינוי נשמר במכשיר ויסונכרן כשיהיה חיבור.' });
          return { queued: true };
        }
        if (tripErrorReason(cause) === 'REVISION_CONFLICT') {
          try { absorb(await getPrivateTrip(base.id)); }
          catch {
            absorb(base);
            await cacheTrip(base).catch(() => {});
          }
          setConflict({ operations, message: tripErrorMessage(cause) });
        } else {
          absorb(base);
          await cacheTrip(base).catch(() => {});
          setBanner({ kind: 'error', text: tripErrorMessage(cause) });
        }
        setSaveStatus('error');
        return null;
      }
    };
    const pending = mutationChain.current.then(run, run);
    mutationChain.current = pending.catch(() => {});
    return pending;
  }, [absorb]);

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
  const reorder = (next) => {
    if (selectedDay && next.some((stop, index) => stop.id !== stops[index]?.id)) mutate([{ type: 'reorder_stops', dayId: selectedDay.id, stopIds: next.map((stop) => stop.id) }]);
  };
  const remove = (stop) => Alert.alert('להסיר את העצירה?', stop.title, [
    { text: 'ביטול', style: 'cancel' },
    { text: 'הסרה', style: 'destructive', onPress: () => mutate([{ type: 'delete_stop', dayId: selectedDay.id, stopId: stop.id }]) },
  ]);
  const moveStop = (targetDayId) => {
    const stop = movingStop;
    setMovingStop(null);
    if (stop && targetDayId !== selectedDay?.id) mutate([{ type: 'move_stop', dayId: selectedDay.id, targetDayId, stopId: stop.id }]);
  };
  const openDiscovery = () => navigation.navigate('TripDiscovery', { tripId, dayId: selectedDay.id });
  const openCustom = (stop) => navigation.navigate('TripCustomStop', { tripId, dayId: selectedDay.id, stopId: stop?.id, revision: tripRef.current?.revision });
  const retryMap = () => { setMapFailed(false); setMapReady(false); setMapKey((current) => current + 1); };
  const closeExpandedMap = () => { setMapExpanded(false); setMapReady(true); setMapFailed(false); };
  const recoverCorruptQueue = async () => {
    setSaveStatus('saving');
    try {
      await quarantineTripOperationQueue(tripId);
    } catch {
      setSaveStatus('error');
      setBanner({ kind: 'queue-corrupt', text: 'לא הצלחנו לשמור עותק של השינוי המקומי. הוא נשאר במכשיר ולא נמחק; נסו שוב.' });
      return;
    }
    offlineChanges.current = false;
    tripRef.current = null;
    setTrip(null);
    setTitle('');
    setLoading(true);
    try {
      absorb(await getPrivateTrip(tripId));
      setSaveStatus('saved');
      setBanner(null);
    } catch {
      setSaveStatus('saved');
      setBanner({ kind: 'refresh', text: 'העותק המקומי נשמר בבטחה, אבל לא הצלחנו לטעון את גרסת השרת. נסו שוב כשהחיבור יחזור.' });
    } finally { setLoading(false); }
  };

  if (!tripId) return <View style={styles.fullScreen} />;
  if (loading && !trip) return <View style={styles.fullScreen}><StatusBar barStyle="dark-content" /><View style={styles.loadingOverlay}><ActivityIndicator size="large" color={colors.primary} /><AppText style={styles.loadingText}>טוענים את הטיול…</AppText></View></View>;
  if (!trip) return <View style={styles.fullScreen}><View style={styles.empty}><Ionicons name="cloud-offline-outline" size={42} color={colors.primary} /><AppText style={styles.emptyTitle}>לא הצלחנו לפתוח את הטיול</AppText><AppText style={styles.emptyText}>{banner?.text}</AppText><TouchableOpacity style={[styles.primaryButton, { marginTop: 18 }]} onPress={() => load()} accessibilityRole="button"><AppText style={styles.primaryButtonText}>ניסיון נוסף</AppText></TouchableOpacity><TouchableOpacity style={[styles.secondaryButton, { marginTop: 8 }]} onPress={() => navigation.replace('MyTrips')} accessibilityRole="button"><AppText style={styles.secondaryButtonText}>הטיולים שלי</AppText></TouchableOpacity></View></View>;

  const renderMap = (expanded = false) => (
    <View style={expanded ? styles.mapFullScreen : styles.editorMapCard}>
      <TripPlannerMap key={`${mapKey}-${selectedDayId}-${expanded}`} stops={stops} route={routeData} selectedStopId={selectedStopId} onSelectStop={setSelectedStopId} onReady={() => { setMapReady(true); setMapFailed(false); }} />
      {!mapReady && !mapFailed ? <View style={[styles.editorMapHint, styles.editorMapStatusOverlay]} testID="trip-map-loading"><ActivityIndicator color={colors.primary} /><AppText style={styles.editorMapHintText}>טוענים את המפה…</AppText></View> : null}
      {mapFailed ? <View style={[styles.editorMapHint, styles.editorMapStatusOverlay]} testID="trip-map-error"><Ionicons name="map-outline" size={28} color={colors.primary} /><AppText style={styles.editorMapHintText}>המפה לא נטענה. העצירות עדיין זמינות ברשימה.</AppText><TouchableOpacity style={styles.secondaryButton} onPress={retryMap} accessibilityRole="button" testID="trip-map-retry"><AppText style={styles.secondaryButtonText}>טעינה מחדש של המפה</AppText></TouchableOpacity></View> : null}
      {!expanded && mapReady && !mapFailed ? <TouchableOpacity style={styles.editorMapOverlay} onPress={() => { setMapReady(false); setMapExpanded(true); }} accessibilityRole="button" accessibilityLabel="מפה במסך מלא"><Ionicons name="expand-outline" size={18} color={colors.primary} /><AppText style={styles.stopDetailText}>מפה מלאה</AppText></TouchableOpacity> : null}
    </View>
  );

  return (
    <View style={styles.editorScreen} testID="trip-planner-screen">
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />
      <View style={[styles.editorHeader, { paddingTop: Math.max(insets.top, 8) }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.iconButton} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="חזרה לטיולים שלי"><Ionicons name="arrow-forward" size={22} color={colors.primary} /></TouchableOpacity>
          <View style={styles.headerCopy}><AppTextInput value={title} onChangeText={setTitle} onBlur={saveTitle} maxLength={120} selectTextOnFocus style={styles.headerTitle} accessibilityLabel="שם הטיול" /><AppText style={styles.headerSubtitle}>פרטי · {actualStopCount} עצירות</AppText></View>
          <TouchableOpacity style={[styles.iconButton, styles.iconButtonPrimary]} onPress={() => setShareVisible(true)} accessibilityRole="button" accessibilityLabel="שיתוף פרטי"><Ionicons name="share-outline" size={21} color={colors.primary} /></TouchableOpacity>
          <TouchableOpacity style={styles.iconButton} onPress={() => navigation.navigate('MyTrips')} accessibilityRole="button" accessibilityLabel="הטיולים שלי"><Ionicons name="albums-outline" size={21} color={colors.primary} /></TouchableOpacity>
        </View>
        <AppText style={styles.editorStatus} accessibilityLiveRegion="polite">{saveStatus === 'saving' ? 'שומר את השינויים…' : saveStatus === 'offline' ? 'שמור במכשיר · ממתין לסנכרון' : saveStatus === 'error' ? 'לא נשמר · בדקו את ההודעה' : 'כל השינויים נשמרו'}</AppText>
      </View>
      {banner?.kind === 'queue-corrupt' ? <View style={[styles.conflictCard, { margin: 10 }]} accessibilityRole="alert"><AppText style={styles.errorText}>{banner.text}</AppText><View style={{ flexDirection: 'row-reverse', gap: 8 }}><TouchableOpacity style={[styles.primaryButton, { flex: 1 }]} onPress={recoverCorruptQueue} accessibilityRole="button" accessibilityLabel="שמירת עותק מקומי והמשך מגרסת השרת"><AppText style={styles.primaryButtonText}>שמירת עותק והמשך</AppText></TouchableOpacity><TouchableOpacity style={[styles.secondaryButton, { flex: 1 }]} onPress={() => load({ quiet: true })} accessibilityRole="button" accessibilityLabel="ניסיון נוסף לקריאת השינויים המקומיים"><AppText style={styles.secondaryButtonText}>ניסיון נוסף</AppText></TouchableOpacity></View></View> : banner ? <View style={[styles.banner, { position: 'relative', top: 0, left: 0, right: 0, margin: 10 }, banner.kind === 'offline' && styles.bannerOffline]}><Ionicons name={banner.kind === 'offline' ? 'cloud-offline-outline' : 'information-circle-outline'} size={20} color={colors.primary} /><AppText style={styles.bannerText}>{banner.text}</AppText>{banner.kind === 'offline' || banner.kind === 'refresh' ? <TouchableOpacity onPress={() => load({ quiet: true })} style={styles.stopDetailButton} accessibilityRole="button" accessibilityLabel={banner.kind === 'offline' ? 'ניסיון סנכרון' : 'טעינה מחדש של הטיול'}><Ionicons name="refresh" size={18} color={colors.primary} /></TouchableOpacity> : null}<TouchableOpacity onPress={() => setBanner(null)} style={styles.iconButton} accessibilityRole="button" accessibilityLabel="סגירה"><Ionicons name="close" size={18} color={colors.primary} /></TouchableOpacity></View> : null}
      {graphMismatch ? <TouchableOpacity style={styles.conflictCard} onPress={() => load({ quiet: true })} accessibilityRole="button" accessibilityLabel="טעינה מחדש של עצירות הטיול"><AppText style={styles.errorText}>מספר העצירות לא תואם לרשימה. לחצו לטעינה מחדש.</AppText></TouchableOpacity> : null}
      <View style={styles.editorBody}>
        <TripDayTabs trip={trip} selectedDayId={selectedDayId} onSelect={(id) => { setSelectedDayId(id); setSelectedStopId(''); }} onAddDay={addDay} />
        <View style={styles.summary}><View><AppText style={styles.summaryTitle}>{selectedDay?.kind === 'ideas' ? 'רעיונות לטיול' : selectedDay?.title}</AppText><AppText style={styles.summaryMeta}>{stops.length} עצירות{routeSummary(routeData) ? ` · ${routeSummary(routeData)}` : ''}</AppText></View>{selectedDay?.kind === 'day' ? <View style={styles.modeToggle}>{['DRIVE', 'WALK'].map((mode) => <TouchableOpacity key={mode} style={[styles.modeButton, selectedDay.travelMode === mode && styles.modeButtonSelected]} onPress={() => mutate([{ type: 'update_day', dayId: selectedDay.id, travelMode: mode }])} accessibilityRole="button" accessibilityLabel={mode === 'DRIVE' ? 'רכב' : 'הליכה'} accessibilityState={{ selected: selectedDay.travelMode === mode }}><Ionicons name={mode === 'DRIVE' ? 'car-outline' : 'walk-outline'} size={17} color={colors.primary} /><AppText style={styles.modeText}>{mode === 'DRIVE' ? 'רכב' : 'הליכה'}</AppText></TouchableOpacity>)}</View> : null}</View>
        {locatedStops.length ? renderMap() : <View style={styles.editorMapCard}><View style={styles.editorMapHint}><Ionicons name="map-outline" size={26} color={colors.primary} /><AppText style={styles.editorMapHintText}>{stops.length ? 'לעצירות האלה אין עדיין מיקום במפה' : 'הוסיפו עצירה כדי לראות את המסלול על המפה'}</AppText></View></View>}
        {conflict ? <View style={[styles.conflictCard, { margin: 14 }]}><AppText style={styles.errorText}>{conflict.message}</AppText><View style={{ flexDirection: 'row-reverse', gap: 8 }}><TouchableOpacity style={[styles.primaryButton, { flex: 1 }]} onPress={() => { const retry = conflict.operations; setConflict(null); mutate(retry); }} accessibilityRole="button"><AppText style={styles.primaryButtonText}>ניסיון חוזר</AppText></TouchableOpacity><TouchableOpacity style={[styles.secondaryButton, { flex: 1 }]} onPress={() => setConflict(null)} accessibilityRole="button"><AppText style={styles.secondaryButtonText}>השארת העדכני</AppText></TouchableOpacity></View></View> : null}
        {stops.length ? <TripStopList stops={stops} selectedStopId={selectedStopId} onSelect={(id) => setSelectedStopId((current) => current === id ? '' : id)} onReorder={reorder} onDelete={remove} onMoveToDay={setMovingStop} onOpenRecommendation={(stop) => navigation.navigate('RecommendationDetail', { postId: stop.recommendationId })} onEditCustom={openCustom} /> : <View style={[styles.empty, { flex: 1 }]}><View style={styles.emptyIcon}><Ionicons name="map-outline" size={30} color={colors.accentAction} /></View><AppText style={styles.emptyTitle}>{selectedDay?.kind === 'ideas' ? 'אוספים רעיונות לטיול' : 'היום הזה מחכה לעצירה הראשונה'}</AppText><AppText style={styles.emptyText}>בחרו המלצה שמורה או הוסיפו מקום משלכם.</AppText></View>}
      </View>
      <View style={[styles.editorFooter, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <TouchableOpacity style={[styles.editorAction, styles.editorActionPrimary]} onPress={openDiscovery} accessibilityRole="button" accessibilityLabel="בחירת המלצות" testID="trip-add-recommendations"><Ionicons name="sparkles-outline" size={20} color="#FFFFFF" /><AppText style={styles.editorActionText}>בחירת המלצות</AppText></TouchableOpacity>
        <TouchableOpacity style={styles.editorAction} onPress={() => openCustom()} accessibilityRole="button" accessibilityLabel="עצירה משלי" testID="trip-add-custom-stop"><Ionicons name="add-circle-outline" size={20} color="#FFFFFF" /><AppText style={styles.editorActionText}>עצירה משלי</AppText></TouchableOpacity>
      </View>
      <TripShareModal visible={shareVisible} trip={trip} onClose={() => setShareVisible(false)} onChanged={(shareActive) => absorb({ ...tripRef.current, shareActive })} />
      <Modal visible={mapExpanded} animationType="slide" onRequestClose={closeExpandedMap}>
        <View style={styles.mapFullScreen}>{locatedStops.length ? renderMap(true) : null}<View style={[styles.mapFullHeader, { paddingTop: Math.max(insets.top, 8) }]}><View style={styles.headerRow}><TouchableOpacity style={styles.iconButton} onPress={closeExpandedMap} accessibilityRole="button" accessibilityLabel="חזרה לרשימת העצירות"><Ionicons name="close" size={22} color={colors.primary} /></TouchableOpacity><AppText style={styles.pageHeaderTitle}>{selectedDay?.title || 'מפת הטיול'}</AppText></View></View>{selectedStop ? <TouchableOpacity style={styles.mapFullDetails} onPress={closeExpandedMap} accessibilityRole="button"><AppText style={styles.stopTitle}>{selectedStop.title}</AppText><AppText style={styles.stopSubtitle}>חזרה לרשימה ולפרטי העצירה ←</AppText></TouchableOpacity> : null}</View>
      </Modal>
      <Modal transparent visible={Boolean(movingStop)} animationType="fade" onRequestClose={() => setMovingStop(null)}><TouchableOpacity activeOpacity={1} style={styles.modalBackdrop} onPress={() => setMovingStop(null)}><View style={styles.modalSheet} accessibilityViewIsModal><AppText style={styles.modalTitle}>לאיזה יום להעביר?</AppText><AppText style={styles.modalText}>{movingStop?.title}</AppText>{(trip.days || []).filter((day) => day.id !== selectedDay?.id).sort((a, b) => a.order - b.order).map((day) => <TouchableOpacity key={day.id} onPress={() => moveStop(day.id)} style={styles.tripCard} accessibilityRole="button"><AppText style={styles.tripCardTitle}>{day.kind === 'ideas' ? 'רעיונות' : day.title}</AppText><AppText style={styles.tripCardMeta}>{day.stops?.length ?? day.stopCount ?? 0} עצירות</AppText></TouchableOpacity>)}</View></TouchableOpacity></Modal>
    </View>
  );
}
