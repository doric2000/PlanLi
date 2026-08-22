import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import AppText from '../../../components/AppText';
import ExactLocationPicker from '../../../components/ExactLocationPicker';
import { FormInput } from '../../../components/FormInput';
import ImageCropReviewModal from '../../../components/ImageCropReviewModal';
import { ImagePickerBox } from '../../../components/ImagePickerBox';
import UnsavedChangesModal from '../../../components/UnsavedChangesModal';
import { UNSAVED_LEAVE_MESSAGE, UNSAVED_LEAVE_TITLE } from '../../../constants/unsavedLeaveStrings';
import { ROUTE_IMAGE_LONG_EDGE, TRAVEL_IMAGE_COMPRESSION } from '../../../constants/travelMedia';
import useReviewedImagePicker from '../../../hooks/useReviewedImagePicker';
import { getPersonalizedRecommendations } from '../../../services/PersonalizationService';
import { getMediaVariantUrl } from '../../../utils/mediaAssets';
import { recommendationComposerStyles as composer, stopEditorModalStyles as styles } from '../../../styles';
import ManualMapPinPicker from '../../community/components/ManualMapPinPicker';
import SingleDestinationPicker from '../../community/components/SingleDestinationPicker';
import { getStopCoordinates } from '../utils/routeStops';

