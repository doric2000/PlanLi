import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Keyboard, Modal, ScrollView, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import AppText from '../../../components/AppText';
import ExactLocationPicker from '../../../components/ExactLocationPicker';
import { FormInput } from '../../../components/FormInput';
import { ImagePickerBox } from '../../../components/ImagePickerBox';
import TravelMediaComposer from '../../../components/TravelMediaComposer';
import UnsavedChangesModal from '../../../components/UnsavedChangesModal';
import { UNSAVED_LEAVE_MESSAGE, UNSAVED_LEAVE_TITLE } from '../../../constants/unsavedLeaveStrings';
import { ROUTE_IMAGE_LONG_EDGE, TRAVEL_IMAGE_COMPRESSION } from '../../../constants/travelMedia';
import RouteRecommendationPicker from './RouteRecommendationPicker';
import { getMediaVariantUrl } from '../../../utils/mediaAssets';
import {
  createTravelMediaDescriptor,
  removedTravelMediaItems,
  travelMediaUri,
} from '../../../utils/travelMedia';
import {
  colors,
  routeBuilderStyles as builder,
  recommendationComposerStyles as composer,
  stopEditorModalStyles as styles,
} from '../../../styles';
import ManualMapPinPicker from '../../community/components/ManualMapPinPicker';
import SingleDestinationPicker from '../../community/components/SingleDestinationPicker';
import { getStopCoordinates, getStopMediaAssets } from '../utils/routeStops';
import { normalizeRouteTimeInput } from '../utils/routeTime';
import {
  NoyaTourTarget,
  useNoyaTour,
} from '../../noya/NoyaTourContext';
import NoyaTourOverlayHost from '../../noya/NoyaTourOverlay';
import { NOYA_CREATOR_TARGETS } from '../../noya/NoyaTourDefinitions';

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

function exactValueForStop(stop) {
  if (!stop) return null;
  const destination = stop.destination || {};
  return {
    ...stop,
    countryId: stop.countryId || destination.countryId,
    cityId: stop.cityId || destination.cityId,
    country: stop.country || destination.countryName,
    location: stop.location || destination.cityName,
  };
}

function buildStopComparable(value) { return JSON.stringify(value); }

function recommendationIdFor(value) {
  return value?.source?.recommendationId || value?.recommendationId || value?.id || '';
}

function photoItemsForStop(stop) {
  const assets = getStopMediaAssets(stop);
  const canonical = assets
    .map((asset) => createTravelMediaDescriptor({
      asset,
      id: asset.assetId,
      sourceId: asset.assetId,
      uri: getMediaVariantUrl(asset, 'feed'),
    }))
    .filter((item) => item?.uri);
  const pending = (Array.isArray(stop?.pendingMedia) ? stop.pendingMedia : [])
    .filter((item) => item?.uri)
    .map((item) => createTravelMediaDescriptor({ ...item, asset: null }));
  if (stop?.mediaOrder?.length) {
    let remoteIndex = 0;
    let localIndex = 0;
    return stop.mediaOrder.map((kind) => kind === 'remote' ? canonical[remoteIndex++] : pending[localIndex++]).filter(Boolean);
  }
  if (canonical.length || pending.length) return [...canonical, ...pending].slice(0, 3);
  return stop?.image ? [createTravelMediaDescriptor({ asset: null, uri: stop.image })] : [];
}

function FocusClearingFormInput({ placeholder, onFocus, onBlur, multiline, style, ...props }) {
  const [focused, setFocused] = useState(false);
  const [textHeight, setTextHeight] = useState(110);
  return <FormInput {...props} multiline={multiline} style={[style, multiline && { height: textHeight }]} scrollEnabled={!multiline}
    onContentSizeChange={multiline ? (event) => setTextHeight(Math.max(110, event.nativeEvent.contentSize.height)) : undefined}
    placeholder={focused ? '' : placeholder} onFocus={(event) => {
    setFocused(true); onFocus?.(event);
  }} onBlur={(event) => { setFocused(false); onBlur?.(event); }} />;
}

