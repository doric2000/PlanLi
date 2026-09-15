import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StatusBar, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppText from '../../../components/AppText';
import { colors, tripPlannerStyles as styles } from '../../../styles';
import { copySharedTrip, getSharedTrip, tripErrorMessage } from '../../../services/TripService';
import TripDayTabs from '../components/TripDayTabs';
import TripPlannerMap from '../components/TripPlannerMap';
import TripPlannerSheet from '../components/TripPlannerSheet';
import TripStopList from '../components/TripStopList';
import { getDay, orderedStops } from '../utils/tripPlannerModel';

export default function SharedTripScreen({ navigation, route }) {
  const insets = useSafeAreaInsets(); const token = route.params?.token || ''; const [trip, setTrip] = useState(null); const [dayId, setDayId] = useState(''); const [loading, setLoading] = useState(true); const [copying, setCopying] = useState(false); const [error, setError] = useState('');
  useEffect(() => { setLoading(true); getSharedTrip(token).then((value) => { setTrip(value); setDayId(value.days?.find((day) => day.kind === 'day')?.id || value.ideasDayId); }).catch((cause) => setError(tripErrorMessage(cause, 'הקישור אינו זמין יותר.'))).finally(() => setLoading(false)); }, [token]);
  const day = useMemo(() => getDay(trip, dayId), [dayId, trip]); const stops = useMemo(() => orderedStops(day), [day]);
  const copy = async () => { setCopying(true); setError(''); try { const result = await copySharedTrip(token); navigation.replace('TripPlanner', { tripId: result.tripId }); } catch (cause) { setError(tripErrorMessage(cause, 'לא הצלחנו ליצור עותק.')); } finally { setCopying(false); } };
  if (loading || !trip) return <View style={styles.fullScreen}><StatusBar barStyle="dark-content" /><View style={styles.loadingOverlay}>{loading ? <ActivityIndicator size="large" color={colors.primary} /> : <Ionicons name="link-outline" size={42} color={colors.primary} />}<AppText style={error ? styles.errorText : styles.loadingText}>{error || 'טוענים את הטיול המשותף…'}</AppText>{!loading && <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.goBack()}><AppText style={styles.secondaryButtonText}>חזרה</AppText></TouchableOpacity>}</View></View>;
  return <View style={styles.screen}><StatusBar barStyle="dark-content" translucent backgroundColor="transparent" /><TripPlannerMap stops={stops} /><View style={[styles.header, { paddingTop: Math.max(insets.top, 8) }]}><View style={styles.headerRow}><TouchableOpacity style={styles.iconButton} onPress={() => navigation.goBack()} accessibilityLabel="חזרה"><Ionicons name="arrow-forward" size={22} color={colors.primary} /></TouchableOpacity><View style={styles.headerCopy}><AppText style={styles.headerTitle}>{trip.title}</AppText><AppText style={styles.headerSubtitle}>מסלול פרטי של {trip.shared?.owner?.displayName || 'מטייל/ת'}</AppText></View><View style={styles.readOnlyBadge}><AppText style={styles.readOnlyText}>צפייה בלבד</AppText></View></View></View><TripPlannerSheet><TripDayTabs trip={trip} selectedDayId={dayId} onSelect={setDayId} readOnly /><View style={styles.summary}><View><AppText style={styles.summaryTitle}>{day?.kind === 'ideas' ? 'רעיונות' : day?.title}</AppText><AppText style={styles.summaryMeta}>{stops.length} עצירות</AppText></View><TouchableOpacity onPress={copy} disabled={copying} style={[styles.primaryButton, { minHeight: 44 }]}>{copying ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="copy-outline" size={18} color="#FFFFFF" />}<AppText style={styles.primaryButtonText}>יצירת עותק</AppText></TouchableOpacity></View>{stops.length ? <TripStopList stops={stops} readOnly /> : <View style={styles.empty}><AppText style={styles.emptyTitle}>אין עצירות ביום הזה</AppText></View>}</TripPlannerSheet></View>;
}