const createStopId = () => `stop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const LOCATION_MODES = { planli: 'planli', exact: 'exact', pin: 'pin', general: 'general' };

function normalizedDestination(value) {
  if (!value?.countryId || !value?.cityId) return null;
  return {
    key: value.key || `city:${value.countryId}:${value.cityId}`,
    kind: 'city',
    countryId: value.countryId,
    cityId: value.cityId,
    countryName: value.countryName || value.country || value.countryId,
    name: value.cityName || value.name || value.location || value.cityId,
    coordinates: value.coordinates || null,
    viewport: value.viewport || null,
    provider: value.provider || null,
    providerPlaceId: value.providerPlaceId || null,
    resolvedPlaceToken: value.resolvedPlaceToken || null,
  };
}

function destinationRef(value) {
  return {
    countryId: value.countryId,
    cityId: value.cityId,
    countryName: value.countryName,
    cityName: value.name,
    ...(value.providerPlaceId ? {
      provider: 'google',
      providerPlaceId: value.providerPlaceId,
      ...(value.resolvedPlaceToken ? { resolvedPlaceToken: value.resolvedPlaceToken } : {}),
    } : {}),
  };
}

function initialModeFor(stop) {
  if (stop?.source?.recommendationId) return LOCATION_MODES.planli;
  if (stop?.locationPrecision === 'general') return LOCATION_MODES.general;
  if (stop?.locationPrecision === 'pin' || (!stop?.place?.placeId && getStopCoordinates(stop))) return LOCATION_MODES.pin;
  return LOCATION_MODES.exact;
}

function buildStopComparable(value) {
  return JSON.stringify(value, (key, entry) => key === 'media' ? entry?.assetId || null : entry);
}

function FocusClearingFormInput({ placeholder, onFocus, onBlur, ...props }) {
  const [focused, setFocused] = useState(false);
  return <FormInput {...props} placeholder={focused ? '' : placeholder} onFocus={(event) => {
    setFocused(true); onFocus?.(event);
  }} onBlur={(event) => { setFocused(false); onBlur?.(event); }} />;
}

export default function StopEditorModal({
  visible, onClose, onSave, initialData, dayIndex, stopIndex,
  onPersistImage, onForgetImage, routeDestination, allowImages = true,
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [mode, setMode] = useState(LOCATION_MODES.exact);
  const [exactValue, setExactValue] = useState(null);
  const [destination, setDestination] = useState(null);
  const [pin, setPin] = useState(null);
  const [startTime, setStartTime] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('');
  const [locationBusy, setLocationBusy] = useState(false);
  const [recommendations, setRecommendations] = useState([]);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  const [recommendationsError, setRecommendationsError] = useState('');
  const [selectedRecommendation, setSelectedRecommendation] = useState(null);
  const [stopBaseline, setStopBaseline] = useState(null);
  const [unsavedModalVisible, setUnsavedModalVisible] = useState(false);
  const pendingDiscardRef = useRef(null);
  const {
    imageUri: image,
    setImageUri: setImage,
    pickOneForReview,
    clearImage,
    cancelReview,
    completeReview,
    reviewUris,
    uploading,
  } = useReviewedImagePicker({
    kind: 'route', quality: 1, maxLongEdge: ROUTE_IMAGE_LONG_EDGE,
    normalizeCompress: TRAVEL_IMAGE_COMPRESSION, processOnSelect: false,
  });

  useEffect(() => {
    if (!visible) {
      setStopBaseline(null);
      setUnsavedModalVisible(false);
      pendingDiscardRef.current = null;
      return;
    }
    const nextMode = initialModeFor(initialData);
    const nextDestination = normalizedDestination(initialData?.destination || routeDestination);
    const coordinates = getStopCoordinates(initialData);
    const nextPin = coordinates ? { latitude: coordinates.lat, longitude: coordinates.lng } : null;
    const nextImage = initialData?.image || getMediaVariantUrl(initialData?.media, 'feed') || null;
    setTitle(initialData?.title || '');
    setDescription(initialData?.description || '');
    setMode(nextMode);
    setExactValue(nextMode === LOCATION_MODES.exact ? initialData || null : null);
    setDestination(nextDestination);
    setPin(nextPin);
    setStartTime(initialData?.startTime || '');
    setDurationMinutes(initialData?.durationMinutes ? String(initialData.durationMinutes) : '');
    setSelectedRecommendation(initialData?.source?.recommendationId ? initialData : null);
    setImage(nextImage);
    setStopBaseline(buildStopComparable({
      title: initialData?.title || '', description: initialData?.description || '', mode: nextMode,
      exactValue: nextMode === LOCATION_MODES.exact ? initialData || null : null,
      destination: nextDestination, pin: nextPin,
      startTime: initialData?.startTime || '', durationMinutes: initialData?.durationMinutes || '',
      selectedRecommendationId: initialData?.source?.recommendationId || '', image: nextImage,
    }));
  }, [initialData, routeDestination, setImage, visible]);

  useEffect(() => {
    if (!visible || mode !== LOCATION_MODES.planli || recommendations.length || recommendationsLoading || recommendationsError) return;
    setRecommendationsLoading(true);
    setRecommendationsError('');
    getPersonalizedRecommendations({ sort: 'forYou', limit: 12 }).then((response) => {
      setRecommendations(Array.isArray(response?.items) ? response.items : []);
    }).catch(() => setRecommendationsError('לא הצלחנו לטעון המלצות כרגע.'))
      .finally(() => setRecommendationsLoading(false));
  }, [mode, recommendations.length, recommendationsError, recommendationsLoading, visible]);

  const comparable = useMemo(() => buildStopComparable({
    title, description, mode, exactValue, destination, pin, startTime, durationMinutes,
    selectedRecommendationId: selectedRecommendation?.id || selectedRecommendation?.source?.recommendationId || '',
    image,
  }), [description, destination, durationMinutes, exactValue, image, mode, pin, selectedRecommendation, startTime, title]);
  const hasUnsavedChanges = stopBaseline != null && comparable !== stopBaseline;
  const dismissUnsavedModal = useCallback(() => {
    setUnsavedModalVisible(false); pendingDiscardRef.current = null;
  }, []);
  const confirmUnsavedLeave = useCallback(() => {
    const action = pendingDiscardRef.current;
    setUnsavedModalVisible(false); pendingDiscardRef.current = null; action?.();
  }, []);
  const tryClose = useCallback(() => {
    if (uploading) return;
    if (!hasUnsavedChanges) { onClose?.(); return; }
    pendingDiscardRef.current = () => onClose?.();
    setUnsavedModalVisible(true);
  }, [hasUnsavedChanges, onClose, uploading]);

  const selectRecommendation = (item) => {
    setSelectedRecommendation(item);
    setTitle(item.title || item.name || '');
    setDescription(item.description || '');
    setDestination(normalizedDestination(item.destination));
    const coordinates = getStopCoordinates(item);
    setPin(coordinates ? { latitude: coordinates.lat, longitude: coordinates.lng } : null);
  };

  const buildLocation = () => {
    if (mode === LOCATION_MODES.exact) {
      if (!exactValue?.place?.placeId || !getStopCoordinates(exactValue)) return null;
      return {
        ...exactValue,
        locationPrecision: 'exact',
        destination: {
          countryId: exactValue.countryId,
          cityId: exactValue.cityId,
          countryName: exactValue.country,
          cityName: exactValue.location,
        },
      };
    }
    if (mode === LOCATION_MODES.general) {
      if (!destination?.countryId || !destination?.cityId) return null;
      return {
        locationPrecision: 'general',
        location: destination.name,
        country: destination.countryName,
        destination: destinationRef(destination),
      };
    }
    if (mode === LOCATION_MODES.pin) {
      const lat = Number(pin?.latitude ?? pin?.lat);
      const lng = Number(pin?.longitude ?? pin?.lng);
      if (!destination?.countryId || !destination?.cityId || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return {
        locationPrecision: 'pin',
        location: destination.name,
        country: destination.countryName,
        coordinates: { lat, lng },
        place: { placeId: '', name: title.trim(), address: '', coordinates: { lat, lng } },
        destination: destinationRef(destination),
      };
    }
    if (!selectedRecommendation?.id && !selectedRecommendation?.source?.recommendationId) return null;
    const recommendationDestination = normalizedDestination(selectedRecommendation.destination);
    const recommendationCoordinates = getStopCoordinates(selectedRecommendation);
    const precision = selectedRecommendation.locationMode === 'destination' || !recommendationCoordinates
      ? 'general'
      : selectedRecommendation.place?.placeId ? 'exact' : 'pin';
    return {
      locationPrecision: precision,
      location: recommendationDestination?.name || selectedRecommendation.location || '',
      country: recommendationDestination?.countryName || selectedRecommendation.country || '',
      ...(selectedRecommendation.place && precision !== 'general'
        ? { place: selectedRecommendation.place }
        : {}),
      ...(recommendationCoordinates && precision !== 'general' ? { coordinates: recommendationCoordinates } : {}),
      ...(recommendationDestination ? { destination: {
        countryId: recommendationDestination.countryId,
        cityId: recommendationDestination.cityId,
        countryName: recommendationDestination.countryName,
        cityName: recommendationDestination.name,
      } } : {}),
      source: {
        type: 'recommendation',
        recommendationId: selectedRecommendation.id || selectedRecommendation.source.recommendationId,
      },
      categoryId: selectedRecommendation.categoryId || '',
      subcategoryIds: selectedRecommendation.subcategoryIds || [],
    };
  };

  const handleSave = () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) { Alert.alert('חסר שם לעצירה', 'כדאי להוסיף שם קצר לעצירה.'); return; }
    if (uploading || locationBusy) { Alert.alert('רק רגע', 'כדאי להשלים את בחירת המיקום לפני השמירה.'); return; }
    if (startTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)) {
      Alert.alert('שעה לא תקינה', 'אפשר לכתוב שעה בפורמט 09:30.'); return;
    }
    const duration = durationMinutes ? Number(durationMinutes) : null;
    if (duration != null && (!Number.isSafeInteger(duration) || duration < 1 || duration > 1440)) {
      Alert.alert('משך לא תקין', 'אפשר לבחור משך של דקה ועד 24 שעות.'); return;
    }
    const location = buildLocation();
    if (!location) { Alert.alert('חסר מיקום', 'כדאי להשלים את בחירת המיקום לעצירה.'); return; }
    const preservedStop = { ...(initialData || {}) };
    [
      'place', 'coordinates', 'destination', 'source', 'recommendationId',
      'categoryId', 'subcategoryIds', 'locationPrecision', 'location', 'country',
      'reuseSavedLocation',
    ].forEach((field) => delete preservedStop[field]);
    const nextStop = {
      ...preservedStop, ...location,
      id: initialData?.id || createStopId(),
      title: trimmedTitle,
      description: description.trim(),
      startTime,
      durationMinutes: duration,
      image: allowImages ? image || null : initialData?.image || null,
      media: allowImages && image === (initialData?.image || getMediaVariantUrl(initialData?.media, 'feed'))
        ? initialData?.media || null
        : initialData?.media || null,
    };
    onSave?.(nextStop, stopIndex);
    setUnsavedModalVisible(false); pendingDiscardRef.current = null; onClose?.();
  };

  const modes = [
    { id: LOCATION_MODES.planli, label: 'מ־PlanLi', icon: 'heart-outline' },
    { id: LOCATION_MODES.exact, label: 'מקום מדויק', icon: 'location-outline' },
    { id: LOCATION_MODES.pin, label: 'נקודה במפה', icon: 'pin-outline' },
    { id: LOCATION_MODES.general, label: 'עיר או אזור', icon: 'map-outline' },
  ];
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={tryClose}>
      <View style={styles.container}>
        <UnsavedChangesModal contained visible={unsavedModalVisible} title={UNSAVED_LEAVE_TITLE} message={UNSAVED_LEAVE_MESSAGE} onCancel={dismissUnsavedModal} onConfirm={confirmUnsavedLeave} testID="stop-editor-unsaved-modal" cancelTestID="stop-editor-unsaved-cancel" confirmTestID="stop-editor-unsaved-confirm" />
        <View style={styles.header}>
          <TouchableOpacity onPress={tryClose} disabled={uploading}><AppText style={styles.headerButton}>ביטול</AppText></TouchableOpacity>
          <AppText style={styles.headerTitle}>יום {dayIndex + 1} · עצירה {stopIndex + 1}</AppText>
          <TouchableOpacity onPress={handleSave} disabled={uploading || locationBusy}><AppText style={[styles.headerButton, styles.headerButtonStrong]}>שמירה</AppText></TouchableOpacity>
        </View>
        <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <FocusClearingFormInput label="שם העצירה" placeholder="למשל: השוק המרכזי" value={title} onChangeText={setTitle} rtl testID="route-stop-title-input" />
          <View style={composer.modeActions}>
            {modes.map((entry) => <TouchableOpacity key={entry.id} style={[composer.modeButton, mode === entry.id && composer.modeButtonSelected]} onPress={() => setMode(entry.id)} accessibilityRole="radio" accessibilityState={{ checked: mode === entry.id }} testID={`route-stop-mode-${entry.id}`}><Ionicons name={entry.icon} size={18} /><AppText style={composer.modeButtonText}>{entry.label}</AppText></TouchableOpacity>)}
          </View>
          <View style={styles.locationWrap}>
            {mode === LOCATION_MODES.exact ? <ExactLocationPicker value={exactValue} onChange={setExactValue} onResolvingChange={setLocationBusy} inputTestID="route-stop-location-input" /> : null}
            {mode === LOCATION_MODES.general || mode === LOCATION_MODES.pin ? <SingleDestinationPicker allowProviderDestinations value={destination} onChange={(value) => { setDestination(value); setPin(null); }} /> : null}
            {mode === LOCATION_MODES.pin && destination ? <ManualMapPinPicker destination={destination} value={pin} onChange={setPin} /> : null}
            {mode === LOCATION_MODES.planli ? <View style={composer.destinationResults}>
              {recommendationsLoading ? <ActivityIndicator /> : null}
              {recommendationsError ? <View>
                <AppText style={composer.destinationEmpty}>{recommendationsError}</AppText>
                <TouchableOpacity
                  style={styles.retryButton}
                  onPress={() => setRecommendationsError('')}
                  testID="route-stop-recommendations-retry"
                >
                  <AppText style={styles.retryButtonText}>ניסיון נוסף</AppText>
                </TouchableOpacity>
              </View> : null}
              {!recommendationsLoading && !recommendationsError && !recommendations.length ? <AppText style={composer.destinationEmpty}>עדיין אין המלצות זמינות לבחירה.</AppText> : null}
              {recommendations.map((item) => <TouchableOpacity key={item.id} style={[composer.destinationResult, selectedRecommendation?.id === item.id && composer.selectedDestination]} onPress={() => selectRecommendation(item)} testID={`route-stop-recommendation-${item.id}`}><Ionicons name="heart-outline" size={18} /><View style={composer.destinationResultCopy}><AppText style={composer.destinationResultTitle}>{item.title}</AppText><AppText style={composer.destinationResultSubtitle}>{item.destination?.cityName || item.location || ''}</AppText></View></TouchableOpacity>)}
            </View> : null}
          </View>
          <FocusClearingFormInput label="תיאור העצירה (רשות)" placeholder="למשל: מה כדאי לעשות כאן וכמה זמן להקדיש" value={description} onChangeText={setDescription} multiline style={styles.descriptionInput} rtl />
          <FocusClearingFormInput label="שעת התחלה (רשות)" placeholder="למשל: 09:30" value={startTime} onChangeText={setStartTime} keyboardType="numbers-and-punctuation" maxLength={5} rtl testID="route-stop-start-time" />
          <FocusClearingFormInput label="משך ביקור בדקות (רשות)" placeholder="למשל: 90" value={durationMinutes} onChangeText={(value) => setDurationMinutes(value.replace(/\D/g, ''))} keyboardType="numeric" maxLength={4} rtl testID="route-stop-duration" />
          {allowImages ? <><AppText style={styles.photoLabel}>תמונה לעצירה</AppText><ImagePickerBox imageUri={image} onPress={() => pickOneForReview(async (uri) => { await onPersistImage?.(uri); await onForgetImage?.(image); setImage(uri); })} onRemove={() => { Promise.resolve(onForgetImage?.(image)).catch(() => {}); clearImage(); }} maxImages={1} placeholderText={uploading ? 'מעלה תמונה...' : 'הוספת תמונה'} style={styles.imagePickerSpacing} loading={uploading} /></> : null}
        </ScrollView>
        <ImageCropReviewModal visible={reviewUris.length > 0} uris={reviewUris} aspect={[4, 3]} maxLongEdge={ROUTE_IMAGE_LONG_EDGE} compress={TRAVEL_IMAGE_COMPRESSION} onCancel={cancelReview} onComplete={completeReview} />
      </View>
    </Modal>
  );
}
