import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AppText from '../../../components/AppText';
import { colors, tripPlannerStyles as styles } from '../../../styles';
import { applyPrivateTripOperations, createPrivateTrip, listMyTrips, tripErrorMessage } from '../../../services/TripService';

export default function AddToTripModal({ visible, recommendationId, onClose, onAdded }) {
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const load = async () => {
    setLoading(true); setError('');
    try { setTrips((await listMyTrips(30)).items || []); }
    catch (cause) { setError(tripErrorMessage(cause, 'לא הצלחנו לטעון את הטיולים שלך.')); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (visible && recommendationId) load(); }, [visible, recommendationId]);
  const add = async (trip) => {
    setBusyId(trip.id); setError('');
    try {
      await applyPrivateTripOperations({ tripId: trip.id, expectedRevision: trip.revision, operations: [{ type: 'add_recommendation_stops', dayId: trip.ideasDayId, recommendationIds: [recommendationId] }] });
      onAdded?.(trip.id); onClose();
    } catch (cause) { setError(tripErrorMessage(cause)); }
    finally { setBusyId(''); }
  };
  const create = async () => {
    setBusyId('new'); setError('');
    try { const result = await createPrivateTrip({ seedRecommendationId: recommendationId }); onAdded?.(result.tripId); onClose(); }
    catch (cause) { setError(tripErrorMessage(cause, 'לא הצלחנו ליצור טיול חדש.')); }
    finally { setBusyId(''); }
  };
  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity activeOpacity={1} style={styles.modalBackdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="סגירת בחירת טיול">
        <TouchableOpacity activeOpacity={1} style={styles.modalSheet} onPress={() => {}} accessibilityViewIsModal>
          <View style={styles.headerRow}>
            <View style={styles.headerCopy}><AppText style={styles.modalTitle}>לאיזה טיול להוסיף?</AppText><AppText style={styles.modalText}>ההמלצה תיכנס לרעיונות ותוכלו לגרור אותה ליום המתאים.</AppText></View>
            <TouchableOpacity style={styles.iconButton} onPress={onClose} accessibilityRole="button" accessibilityLabel="סגירה"><Ionicons name="close" size={22} color={colors.primary} /></TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.primaryButton} onPress={create} disabled={!!busyId} accessibilityRole="button">
            {busyId === 'new' ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="add" size={20} color="#FFFFFF" />}
            <AppText style={styles.primaryButtonText}>טיול חדש מההמלצה הזו</AppText>
          </TouchableOpacity>
          {!!error && <AppText style={styles.errorText}>{error}</AppText>}
          {loading ? <ActivityIndicator color={colors.primary} /> : (
            <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ gap: 8 }}>
              {trips.map((trip) => (
                <TouchableOpacity key={trip.id} style={styles.tripCard} onPress={() => add(trip)} disabled={!!busyId} accessibilityRole="button" accessibilityLabel={`הוספה אל ${trip.title}`}>
                  <View style={styles.tripCardHeader}>
                    <View style={styles.tripCardIcon}>{busyId === trip.id ? <ActivityIndicator color={colors.primary} /> : <Ionicons name="map-outline" size={23} color={colors.primary} />}</View>
                    <View style={styles.tripCardCopy}><AppText style={styles.tripCardTitle}>{trip.title}</AppText><AppText style={styles.tripCardMeta}>{trip.dayCount} ימים · {trip.stopCount} עצירות</AppText></View>
                    <Ionicons name="add-circle" size={27} color={colors.accentAction} />
                  </View>
                </TouchableOpacity>
              ))}
              {!trips.length && !error ? <AppText style={styles.modalText}>עדיין אין טיולים. התחילו אחד חדש למעלה.</AppText> : null}
            </ScrollView>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}