export default function StopEditorModal({
  visible, onClose, onSave, initialData, dayIndex, stopIndex,
  onForgetImage, onPersistImages, mediaForImage, routeDestination, allowImages = true,
  guideEnabled = false,
  embedded = false, onDraftChange, maxPhotos = 3, validationError = '', validationField = '', onBusyChange,
  onRequestRecommendations, onRevealField,
}) {
  const { requestCreatorStep, setTourSuspended } = useNoyaTour();
  const safeDayIndex = Number.isInteger(dayIndex) && dayIndex >= 0 ? dayIndex : 0;
  const safeStopIndex = Number.isInteger(stopIndex) && stopIndex >= 0 ? stopIndex : 0;
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [mode, setMode] = useState(LOCATION_MODES.exact);
  const [exactValue, setExactValue] = useState(null);
  const [destination, setDestination] = useState(null);
  const [pin, setPin] = useState(null);
  const [startTime, setStartTime] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('');
  const [locationBusy, setLocationBusy] = useState(false);
  const [locationMessage, setLocationMessage] = useState('');
  const [localPickerOpen, setLocalPickerOpen] = useState(false);
  const [locationExpanded, setLocationExpanded] = useState(false);
  const [localIssue, setLocalIssue] = useState(null);
  const importedCopyRef = useRef(null);
  const fieldRefs = useRef({});
  const [selectedRecommendation, setSelectedRecommendation] = useState(null);
  const [photoItems, setPhotoItems] = useState([]);
  const [mediaComposerVisible, setMediaComposerVisible] = useState(false);
  const [stopBaseline, setStopBaseline] = useState(null);
  const [unsavedModalVisible, setUnsavedModalVisible] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const initializedIdRef = useRef(null);
  const titleInputRef = useRef(null);
  const timeInputRef = useRef(null);
  const durationInputRef = useRef(null);
  const lastEmittedRef = useRef(null);
  const draftChangeRef = useRef(onDraftChange);
  draftChangeRef.current = onDraftChange;
  const pendingDiscardRef = useRef(null);
  const preferredRouteDestination = useMemo(
    () => normalizedDestination(routeDestination),
    [routeDestination]
  );
  useEffect(() => {
    if (!visible || !guideEnabled) return;
    requestCreatorStep('route', 1, {
      ...(!embedded ? {
        primaryAction: () => setMediaComposerVisible(true),
        primaryLabel: 'בחירת תמונות',
        suspendReason: 'route-stop-media-composer',
      } : {}),
      scope: 'route-stop-editor',
    });
  }, [embedded, guideEnabled, requestCreatorStep, visible]);

  useEffect(() => {
    const reason = 'route-stop-media-composer';
    setTourSuspended(reason, visible && mediaComposerVisible);
    return () => setTourSuspended(reason, false);
  }, [mediaComposerVisible, setTourSuspended, visible]);

  useEffect(() => {
    if (!visible) {
      setStopBaseline(null);
      setMediaComposerVisible(false);
      setUnsavedModalVisible(false);
      pendingDiscardRef.current = null;
      return;
    }
    if (embedded && initializedIdRef.current === initialData?.id) return;
    initializedIdRef.current = initialData?.id;
    importedCopyRef.current = null;
    setLocationExpanded(false);
    setLocalIssue(null);
    setLocalPickerOpen(false);
    const nextMode = initialData?.editorState?.locationMode || initialModeFor(initialData);
    const nextExactValue = nextMode === LOCATION_MODES.exact
      ? initialData?.editorState?.locationIncomplete
        ? { query: initialData.editorState.query || '' }
        : { ...exactValueForStop(initialData), query: initialData?.editorState?.query || initialData?.place?.name || '' }
      : null;
    const nextDestination = normalizedDestination(initialData?.destination || routeDestination);
    const coordinates = getStopCoordinates(initialData);
    const nextPin = coordinates ? { latitude: coordinates.lat, longitude: coordinates.lng } : null;
    const nextPhotoItems = photoItemsForStop(initialData);
    setTitle(initialData?.title || '');
    setDescription(initialData?.description || '');
    setMode(nextMode);
    setExactValue(nextExactValue);
    setDestination(nextDestination);
    setPin(nextPin);
    setLocationMessage('');
    setSearchQuery(initialData?.editorState?.query || '');
    setStartTime(initialData?.editorState?.startTime ?? initialData?.startTime ?? '');
    setDurationMinutes(initialData?.editorState?.durationMinutes ?? (initialData?.durationMinutes ? String(initialData.durationMinutes) : ''));
    setSelectedRecommendation(initialData?.source?.recommendationId ? initialData : null);
    setPhotoItems(nextPhotoItems);
    setStopBaseline(buildStopComparable({
      title: initialData?.title || '', description: initialData?.description || '', mode: nextMode,
      exactValue: nextExactValue,
      destination: nextDestination, pin: nextPin,
      startTime: initialData?.editorState?.startTime ?? initialData?.startTime ?? '',
      durationMinutes: initialData?.editorState?.durationMinutes ?? (initialData?.durationMinutes ? String(initialData.durationMinutes) : ''),
      query: initialData?.editorState?.query || '',
      selectedRecommendationId: initialData?.source?.recommendationId || '',
      photos: nextPhotoItems,
    }));
  }, [embedded, initialData, routeDestination, visible]);

  const comparable = useMemo(() => buildStopComparable({
    title, description, mode, exactValue, destination, pin, startTime, durationMinutes, query: searchQuery,
    selectedRecommendationId: recommendationIdFor(selectedRecommendation),
    photos: photoItems,
  }), [description, destination, durationMinutes, exactValue, mode, photoItems, pin, searchQuery, selectedRecommendation, startTime, title]);
  const hasUnsavedChanges = stopBaseline != null && comparable !== stopBaseline;
  useEffect(() => { setLocalIssue(null); }, [comparable]);
  const mediaBusy = photoItems.some((item) => item.persistence === 'materializing');
  useEffect(() => {
    onBusyChange?.(locationBusy || photoItems.some((item) => item.persistence === 'materializing'));
    return () => onBusyChange?.(false);
  }, [locationBusy, onBusyChange, photoItems]);
  useEffect(() => {
    if (!validationError) return undefined;
    if (['time', 'duration'].includes(validationField)) setDetailsOpen(true);
    if (validationField === 'location') setLocationExpanded(true);
    const timer = setTimeout(() => {
      onRevealField?.(fieldRefs.current[validationField]);
      ({ stopTitle: titleInputRef, time: timeInputRef, duration: durationInputRef })[validationField]?.current?.focus?.();
    }, 100);
    return () => clearTimeout(timer);
  }, [validationError, validationField, onRevealField]);
  const acceptExactLocation = useCallback((value) => {
    setExactValue(value);
    if (value?.place?.placeId) { setLocationExpanded(false); Keyboard.dismiss(); }
    if (value?.place?.name) setTitle((current) => current.trim() ? current : value.place.name);
    if (value?.place?.name) setSearchQuery('');
  }, []);
  const dismissUnsavedModal = useCallback(() => {
    setUnsavedModalVisible(false); pendingDiscardRef.current = null;
  }, []);
  const confirmUnsavedLeave = useCallback(() => {
    const action = pendingDiscardRef.current;
    setUnsavedModalVisible(false); pendingDiscardRef.current = null; action?.();
  }, []);
  const tryClose = useCallback(() => {
    if (mediaBusy) return;
    if (!hasUnsavedChanges) { onClose?.(); return; }
    pendingDiscardRef.current = () => onClose?.();
    setUnsavedModalVisible(true);
  }, [hasUnsavedChanges, mediaBusy, onClose]);

  const selectRecommendation = (item) => {
    const imported = importedCopyRef.current;
    const nextTitle = item.title || item.name || '';
    const nextDescription = item.description || '';
    setTitle((current) => !current.trim() || current === imported?.title ? nextTitle : current);
    setDescription((current) => !current.trim() || current === imported?.description ? nextDescription : current);
    importedCopyRef.current = { title: nextTitle, description: nextDescription };
    setSelectedRecommendation(item);
    setMode(LOCATION_MODES.planli);
    setExactValue(null);
    setSearchQuery('');
    setLocationMessage('');
    setLocationExpanded(false);
    setLocalIssue(null);
    setLocalPickerOpen(false);
    setDestination(normalizedDestination(item.destination));
    const coordinates = getStopCoordinates(item);
    setPin(coordinates ? { latitude: coordinates.lat, longitude: coordinates.lng } : null);
  };

  const openRecommendations = () => {
    Keyboard.dismiss();
    if (onRequestRecommendations) onRequestRecommendations(selectRecommendation);
    else setLocalPickerOpen(true);
  };

  const switchLocationMode = (nextMode) => {
    if (nextMode === mode) return;
    setMode(nextMode);
    setLocationExpanded(true);
    setLocationMessage('');
    if (nextMode === LOCATION_MODES.planli) {
      setExactValue(null);
      setDestination(null);
      setPin(null);
      setSelectedRecommendation(null);
      return;
    }
    setSelectedRecommendation(null);
    if (nextMode === LOCATION_MODES.exact) {
      setDestination(null);
      setPin(null);
      setExactValue(null);
      return;
    }
    setExactValue(null);
    if (nextMode === LOCATION_MODES.general) {
      if (!destination) setDestination(preferredRouteDestination);
      setPin(null);
      return;
    }
    if (destination?.countryId && destination?.cityId &&
      !destination.coordinates && !destination.viewport) {
      setDestination(null);
      setPin(null);
      setLocationMessage('כדי לסמן נקודה במפה, כדאי לבחור שוב את העיר או האזור.');
    }
  };

  const chooseGeneralDestination = (value) => {
    setDestination(value);
    if (value && mode === LOCATION_MODES.general) { setLocationExpanded(false); Keyboard.dismiss(); }
    setPin(null);
    setLocationMessage('');
  };

  const acceptPinSearchLocation = useCallback((confirmed) => {
    if (!confirmed) return;
    const nextDestination = normalizedDestination(confirmed.destination || {
      countryId: confirmed.countryId,
      cityId: confirmed.cityId,
      countryName: confirmed.country,
      cityName: confirmed.location,
    });
    const coordinates = getStopCoordinates(confirmed);
    if (!nextDestination || !coordinates) return;
    setDestination({
      ...nextDestination,
      coordinates: nextDestination.coordinates || coordinates,
    });
    setPin({ latitude: coordinates.lat, longitude: coordinates.lng });
    setExactValue(null);
    setLocationMessage('');
  }, []);

  const addPhotos = () => {
    setMediaComposerVisible(true);
  };

  const completeMediaSelection = (items) => {
    const nextItems = (items || []).map((item) => {
      let persisted = mediaForImage?.(item) || null;
      if (persisted && !travelMediaUri(persisted)) persisted = mediaForImage?.(travelMediaUri(item)) || null;
      const uri = travelMediaUri(persisted) || travelMediaUri(item);
      return { ...(persisted || {}), ...item, ...(persisted?.localReference ? { localReference: persisted.localReference } : {}), uri, previewUri: item.previewUri || uri };
    }).slice(0, maxPhotos);
    removedTravelMediaItems(photoItems, nextItems)
      .filter((item) => !item.asset)
      .forEach((item) => Promise.resolve(onForgetImage?.(item)).catch(() => {}));
    setPhotoItems(nextItems);
    setMediaComposerVisible(false);
    Promise.resolve(onPersistImages?.(nextItems.filter((item) => !item.asset && !['selected', 'materializing', 'failed'].includes(item.persistence)))).catch(() => {
      Alert.alert('לא הצלחנו לשמור את התמונות', 'התמונות עדיין מוצגות. אפשר לנסות לבחור אותן מחדש לפני הפרסום.');
    });
  };

  const removePhoto = (index) => {
    setPhotoItems((current) => {
      const removed = current[index];
      if (!removed?.asset) Promise.resolve(onForgetImage?.(removed)).catch(() => {});
      return current.filter((_, itemIndex) => itemIndex !== index);
    });
  };

  const buildLocation = () => {
    if (mode === LOCATION_MODES.exact) {
      if (!exactValue?.place?.placeId || !getStopCoordinates(exactValue)) return null;
      const exactDestination = normalizedDestination(exactValue.destination || {
        countryId: exactValue.countryId, cityId: exactValue.cityId,
        countryName: exactValue.country, cityName: exactValue.location,
      });
      if (!exactDestination) return null;
      return {
        ...exactValue,
        locationPrecision: 'exact',
        destination: destinationRef(exactDestination),
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
        recommendationId: recommendationIdFor(selectedRecommendation),
      },
      categoryId: selectedRecommendation.categoryId || '',
      subcategoryIds: selectedRecommendation.subcategoryIds || [],
    };
  };

  const buildDraftStop = () => {
    const location = buildLocation();
    const preserved = { ...(initialData || {}) };
    ['place', 'coordinates', 'destination', 'source', 'recommendationId', 'categoryId',
      'subcategoryIds', 'locationPrecision', 'location', 'country', 'reuseSavedLocation'].forEach((field) => delete preserved[field]);
    const remote = photoItems.filter((item) => item.asset).map((item) => item.asset);
    const local = photoItems.filter((item) => !item.asset);
    const duration = Number(durationMinutes);
    return {
      ...preserved,
      ...(location || (destination ? { destination: destinationRef(destination) } : {})),
      id: initialData?.id,
      title, description,
      startTime: normalizeRouteTimeInput(startTime) || '',
      durationMinutes: durationMinutes && Number.isSafeInteger(duration) && duration >= 1 && duration <= 1440 ? duration : null,
      media: remote[0] || null, additionalMedia: remote.slice(1), pendingMedia: local,
      image: local[0]?.uri || null,
      mediaOrder: photoItems.map((item) => item.asset ? 'remote' : 'local'),
      editorState: { locationMode: mode, locationIncomplete: !location, query: searchQuery, startTime, durationMinutes },
      ...(initialData?.reuseSavedLocation && location?.place?.placeId === initialData?.place?.placeId && !location?.place?.resolvedPlaceToken
        ? { reuseSavedLocation: true } : {}),
    };
  };
  useEffect(() => {
    if (!embedded || !visible || stopBaseline == null || comparable === lastEmittedRef.current) return;
    const initialRender = lastEmittedRef.current == null;
    lastEmittedRef.current = comparable;
    if (!initialRender || comparable !== stopBaseline) draftChangeRef.current?.(buildDraftStop());
  }, [comparable, embedded, stopBaseline, visible]);

  const showIssue = (message, field) => {
    setLocalIssue({ message, field });
    if (['time', 'duration'].includes(field)) setDetailsOpen(true);
    if (field === 'location') setLocationExpanded(true);
    setTimeout(() => {
      onRevealField?.(fieldRefs.current[field]);
      ({ stopTitle: titleInputRef, time: timeInputRef, duration: durationInputRef })[field]?.current?.focus?.();
    }, 100);
  };
  const handleSave = () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) { showIssue('כדאי להוסיף שם קצר לעצירה.', 'stopTitle'); return; }
    if (mediaBusy || locationBusy || photoItems.some((item) => item.persistence === 'failed')) { showIssue('כדאי להשלים את בחירת המיקום והתמונות לפני הסיום.', locationBusy ? 'location' : 'photos'); return; }
    const normalizedStartTime = normalizeRouteTimeInput(startTime);
    if (normalizedStartTime === null) {
      showIssue('אפשר לכתוב למשל 8:30 או 09:30.', 'time'); return;
    }
    const duration = durationMinutes ? Number(durationMinutes) : null;
    if (duration != null && (!Number.isSafeInteger(duration) || duration < 1 || duration > 1440)) {
      showIssue('אפשר לבחור משך של דקה ועד 24 שעות.', 'duration'); return;
    }
    const location = buildLocation();
    if (!location) { showIssue('כדאי להשלים את בחירת המיקום לעצירה.', 'location'); return; }
    const canonicalLocation = { ...location };
    delete canonicalLocation.reuseSavedLocation;
    const preservedStop = { ...(initialData || {}) };
    [
      'place', 'coordinates', 'destination', 'source', 'recommendationId',
      'categoryId', 'subcategoryIds', 'locationPrecision', 'location', 'country',
      'reuseSavedLocation',
    ].forEach((field) => delete preservedStop[field]);
    const canonicalMedia = photoItems.map((item) => item.asset).filter(Boolean);
    const pendingMedia = photoItems.filter((item) => !item.asset && item.uri).map((item) => ({
      uri: item.uri,
      ...(item.sourceUri ? { sourceUri: item.sourceUri } : {}),
      ...(item.sourceId ? { sourceId: item.sourceId } : {}),
      ...(item.assetId ? { assetId: item.assetId } : {}),
      ...(item.width ? { width: item.width } : {}),
      ...(item.height ? { height: item.height } : {}),
      ...(item.mediaId ? { mediaId: item.mediaId } : {}),
      ...(item.localReference ? { localReference: item.localReference } : {}),
      ...(item.transform ? { transform: item.transform } : {}),
    }));
    const nextStop = {
      ...preservedStop, ...canonicalLocation,
      mediaOrder: photoItems.map((item) => item.asset ? 'remote' : 'local'),
      editorState: { locationMode: mode, locationIncomplete: false, query: '', startTime: normalizedStartTime, durationMinutes },
      id: initialData?.id || createStopId(),
      title: trimmedTitle,
      description: description.trim(),
      startTime: normalizedStartTime,
      durationMinutes: duration,
      image: allowImages ? pendingMedia[0]?.uri || null : initialData?.image || null,
      media: allowImages ? canonicalMedia[0] || null : initialData?.media || null,
      additionalMedia: allowImages
        ? canonicalMedia.slice(1, 3)
        : initialData?.additionalMedia || [],
      pendingMedia: allowImages ? pendingMedia : initialData?.pendingMedia || [],
      ...(initialData?.reuseSavedLocation === true &&
        canonicalLocation.locationPrecision === 'exact' &&
        initialData.place?.placeId === canonicalLocation.place?.placeId &&
        !canonicalLocation.place?.resolvedPlaceToken
        ? { reuseSavedLocation: true }
        : {}),
    };
    const saved = onSave?.(nextStop, safeStopIndex);
    if (saved === false) return;
    Keyboard.dismiss(); setLocalIssue(null);
    setUnsavedModalVisible(false); pendingDiscardRef.current = null; onClose?.();
  };

  const locationModes = [
    { id: LOCATION_MODES.exact, label: 'מקום מדויק', icon: 'location-outline' },
    { id: LOCATION_MODES.general, label: 'עיר או אזור', icon: 'map-outline' },
    { id: LOCATION_MODES.pin, label: 'נקודה במפה', icon: 'pin-outline' },
  ];
  const location = buildLocation();
  const locationCollapsed = Boolean(location && !locationExpanded);
  const issue = localIssue || (validationError ? { message: validationError, field: validationField } : null);
  const renderIssue = (field) => issue?.field === field
    ? <AppText style={composer.fieldError} accessibilityLiveRegion="assertive" testID="route-stop-validation-error">{issue.message}</AppText>
    : null;
  const Container = embedded ? View : Modal;
  const Content = embedded ? View : ScrollView;
  return (
    <Container {...(embedded ? { testID: 'route-stop-inline-editor' } : { visible, animationType: 'slide', presentationStyle: 'pageSheet', onRequestClose: tryClose })}>
      <View style={[embedded ? builder.inlineEditor : styles.container, localPickerOpen && builder.hiddenEditor]}>
        {!embedded ? <UnsavedChangesModal contained visible={unsavedModalVisible} title={UNSAVED_LEAVE_TITLE} message={UNSAVED_LEAVE_MESSAGE} onCancel={dismissUnsavedModal} onConfirm={confirmUnsavedLeave} testID="stop-editor-unsaved-modal" cancelTestID="stop-editor-unsaved-cancel" confirmTestID="stop-editor-unsaved-confirm" /> : null}
        {!embedded ? <View style={styles.header}>
          <TouchableOpacity accessibilityRole="button" onPress={tryClose} disabled={mediaBusy}><AppText style={styles.headerButton}>ביטול</AppText></TouchableOpacity>
          <AppText style={styles.headerTitle}>יום {safeDayIndex + 1} · עצירה {safeStopIndex + 1}</AppText>
          <TouchableOpacity accessibilityRole="button" onPress={handleSave} disabled={mediaBusy || locationBusy}><AppText style={[styles.headerButton, styles.headerButtonStrong]}>שמירה</AppText></TouchableOpacity>
        </View> : null}
        <Content {...(embedded ? { style: builder.inlineEditor } : { style: styles.content, contentContainerStyle: styles.scrollContent, keyboardShouldPersistTaps: 'handled' })}>
          {!!issue && !['stopTitle', 'location', 'photos', 'time', 'duration'].includes(issue.field) && renderIssue(issue.field)}
          <NoyaTourTarget scope="route-stop-editor" targetId={NOYA_CREATOR_TARGETS.routeStop}>
            <View collapsable={false} ref={(node) => { fieldRefs.current.stopTitle = node; }}>{renderIssue('stopTitle')}<FocusClearingFormInput inputRef={titleInputRef} label="שם העצירה" placeholder="למשל: השוק המרכזי" value={title} onChangeText={setTitle} maxLength={160} rtl testID="route-stop-title-input" /></View>
            {!locationCollapsed && <><TouchableOpacity
              style={[styles.planliSourceButton, mode === LOCATION_MODES.planli && styles.planliSourceButtonSelected]}
              onPress={openRecommendations}
              accessibilityRole="button"
              accessibilityState={{ selected: mode === LOCATION_MODES.planli }}
              testID="route-stop-mode-planli"
            >
              <Ionicons name="heart-outline" size={20} color={colors.primary} />
              <View style={styles.planliSourceCopy}>
                <AppText style={styles.planliSourceTitle}>בחירה מהמלצות PlanLi</AppText>
                <AppText style={styles.planliSourceHint}>הוספת מקום שכבר הומלץ בקהילה</AppText>
              </View>
            </TouchableOpacity>
            <AppText style={styles.locationModeLabel}>או בחירת מיקום</AppText>
            <View style={composer.modeActions}>
              {locationModes.map((entry) => <TouchableOpacity key={entry.id} style={[composer.modeButton, mode === entry.id && composer.modeButtonSelected]} onPress={() => switchLocationMode(entry.id)} accessibilityRole="radio" accessibilityState={{ checked: mode === entry.id }} testID={`route-stop-mode-${entry.id}`}><Ionicons name={entry.icon} size={18} color={colors.primary} /><AppText style={composer.modeButtonText}>{entry.label}</AppText></TouchableOpacity>)}
            </View></>}
          </NoyaTourTarget>
          <View style={styles.locationWrap} collapsable={false} ref={(node) => { fieldRefs.current.location = node; }}>
            {renderIssue('location')}
            {locationCollapsed ? <View style={builder.stopCard} testID={mode === LOCATION_MODES.exact ? 'route-stop-exact-selected' : 'route-stop-location-summary'}>
              <Ionicons name={mode === LOCATION_MODES.planli ? 'heart-outline' : 'location-outline'} size={22} color={colors.primary} />
              <View style={builder.flexCopy}><AppText style={builder.stopTitle}>{mode === LOCATION_MODES.planli ? selectedRecommendation?.title || title : location.place?.name || location.location}</AppText><AppText style={builder.stopMeta}>{mode === LOCATION_MODES.planli ? 'מהמלצות PlanLi' : location.destination?.cityName || ''}</AppText></View>
              <TouchableOpacity accessibilityRole="button" style={builder.textButton} onPress={() => setLocationExpanded(true)} testID={mode === LOCATION_MODES.exact ? 'route-stop-exact-change' : 'route-stop-location-change'}><AppText style={builder.retryText}>שינוי</AppText></TouchableOpacity>
            </View> : <>
            {location && <TouchableOpacity accessibilityRole="button" style={builder.textButton} onPress={() => { setLocationExpanded(false); Keyboard.dismiss(); }} testID="route-stop-location-done"><AppText style={builder.retryText}>סיום בחירת מיקום</AppText></TouchableOpacity>}
            {mode === LOCATION_MODES.exact ? <ExactLocationPicker
              value={exactValue}
              onChange={acceptExactLocation}
              onQueryChange={setSearchQuery}
              onResolvingChange={setLocationBusy}
              variant="composer"
              label="חיפוש מקום"
              placeholder="למשל: Café Central, וינה"
              inputTestID="route-stop-location-input"
              showSelectedCard={false}
              selectedTestID="route-stop-exact-selected"
              changeTestID="route-stop-exact-change"
              errorTestID="route-stop-location-error"
              retryTestID="route-stop-location-retry"
              changeResultTestID="route-stop-location-change-result"
              preferredDestination={preferredRouteDestination}
            /> : null}
            {mode === LOCATION_MODES.general || (mode === LOCATION_MODES.pin && destination) ? <View style={composer.locationPanel}>
              <AppText style={composer.fieldLabel}>בחירת עיר או אזור</AppText>
              <SingleDestinationPicker allowProviderDestinations value={destination} onChange={chooseGeneralDestination} />
              {mode === LOCATION_MODES.general ? <AppText style={composer.fieldHint}>העצירה תישמר בתוך היעד בלי נקודה מדויקת במפה.</AppText> : null}
            </View> : null}
            {locationMessage ? <AppText style={composer.fieldError} testID="route-stop-location-message">{locationMessage}</AppText> : null}
            {mode === LOCATION_MODES.pin && !destination ? <ExactLocationPicker
              value={null}
              onChange={acceptPinSearchLocation}
              onResolvingChange={setLocationBusy}
              variant="composer"
              label="חיפוש מקום לסימון במפה"
              helper="חפשו מקום מוכר באזור; לאחר הבחירה אפשר להזיז את הסיכה למיקום הרצוי."
              placeholder="למשל: Hampi, הודו"
              inputTestID="route-stop-pin-location-input"
              errorTestID="route-stop-pin-location-error"
              retryTestID="route-stop-pin-location-retry"
              changeResultTestID="route-stop-pin-location-change-result"
              preferredDestination={preferredRouteDestination}
            /> : null}
            {mode === LOCATION_MODES.pin && destination ? <View style={styles.manualMapSpacing}><ManualMapPinPicker destination={destination} value={pin} onChange={setPin} /></View> : null}
            {mode === LOCATION_MODES.planli ? <TouchableOpacity accessibilityRole="button" style={builder.secondaryButton} onPress={openRecommendations}><AppText style={builder.secondaryButtonText}>בחירת המלצה אחרת</AppText></TouchableOpacity> : null}
            </>}
          </View>
          <View collapsable={false} ref={(node) => { fieldRefs.current.photos = node; }}>{renderIssue('photos')}{embedded && allowImages && maxPhotos > 0 ? <TravelMediaComposer embedded visible={visible} value={photoItems} maxItems={maxPhotos} aspect={[4, 3]} maxLongEdge={ROUTE_IMAGE_LONG_EDGE} compress={TRAVEL_IMAGE_COMPRESSION} onChange={completeMediaSelection} /> : null}</View>
          {embedded && allowImages && maxPhotos <= 0 ? <AppText style={composer.fieldHint}>כבר נבחרו 40 תמונות למסלול. אפשר להסיר תמונה מעצירה אחרת כדי להוסיף כאן.</AppText> : null}
          <FocusClearingFormInput label="תיאור" placeholder="למשל: מה כדאי לעשות כאן וכמה זמן להקדיש" value={description} onChangeText={setDescription} maxLength={3000} multiline scrollEnabled={false} style={styles.descriptionInput} rtl testID="route-stop-description-input" />
          {embedded ? <TouchableOpacity ref={(node) => { fieldRefs.current.details = node; }} style={builder.detailsToggle} onPress={() => setDetailsOpen((current) => !current)} accessibilityRole="button" accessibilityState={{ expanded: detailsOpen }} testID="route-stop-details-toggle"><AppText style={builder.detailsToggleText}>פרטים נוספים, רק אם רלוונטי</AppText></TouchableOpacity> : null}
          {!embedded || detailsOpen ? <>
          <View collapsable={false} ref={(node) => { fieldRefs.current.time = node; }}>{renderIssue('time')}<FocusClearingFormInput inputRef={timeInputRef} label="שעת התחלה (רשות)" placeholder="למשל: 09:30" value={startTime} onChangeText={setStartTime} keyboardType="numbers-and-punctuation" maxLength={5} rtl testID="route-stop-start-time" /></View>
          <View collapsable={false} ref={(node) => { fieldRefs.current.duration = node; }}>{renderIssue('duration')}<FocusClearingFormInput inputRef={durationInputRef} label="משך ביקור בדקות (רשות)" placeholder="למשל: 90" value={durationMinutes} onChangeText={(value) => setDurationMinutes(value.replace(/\D/g, ''))} keyboardType="numeric" maxLength={4} rtl testID="route-stop-duration" /></View>
          {embedded && <TouchableOpacity accessibilityRole="button" style={builder.textButton} onPress={() => { Keyboard.dismiss(); setDetailsOpen(false); requestAnimationFrame(() => onRevealField?.(fieldRefs.current.details)); }} testID="route-stop-details-done"><AppText style={builder.retryText}>סיום פרטים נוספים</AppText></TouchableOpacity>}
          </> : null}
          {!embedded && allowImages ? <><AppText style={styles.photoLabel}>תמונות לעצירה (רשות)</AppText><ImagePickerBox imageUris={photoItems.map(travelMediaUri)} onPress={addPhotos} onRemove={removePhoto} maxImages={3} placeholderText="הוספת עד 3 תמונות" previewAspectRatio={4 / 3} style={styles.imagePickerSpacing} loading={mediaBusy} testID="route-stop-photos" /></> : null}
          {embedded && <TouchableOpacity style={builder.primaryButton} onPress={handleSave} testID="route-stop-done" accessibilityRole="button"><AppText style={builder.primaryButtonText}>סיום עצירה</AppText></TouchableOpacity>}
        </Content>
        {!embedded ? <TravelMediaComposer contained visible={mediaComposerVisible} value={photoItems} maxItems={3} aspect={[4, 3]} maxLongEdge={ROUTE_IMAGE_LONG_EDGE} compress={TRAVEL_IMAGE_COMPRESSION} onCancel={() => setMediaComposerVisible(false)} onChange={completeMediaSelection} /> : null}
        {guideEnabled ? <NoyaTourOverlayHost scope="route-stop-editor" /> : null}
      </View>
      {localPickerOpen && <RouteRecommendationPicker routeDestination={routeDestination} onSelect={selectRecommendation} onCancel={() => setLocalPickerOpen(false)} />}
    </Container>
  );
}
