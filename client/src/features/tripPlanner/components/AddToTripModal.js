import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

import AppText from '../../../components/AppText';
import { colors, tripPlannerStyles as styles } from '../../../styles';
import { applyPrivateTripOperations, cacheTrip, createPrivateTrip, getPrivateTrip, hasQueuedTripOperations, isOfflineTripError, listMyTrips, loadCachedTrip, operationId, queueTripOperations, tripErrorMessage } from '../../../services/TripService';
import { applyOperationsLocally, orderedDays } from '../utils/tripPlannerModel';

export default function AddToTripModal({ visible, recommendationId, onClose, onAdded }) {
  const navigation = useNavigation();
  const [trips, setTrips] = useState([]);
  const [chosenTrip, setChosenTrip] = useState(null);
  const [targetDayId, setTargetDayId] = useState('');
  const [addedTripId, setAddedTripId] = useState('');
  const [queued, setQueued] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingTrip, setLoadingTrip] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const addAttempt = useRef(null);

  const load = async () => {
    setLoading(true); setError('');
    try { setTrips((await listMyTrips(50)).items || []); }
    catch (cause) { setError(tripErrorMessage(cause, 'לא הצלחנו לטעון את הטיולים שלך.')); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    if (!visible || !recommendationId) return;
    setChosenTrip(null); setTargetDayId(''); setAddedTripId(''); setQueued(false);
    load();
  }, [visible, recommendationId]);

  const selectTrip = async (tripId) => {
    setLoadingTrip(true); setError('');
    try {
      const pending = await hasQueuedTripOperations(tripId);
      const cached = await loadCachedTrip(tripId);
      const trip = pending && cached ? cached : await getPrivateTrip(tripId, { cache: false }).catch((cause) => {
        if (cached) return cached;
        throw cause;
      });
      setChosenTrip(trip);
      setTargetDayId(trip.days?.find((day) => day.kind === 'day')?.id || trip.ideasDayId);
    } catch (cause) { setError(tripErrorMessage(cause, 'לא הצלחנו לפתוח את הטיול.')); }
    finally { setLoadingTrip(false); }
  };
  const alreadyAdded = chosenTrip?.days?.some((day) => day.stops?.some((stop) => stop.recommendationId === recommendationId));
  const add = async () => {
    if (!chosenTrip || !targetDayId || busy || alreadyAdded) return;
    setBusy(true); setError('');
    const operation = { type: 'add_recommendation_stops', dayId: targetDayId, recommendationIds: [recommendationId] };
    const fingerprint = JSON.stringify({ tripId: chosenTrip.id, operation });
    if (addAttempt.current?.fingerprint !== fingerprint) addAttempt.current = { fingerprint, id: operationId('add-recommendation') };
    const id = addAttempt.current.id;
    try {
      if (await hasQueuedTripOperations(chosenTrip.id)) throw Object.assign(new Error('Pending offline changes'), { code: 'functions/unavailable' });
      await applyPrivateTripOperations({ tripId: chosenTrip.id, expectedRevision: chosenTrip.revision, operations: [operation], id });
      setAddedTripId(chosenTrip.id);
      onAdded?.(chosenTrip.id);
    } catch (cause) {
      if (isOfflineTripError(cause)) {
        try {
          await cacheTrip(applyOperationsLocally(chosenTrip, [operation]));
          await queueTripOperations({ tripId: chosenTrip.id, expectedRevision: chosenTrip.revision, operations: [operation], id });
          setQueued(true);
          setAddedTripId(chosenTrip.id);
          onAdded?.(chosenTrip.id);
        } catch {
          await cacheTrip(chosenTrip).catch(() => {});
          setError('לא הצלחנו לשמור את ההמלצה במכשיר. נסו שוב כשהחיבור יחזור.');
        }
      } else {
        setError(tripErrorMessage(cause));
        try { setChosenTrip(await getPrivateTrip(chosenTrip.id, { cache: false })); } catch { /* Retain the selection for an explicit retry. */ }
      }
    } finally { setBusy(false); }
  };
  const create = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const result = await createPrivateTrip({ seedRecommendationId: recommendationId });
      try {
        await applyPrivateTripOperations({ tripId: result.tripId, expectedRevision: result.revision,
          operations: [{ type: 'move_stop', dayId: result.ideasDayId, targetDayId: result.firstDayId, stopId: result.seedStopId }] });
      } catch {
        setError('הטיול נוצר. ההמלצה נשמרה ברעיונות; אפשר להעביר אותה ליום הראשון מתוך הטיול.');
      }
      setAddedTripId(result.tripId);
      onAdded?.(result.tripId);
    } catch (cause) { setError(isOfflineTripError(cause)
      ? 'לא התקבל אישור ליצירת הטיול. חזרו לרשימת הטיולים ובדקו אם הוא מופיע לפני ניסיון נוסף.'
      : tripErrorMessage(cause, 'לא הצלחנו ליצור טיול חדש.')); }
    finally { setBusy(false); }
  };
  const viewTrip = () => {
    const id = addedTripId || (alreadyAdded ? chosenTrip?.id : '');
    if (!id) return;
    onClose();
    navigation.navigate('TripPlanner', { tripId: id });
  };

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity activeOpacity={1} style={styles.modalBackdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="סגירת בחירת טיול">
        <TouchableOpacity activeOpacity={1} style={styles.modalSheet} onPress={() => {}} accessibilityViewIsModal>
          <View style={styles.headerRow}><View style={styles.headerCopy}><AppText style={styles.modalTitle}>{addedTripId ? queued ? 'ההמלצה נשמרה במכשיר' : 'ההמלצה בטיול שלכם' : chosenTrip ? 'לאיזה יום להוסיף?' : 'לאיזה טיול להוסיף?'}</AppText><AppText style={styles.modalText}>{addedTripId ? queued ? 'ננסה לסנכרן אותה כשיחזור החיבור. אפשר לראות אותה כבר עכשיו בטיול.' : 'אפשר להמשיך לתכנן ולסדר את העצירות.' : chosenTrip ? chosenTrip.title : 'בחרו טיול קיים או התחילו טיול חדש.'}</AppText></View><TouchableOpacity style={styles.iconButton} onPress={onClose} accessibilityRole="button" accessibilityLabel="סגירה"><Ionicons name="close" size={22} color={colors.primary} /></TouchableOpacity></View>
          {!!error && <AppText style={styles.errorText} accessibilityRole="alert">{error}</AppText>}
          {addedTripId ? <TouchableOpacity style={styles.primaryButton} onPress={viewTrip} accessibilityRole="button" testID="add-to-trip-view"><AppText style={styles.primaryButtonText}>צפייה בטיול</AppText></TouchableOpacity> : chosenTrip ? <>
            <ScrollView style={{ maxHeight: 280 }} contentContainerStyle={{ gap: 8 }}>
              {orderedDays(chosenTrip).filter((day) => day.kind === 'day').map((day) => <TouchableOpacity key={day.id} style={[styles.dayChip, day.id === targetDayId && styles.dayChipSelected]} onPress={() => setTargetDayId(day.id)} accessibilityRole="button" accessibilityState={{ selected: day.id === targetDayId }}><AppText style={[styles.dayChipText, day.id === targetDayId && styles.dayChipTextSelected]}>{day.title} · {day.stops?.length || 0} עצירות</AppText></TouchableOpacity>)}
              <TouchableOpacity style={[styles.dayChip, chosenTrip.ideasDayId === targetDayId && styles.dayChipSelected]} onPress={() => setTargetDayId(chosenTrip.ideasDayId)} accessibilityRole="button" accessibilityState={{ selected: chosenTrip.ideasDayId === targetDayId }}><AppText style={[styles.dayChipText, chosenTrip.ideasDayId === targetDayId && styles.dayChipTextSelected]}>רעיונות · בלי לשבץ ליום</AppText></TouchableOpacity>
            </ScrollView>
            {alreadyAdded ? <TouchableOpacity style={styles.primaryButton} onPress={viewTrip} accessibilityRole="button"><AppText style={styles.primaryButtonText}>ההמלצה כבר בטיול · צפייה בטיול</AppText></TouchableOpacity> : <TouchableOpacity style={styles.primaryButton} onPress={add} disabled={busy} accessibilityRole="button" testID="add-to-trip-confirm">{busy ? <ActivityIndicator color="#FFFFFF" /> : <AppText style={styles.primaryButtonText}>הוספה אל {chosenTrip.days?.find((day) => day.id === targetDayId)?.title || 'רעיונות'}</AppText>}</TouchableOpacity>}
            <TouchableOpacity style={styles.secondaryButton} onPress={() => { setChosenTrip(null); setError(''); }} accessibilityRole="button"><AppText style={styles.secondaryButtonText}>בחירת טיול אחר</AppText></TouchableOpacity>
          </> : <>
            <TouchableOpacity style={styles.primaryButton} onPress={create} disabled={busy} accessibilityRole="button">{busy ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="add" size={20} color="#FFFFFF" />}<AppText style={styles.primaryButtonText}>טיול חדש מההמלצה הזו</AppText></TouchableOpacity>
            {loading ? <ActivityIndicator color={colors.primary} /> : <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ gap: 8 }}>
              {trips.map((trip) => <TouchableOpacity key={trip.id} style={styles.tripCard} onPress={() => selectTrip(trip.id)} disabled={busy || loadingTrip} accessibilityRole="button" accessibilityLabel={`בחירת ${trip.title}`}><View style={styles.tripCardHeader}><View style={styles.tripCardIcon}>{loadingTrip ? <ActivityIndicator color={colors.primary} /> : <Ionicons name="map-outline" size={23} color={colors.primary} />}</View><View style={styles.tripCardCopy}><AppText style={styles.tripCardTitle}>{trip.title}</AppText><AppText style={styles.tripCardMeta}>{trip.dayCount} ימים · {trip.stopCount} עצירות</AppText></View><Ionicons name="chevron-back" size={21} color={colors.primary} /></View></TouchableOpacity>)}
              {!trips.length && !error ? <AppText style={styles.modalText}>עדיין אין טיולים. התחילו אחד חדש למעלה.</AppText> : null}
            </ScrollView>}
            {!!error && <TouchableOpacity style={styles.secondaryButton} onPress={load} accessibilityRole="button"><AppText style={styles.secondaryButtonText}>טעינה מחדש</AppText></TouchableOpacity>}
          </>}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}
