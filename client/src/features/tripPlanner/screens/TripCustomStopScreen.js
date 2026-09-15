import React, { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StatusBar, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import uuid from 'react-native-uuid';

import AppText from '../../../components/AppText';
import AppTextInput from '../../../components/AppTextInput';
import ExactLocationPicker from '../../../components/ExactLocationPicker';
import { colors, tripPlannerStyles as styles } from '../../../styles';
import { applyPrivateTripOperations, cacheTrip, isOfflineTripError, loadCachedTrip, queueTripOperations, tripErrorMessage } from '../../../services/TripService';
import TripPlannerMap from '../components/TripPlannerMap';
import { applyOperationsLocally } from '../utils/tripPlannerModel';

const MODES = [
  { id: 'exact', label: 'חיפוש מקום', icon: 'search-outline' },
  { id: 'pin', label: 'סימון במפה', icon: 'pin-outline' },
  { id: 'general', label: 'רעיון כללי', icon: 'bulb-outline' },
];

export default function TripCustomStopScreen({ navigation, route }) {
  const { tripId, dayId, revision } = route.params;
  const [mode, setMode] = useState('exact');
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [note, setNote] = useState('');
  const [exactValue, setExactValue] = useState(null);
  const [pin, setPin] = useState({ latitude: 31.7683, longitude: 35.2137 });
  const [resolving, setResolving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const coordinates = useMemo(() => {
    if (mode === 'pin') return { lat: pin.latitude, lng: pin.longitude };
    const raw = exactValue?.place?.coordinates;
    const lat = Number(raw?.lat ?? raw?.latitude); const lng = Number(raw?.lng ?? raw?.longitude);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  }, [exactValue, mode, pin]);
  const resolvedTitle = title.trim() || (mode === 'exact' ? exactValue?.place?.name : '') || '';
  const valid = resolvedTitle && (mode === 'general' || coordinates) && !resolving;
  const save = async () => {
    if (!valid || saving) return;
    const clientId = `stop-${uuid.v4()}`;
    const operation = { type: 'add_custom_stop', dayId, clientId, stop: { title: resolvedTitle, subtitle: subtitle.trim() || exactValue?.place?.address || '', note: note.trim(), locationMode: mode, coordinates: mode === 'general' ? null : coordinates, ...(exactValue?.place?.placeId ? { placeId: exactValue.place.placeId } : {}) } };
    setSaving(true); setError('');
    try {
      await applyPrivateTripOperations({ tripId, expectedRevision: revision, operations: [operation] });
      navigation.goBack();
    } catch (cause) {
      if (isOfflineTripError(cause)) {
        await queueTripOperations({ tripId, expectedRevision: revision, operations: [operation] });
        const cached = await loadCachedTrip(tripId);
        if (cached) await cacheTrip(applyOperationsLocally(cached, [operation]));
        navigation.goBack();
      } else setError(tripErrorMessage(cause));
    } finally { setSaving(false); }
  };
  const pinStop = [{ id: 'draft', title: resolvedTitle || 'העצירה שלי', coordinates: { lat: pin.latitude, lng: pin.longitude }, sourceType: 'custom' }];
  return (
    <SafeAreaView style={styles.fullScreen} edges={['top', 'left', 'right', 'bottom']}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.pageHeader}><TouchableOpacity style={styles.iconButton} onPress={() => navigation.goBack()} accessibilityLabel="חזרה"><Ionicons name="arrow-forward" size={22} color={colors.primary} /></TouchableOpacity><AppText style={styles.pageHeaderTitle}>עצירה משלי</AppText></View>
      <ScrollView contentContainerStyle={styles.pageContent} keyboardShouldPersistTaps="handled">
        <View style={styles.filterRow}>{MODES.map((item) => { const active = item.id === mode; return <TouchableOpacity key={item.id} onPress={() => { setMode(item.id); setError(''); }} style={[styles.filterChip, active && styles.filterChipSelected]} accessibilityRole="button" accessibilityState={{ selected: active }}><Ionicons name={item.icon} size={17} color={colors.primary} /><AppText style={styles.filterText}>{item.label}</AppText></TouchableOpacity>; })}</View>
        {mode === 'exact' ? <View style={styles.formCard}><ExactLocationPicker value={exactValue} onChange={(value) => { setExactValue(value); if (value?.place?.name) setTitle(value.place.name); }} label="איזה מקום תרצו להוסיף?" placeholder="חפשו שם של מקום…" onResolvingChange={setResolving} /></View> : null}
        {mode === 'pin' ? <View style={[styles.discoveryMap, { height: 280 }]}><TripPlannerMap stops={pinStop} onMapPress={(point) => point && setPin(point)} style={{ position: 'absolute' }} /><View pointerEvents="none" style={{ position: 'absolute', bottom: 12, alignSelf: 'center', backgroundColor: 'rgba(255,255,255,0.94)', borderRadius: 999, paddingHorizontal: 13, paddingVertical: 8 }}><AppText style={styles.webMapNoteText}>לחצו במפה כדי להזיז את הסיכה</AppText></View></View> : null}
        {mode === 'general' ? <View style={styles.conflictCard}><AppText style={styles.modalText}>רעיון כללי לא יוצג על המפה ולא ישפיע על הניווט, אבל יישאר ברשימת העצירות.</AppText></View> : null}
        <View style={styles.formCard}>
          <AppText style={styles.label}>שם העצירה</AppText><AppTextInput value={title} onChangeText={setTitle} maxLength={120} placeholder={mode === 'general' ? 'למשל: הפסקת קפה בדרך' : 'שם שיופיע במסלול'} style={styles.input} />
          <AppText style={styles.label}>כתובת או תיאור קצר</AppText><AppTextInput value={subtitle} onChangeText={setSubtitle} maxLength={240} placeholder="אופציונלי" style={styles.input} />
          <AppText style={styles.label}>הערה לעצמי</AppText><AppTextInput value={note} onChangeText={setNote} maxLength={500} placeholder="שעות, הזמנה, מה לא לשכוח…" multiline style={[styles.input, styles.textarea]} />
        </View>
        {!!error && <AppText style={styles.errorText}>{error}</AppText>}
        <TouchableOpacity onPress={save} disabled={!valid || saving} style={[styles.primaryButton, (!valid || saving) && styles.primaryButtonDisabled]} accessibilityRole="button">
          {saving ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="add-circle-outline" size={21} color="#FFFFFF" />}<AppText style={styles.primaryButtonText}>הוספה לטיול</AppText>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
