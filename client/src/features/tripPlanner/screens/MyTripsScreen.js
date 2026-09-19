import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StatusBar, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';

import AppText from '../../../components/AppText';
import { colors, tripPlannerStyles as styles } from '../../../styles';
import { createPrivateTrip, deletePrivateTrip, isOfflineTripError, listMyTrips, tripErrorMessage } from '../../../services/TripService';

export default function MyTripsScreen({ navigation }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef(0);

  const load = useCallback(async ({ refresh = false } = {}) => {
    const currentRequest = ++requestId.current;
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const result = await listMyTrips(50);
      if (requestId.current === currentRequest) setItems(result.items || []);
    } catch (cause) {
      if (requestId.current === currentRequest) setError(tripErrorMessage(cause, 'לא הצלחנו לטעון את הטיולים.'));
    } finally {
      if (requestId.current === currentRequest) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);
  useFocusEffect(useCallback(() => {
    load();
    return () => { requestId.current += 1; };
  }, [load]));

  const create = async () => {
    if (creating) return;
    setCreating(true);
    setError('');
    try {
      const result = await createPrivateTrip();
      navigation.navigate('TripPlanner', { tripId: result.tripId });
    } catch (cause) {
      setError(isOfflineTripError(cause)
        ? 'לא התקבל אישור ליצירת הטיול. רעננו את הרשימה ובדקו אם הוא מופיע לפני ניסיון נוסף.'
        : tripErrorMessage(cause, 'לא הצלחנו ליצור טיול חדש.'));
    } finally {
      setCreating(false);
    }
  };

  const remove = (trip) => Alert.alert('למחוק את הטיול?', 'הטיול וכל העצירות שבו יימחקו לצמיתות.', [
    { text: 'ביטול', style: 'cancel' },
    { text: 'מחיקה', style: 'destructive', onPress: async () => {
      try {
        await deletePrivateTrip(trip.id);
        setItems((current) => current.filter((item) => item.id !== trip.id));
      } catch (cause) { setError(tripErrorMessage(cause, 'לא הצלחנו למחוק את הטיול.')); }
    } },
  ]);

  const latest = items[0];
  return (
    <SafeAreaView style={styles.fullScreen} edges={['top', 'left', 'right', 'bottom']}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.pageHeader}>
        <TouchableOpacity style={styles.iconButton} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="חזרה"><Ionicons name="arrow-forward" size={22} color={colors.primary} /></TouchableOpacity>
        <AppText style={styles.pageHeaderTitle}>הטיולים שלי</AppText>
        <TouchableOpacity style={[styles.iconButton, styles.iconButtonPrimary]} onPress={create} disabled={creating} accessibilityRole="button" accessibilityLabel="טיול חדש" testID="my-trips-create"><Ionicons name="add" size={24} color={colors.primary} /></TouchableOpacity>
      </View>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load({ refresh: true })} />} contentContainerStyle={styles.pageContent}>
        <AppText style={styles.modalText}>כל הטיולים הפרטיים שלכם, גם אלה שעדיין בתכנון.</AppText>
        {!!error && <View style={styles.conflictCard} accessibilityRole="alert"><AppText style={styles.errorText}>{error}</AppText><TouchableOpacity style={styles.secondaryButton} onPress={() => load()} accessibilityRole="button" accessibilityLabel="טעינה מחדש של הטיולים"><AppText style={styles.secondaryButtonText}>ניסיון נוסף</AppText></TouchableOpacity></View>}
        {loading && !items.length ? <ActivityIndicator size="large" color={colors.primary} /> : null}
        {latest ? <TouchableOpacity style={styles.resumeCard} onPress={() => navigation.navigate('TripPlanner', { tripId: latest.id })} accessibilityRole="button" accessibilityLabel={`המשך תכנון ${latest.title}`} testID="my-trips-resume"><Ionicons name="navigate-outline" size={22} color={colors.primary} /><View style={{ flex: 1 }}><AppText style={styles.stopTitle}>ממשיכים לתכנן?</AppText><AppText style={styles.tripCardMeta} numberOfLines={1}>{latest.title}</AppText></View><Ionicons name="arrow-back" size={20} color={colors.primary} /></TouchableOpacity> : null}
        {items.map((trip) => (
          <TouchableOpacity key={trip.id} style={styles.tripCard} onPress={() => navigation.navigate('TripPlanner', { tripId: trip.id })} accessibilityRole="button" accessibilityLabel={`המשך תכנון ${trip.title}`} testID={`my-trip-${trip.id}`}>
            <View style={styles.tripCardHeader}><View style={styles.tripCardIcon}><Ionicons name="map-outline" size={24} color={colors.primary} /></View><View style={styles.tripCardCopy}><AppText style={styles.tripCardTitle}>{trip.title}</AppText><AppText style={styles.tripCardMeta}>{trip.dayCount} ימים · {trip.stopCount} עצירות{trip.shareActive ? ' · משותף בקישור' : ''}</AppText></View><Ionicons name="chevron-back" size={21} color={colors.primary} /></View>
            <View style={styles.tripCardFooter}><AppText style={styles.resumeLink}>המשך תכנון ←</AppText><TouchableOpacity style={styles.deleteButton} onPress={(event) => { event?.stopPropagation?.(); remove(trip); }} accessibilityRole="button" accessibilityLabel={`מחיקת ${trip.title}`}><Ionicons name="trash-outline" size={18} color={colors.error} /></TouchableOpacity></View>
          </TouchableOpacity>
        ))}
        {!loading && !error && !items.length ? <View style={styles.empty}><View style={styles.emptyIcon}><Ionicons name="map-outline" size={31} color={colors.accentAction} /></View><AppText style={styles.emptyTitle}>הטיול הבא מתחיל כאן</AppText><AppText style={styles.emptyText}>בנו מסלול מהמלצות PlanLi ומהעצירות שלכם.</AppText><TouchableOpacity style={[styles.primaryButton, { marginTop: 18 }]} onPress={create} disabled={creating} accessibilityRole="button"><AppText style={styles.primaryButtonText}>יצירת הטיול הראשון</AppText></TouchableOpacity></View> : null}
      </ScrollView>
    </SafeAreaView>
  );
}
