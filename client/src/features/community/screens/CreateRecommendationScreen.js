import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { randomUUID } from 'expo-crypto';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import AppText from '../../../components/AppText';
import { FormInput } from '../../../components/FormInput';
import RtlChoiceGroup from '../../../components/RtlChoiceGroup';
import GooglePlacesInput from '../../../components/GooglePlacesInput';
import ExactLocationConfirmation from '../../../components/ExactLocationConfirmation';
import ExactLocationMapPreview from '../../../components/ExactLocationMapPreview';
import TravelMediaComposer from '../../../components/TravelMediaComposer';
import {
  RECOMMENDATION_CATEGORIES,
  RECOMMENDATION_SUBCATEGORIES,
  POST_BUDGETS,
  isRecommendationClassificationValid,
  searchRecommendationCatalog,
  suggestClassificationFromGoogleTypes,
} from '../../../constants/travelTaxonomy';
import {
  RECOMMENDATION_IMAGE_LONG_EDGE,
  TRAVEL_IMAGE_COMPRESSION,
} from '../../../constants/travelMedia';
import useRecommendationDraftMedia from '../../../hooks/useRecommendationDraftMedia';
import useExactPlaceSelection from '../../../hooks/useExactPlaceSelection';
import { useBackButton } from '../../../hooks/useBackButton';
import {
  colors,
  recommendationComposerStyles as styles,
  spacing,
} from '../../../styles';
import { findMediaAssetByUrl, getMediaVariantUrl } from '../../../utils/mediaAssets';
import { isValidExternalUrl, normalizeExternalUrl } from '../../../utils/externalUrl';
import { travelMediaErrorMessage } from '../../../utils/travelMediaErrors';
import {
  createTravelMediaDescriptor,
  queueMediaFromDescriptor,
  removedTravelMediaItems,
  travelMediaIdentity,
  travelMediaUri,
} from '../../../utils/travelMedia';
import { useRecommendationPublish } from '../publishing/RecommendationPublishContext';
import {
  discardRecommendationDraft,
  getCurrentRecommendationDraft,
  saveRecommendationDraft,
} from '../../../services/RecommendationService';
import { captureDiagnosticException } from '../../../services/ErrorReporting';
import ManualMapPinPicker from '../components/ManualMapPinPicker';
import SingleDestinationPicker from '../components/SingleDestinationPicker';
import { NoyaTourTarget, useNoyaTour } from '../../noya/NoyaTourContext';
import { NOYA_CREATOR_TARGETS } from '../../noya/NoyaTourDefinitions';

const SAVE_DELAY_MS = 2500;
const LOCATION_MODES = {
  exact: 'exact',
  destination: 'destination',
  pin: 'pin',
};
const OPTIONAL_FIELDS = [
  { id: 'contactName', label: 'איש קשר', placeholder: 'למשל: דנה מהקבלה או Alex 24/7', maxLength: 80, contentDirection: 'rtl' },
  { id: 'phone', label: 'טלפון', placeholder: 'למשל: +36 20 123 4567', keyboardType: 'phone-pad', maxLength: 40, contentDirection: 'ltr' },
  { id: 'externalUrl', label: 'קישור', placeholder: 'למשל: https://example.com', keyboardType: 'url', maxLength: 500, contentDirection: 'ltr' },
  { id: 'priceNote', label: 'מחיר', placeholder: 'למשל: כ־45 ש״ח לאדם', maxLength: 120, contentDirection: 'rtl' },
  { id: 'accessibilityNote', label: 'נגישות', placeholder: 'למשל: כניסה נגישה ומעלית', multiline: true, maxLength: 500, contentDirection: 'rtl' },
];

const categoryById = Object.fromEntries(RECOMMENDATION_CATEGORIES.map((item) => [item.id, item]));
const subcategoryById = Object.fromEntries(RECOMMENDATION_SUBCATEGORIES.map((item) => [item.id, item]));

export function recommendationContactInputDirection(value = '') {
  const normalized = String(value).trimStart();
  if (/[0-9]/.test(normalized)) return 'ltr';
  if (/^[A-Za-z]/.test(normalized)) return 'ltr';
  return 'rtl';
}

function FocusClearingFormInput({ placeholder, onFocus, onBlur, ...props }) {
  const [focused, setFocused] = useState(false);
  return (
    <FormInput
      {...props}
      placeholder={focused ? '' : placeholder}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
    />
  );
}

function cleanDetails(details) {
  return Object.fromEntries(Object.entries(details || {})
    .map(([key, value]) => [
      key,
      key === 'externalUrl'
        ? normalizeExternalUrl(value)
        : typeof value === 'string' ? value.trim() : '',
    ])
    .filter(([, value]) => value));
}

function normalizeManualCoordinate(value) {
  const lat = Number(value?.latitude ?? value?.lat);
  const lng = Number(value?.longitude ?? value?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

export function recommendationDraftResumeStep(draft, mediaItems = []) {
  if (!mediaItems.length) return 1;
  const locationMode = draft?.locationMode || LOCATION_MODES.exact;
  const hasDestination = Boolean(draft?.selectedCountry?.id && draft?.selectedCity?.id);
  const hasValidLocation = locationMode === LOCATION_MODES.exact
    ? hasDestination && Boolean(draft?.selectedPlace?.placeId)
    : hasDestination && (locationMode !== LOCATION_MODES.pin || Boolean(normalizeManualCoordinate(draft?.manualCoordinate)));
  if (!hasValidLocation) return 2;
  if (!isRecommendationClassificationValid({
    categoryId: draft?.categoryId || '',
    subcategoryIds: Array.isArray(draft?.subcategoryIds) ? draft.subcategoryIds : [],
    customSubcategoryLabel: draft?.customSubcategoryLabel || '',
  })) return 3;
  return 4;
}

export function mergeRecommendationDraftMedia(remoteItems = [], localItems = [], order = []) {
  const allItems = [...remoteItems, ...localItems].filter(Boolean);
  const itemsByIdentity = new Map(allItems.map((item) => [travelMediaIdentity(item), item]));
  const merged = [];
  const seen = new Set();
  (order || []).forEach((identity) => {
    const item = itemsByIdentity.get(String(identity));
    if (!item || seen.has(String(identity))) return;
    seen.add(String(identity));
    merged.push(item);
  });
  allItems.forEach((item) => {
    const identity = travelMediaIdentity(item);
    if (!identity || seen.has(identity)) return;
    seen.add(identity);
    merged.push(item);
  });
  return merged.slice(0, 5);
}

function classificationSummary(categoryId, subcategoryIds) {
  const labels = (subcategoryIds || []).map((id) => subcategoryById[id]?.label).filter(Boolean);
  return labels.length ? labels.join(' · ') : categoryById[categoryId]?.label || '';
}

function placeFingerprint(place) {
  if (!place || typeof place !== 'object') return '';
  const coordinate = normalizeManualCoordinate(place.coordinates || place.geometry?.location);
  return [
    place.placeId || place.place_id || '',
    place.resolvedPlaceToken || '',
    place.name || '',
    coordinate?.lat ?? '',
    coordinate?.lng ?? '',
  ].join('|');
}

function catalogFormComparable({
  locationMode,
  selectedCountry,
  selectedCity,
  selectedPlace,
  manualCoordinate,
  categoryId,
  subcategoryIds,
  customSubcategoryLabel,
  title,
  description,
  budget,
  details,
  eventSchedule,
  imageUris,
}) {
  const coordinate = normalizeManualCoordinate(manualCoordinate);
  return JSON.stringify({
    locationMode,
    countryId: selectedCountry?.id || '',
    cityId: selectedCity?.id || '',
    place: placeFingerprint(selectedPlace),
    manualCoordinate: coordinate ? `${coordinate.lat}|${coordinate.lng}` : '',
    categoryId,
    subcategoryIds: [...(subcategoryIds || [])].sort(),
    customSubcategoryLabel: customSubcategoryLabel.trim(),
    title,
    description,
    budget,
    details: cleanDetails(details),
    eventSchedule: eventSchedule.trim(),
    imageUris: [...(imageUris || [])],
  });
}

function draftSnapshotComparable(formComparable, { step, generalDestination, locationQuery }) {
  return JSON.stringify({
    formComparable,
    step,
    generalDestination: generalDestination ? {
      countryId: generalDestination.countryId || '',
      cityId: generalDestination.cityId || '',
      key: generalDestination.key || '',
    } : null,
    locationQuery: locationQuery || '',
  });
}

export default function CreateRecommendationScreen({ navigation, route }) {
  const editItem = route?.params?.item ?? route?.params?.recommendation ?? null;
  const requestedIsEdit = route?.params?.mode === 'edit' && Number(editItem?.recommendationCatalogVersion || 0) > 0;
  const requestedEditPostId = requestedIsEdit ? route?.params?.postId || editItem?.id || null : null;
  const publishJobId = requestedIsEdit ? null : route?.params?.publishJobId || null;
  const { endReview, enqueueCreate, loadJobForReview } = useRecommendationPublish();
  const {
    bindDraft,
    clearDraft: clearDraftMedia,
    clearStaleDraft,
    forgetMedia: forgetDurableImage,
    persistMedia: persistDraftMedia,
    restoreDraft: restoreDraftMedia,
    waitForMedia: waitForDraftMedia,
  } = useRecommendationDraftMedia();
  const { requestCreatorStep } = useNoyaTour();

  const [mode, setMode] = useState('loading');
  const [loadError, setLoadError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [existingDraft, setExistingDraft] = useState(null);
  const [draftId, setDraftId] = useState('');
  const [sourceRecommendationId, setSourceRecommendationId] = useState(requestedEditPostId || '');
  const [sourceMedia, setSourceMedia] = useState(Array.isArray(editItem?.media) ? editItem.media : []);
  const [saveStatus, setSaveStatus] = useState('saved');
  const [saveError, setSaveError] = useState('');
  const [missingLocalMediaCount, setMissingLocalMediaCount] = useState(0);
  const [step, setStep] = useState(1);
  const [locationMode, setLocationMode] = useState(LOCATION_MODES.exact);
  const [generalDestination, setGeneralDestination] = useState(null);
  const [manualCoordinate, setManualCoordinate] = useState(null);
  const [categoryId, setCategoryId] = useState('');
  const [subcategoryIds, setSubcategoryIds] = useState([]);
  const [customSubcategoryLabel, setCustomSubcategoryLabel] = useState('');
  const [showAllSubcategories, setShowAllSubcategories] = useState(false);
  const [subcategorySearch, setSubcategorySearch] = useState('');
  const [dismissedSuggestion, setDismissedSuggestion] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [budget, setBudget] = useState('');
  const [details, setDetails] = useState({});
  const [activeOptionalField, setActiveOptionalField] = useState('');
  const [eventSchedule, setEventSchedule] = useState('');
  const [editableMedia, setEditableMedia] = useState([]);
  const [showAlternativeLocations, setShowAlternativeLocations] = useState(false);
  const [validationMessage, setValidationMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [mediaReorderActive, setMediaReorderActive] = useState(false);
  const [editSnapshotBaseline, setEditSnapshotBaseline] = useState(null);
  const hydratedEditIdRef = useRef(null);
  const scrollViewRef = useRef(null);
  const sectionOffsetsRef = useRef({});
  const titleEditedByUserRef = useRef(false);
  const classificationEditedByUserRef = useRef(false);
  const lastAutofilledTitleRef = useRef('');
  const adjustedExactLocationRef = useRef(null);
  const dirtyRef = useRef(false);
  const draftIdRef = useRef('');
  const versionRef = useRef(0);
  const sourceRecommendationIdRef = useRef(requestedEditPostId || '');
  const lastSavedComparableRef = useRef('');
  const saveQueueRef = useRef(Promise.resolve());
  const pendingSaveRequestRef = useRef(null);
  const latestDraftRef = useRef(null);
  const latestComparableRef = useRef('');
  const allowLeaveRef = useRef(false);
  const leavePromptOpenRef = useRef(false);
  const pauseAutosaveRef = useRef(false);
  const publishHandoffRef = useRef(false);
  const discardInFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const isEdit = Boolean(sourceRecommendationId);
  const editPostId = sourceRecommendationId || null;

  useEffect(() => {
    if (mode !== 'editor' || isEdit || publishJobId) return;
    requestCreatorStep('recommendation', 0);
  }, [isEdit, mode, publishJobId, requestCreatorStep]);

  const {
    chooseAnotherLocation,
    chooseDestination,
    chooseFallbackDestination,
    destinationChoice,
    googleSearchFn,
    handleSelectGooglePlace,
    hydrateSelection,
    locationQuery,
    locationResolveError,
    locationResolveRetryable,
    pendingLocation,
    resolvingPreview,
    clearSelectionForTyping: onChangeLocationQuery,
    resolvingLocation,
    retryLocationResolution,
    selectedCity,
    selectedCountry,
    selectedPlace,
  } = useExactPlaceSelection();

  const selectedCategory = categoryById[categoryId] || null;
  const selectedOther = subcategoryIds.some((id) => subcategoryById[id]?.isOther);
  const classificationSuggestions = useMemo(() => {
    if (locationMode !== LOCATION_MODES.exact || dismissedSuggestion || !selectedPlace?.placeId) return [];
    return suggestClassificationFromGoogleTypes({
      placeId: selectedPlace.placeId,
      primaryType: selectedPlace.primaryType || selectedPlace.primary_type || '',
      types: selectedPlace.types || [],
    });
  }, [dismissedSuggestion, locationMode, selectedPlace]);

  const primarySuggestion = classificationSuggestions[0] || null;
  const applyPlaceAutofill = useCallback((resolvedLocation) => {
    const place = resolvedLocation?.place;
    if (!place) return;
    const placeTitle = String(place.name || '').trim();
    if (placeTitle && !titleEditedByUserRef.current && (
      !title.trim() || title === lastAutofilledTitleRef.current
    )) {
      setTitle(placeTitle);
      lastAutofilledTitleRef.current = placeTitle;
    }
    if (!classificationEditedByUserRef.current) {
      const [suggestion] = suggestClassificationFromGoogleTypes({
        placeId: place.placeId,
        primaryType: place.primaryType || place.primary_type || '',
        types: place.types || [],
      });
      if (suggestion) {
        setCategoryId(suggestion.categoryId);
        setSubcategoryIds(suggestion.subcategoryIds);
        setCustomSubcategoryLabel('');
        setDismissedSuggestion(true);
      }
    }
  }, [title]);

  const selectExactPlace = useCallback(async (selection) => {
    const resolved = await handleSelectGooglePlace(selection, { autoConfirm: true });
    if (resolved) {
      applyPlaceAutofill(resolved);
      setShowAlternativeLocations(false);
      setValidationMessage('');
      adjustedExactLocationRef.current = null;
    }
    return resolved;
  }, [applyPlaceAutofill, handleSelectGooglePlace]);

  const selectResolvedDestination = useCallback(async (choiceId) => {
    const resolved = await chooseDestination(choiceId, { autoConfirm: true });
    if (resolved) {
      applyPlaceAutofill(resolved);
      setShowAlternativeLocations(false);
      setValidationMessage('');
    }
    return resolved;
  }, [applyPlaceAutofill, chooseDestination]);

  const selectFallbackDestination = useCallback(async (destination) => {
    const resolved = await chooseFallbackDestination(destination, { autoConfirm: true });
    if (resolved) {
      applyPlaceAutofill(resolved);
      setShowAlternativeLocations(false);
      setValidationMessage('');
    }
    return resolved;
  }, [applyPlaceAutofill, chooseFallbackDestination]);

  const retryExactLocation = useCallback(async () => {
    const resolved = await retryLocationResolution({ autoConfirm: true });
    if (resolved) {
      applyPlaceAutofill(resolved);
      setShowAlternativeLocations(false);
      setValidationMessage('');
    }
    return resolved;
  }, [applyPlaceAutofill, retryLocationResolution]);
  const popularSubcategories = useMemo(() => (
    (selectedCategory?.popularSubcategoryIds || [])
      .map((id) => subcategoryById[id])
      .filter(Boolean)
  ), [selectedCategory]);
  const allCategorySubcategories = useMemo(() => (
    RECOMMENDATION_SUBCATEGORIES.filter((item) => item.categoryId === categoryId)
  ), [categoryId]);
  const visibleSubcategories = useMemo(() => {
    if (!showAllSubcategories) return popularSubcategories;
    if (!subcategorySearch.trim()) return allCategorySubcategories;
    return searchRecommendationCatalog(subcategorySearch, { categoryId, limit: 50 });
  }, [allCategorySubcategories, categoryId, popularSubcategories, showAllSubcategories, subcategorySearch]);

  const editableImageUris = useMemo(() => editableMedia.map(travelMediaUri).filter(Boolean), [editableMedia]);

  const formComparable = useMemo(() => catalogFormComparable({
    locationMode,
    selectedCountry,
    selectedCity,
    selectedPlace,
    manualCoordinate,
    categoryId,
    subcategoryIds,
    customSubcategoryLabel,
    title,
    description,
    budget,
    details,
    eventSchedule,
    imageUris: editableImageUris,
  }), [
    categoryId,
    customSubcategoryLabel,
    description,
    budget,
    details,
    editableImageUris,
    eventSchedule,
    locationMode,
    manualCoordinate,
    selectedCity,
    selectedCountry,
    selectedPlace,
    subcategoryIds,
    title,
  ]);
  const draftComparable = useMemo(() => draftSnapshotComparable(formComparable, {
    step,
    generalDestination,
    locationQuery,
  }), [formComparable, generalDestination, locationQuery, step]);
  const createDirty = Boolean(
    title.trim() || description.trim() || budget || categoryId || subcategoryIds.length ||
    selectedCountry?.id || generalDestination?.cityId || editableImageUris.length ||
    locationQuery.trim() || Object.keys(cleanDetails(details)).length || eventSchedule.trim()
  );
  const dirty = isEdit
    ? Boolean(editSnapshotBaseline && editSnapshotBaseline !== formComparable)
    : createDirty;
  dirtyRef.current = dirty;
  const serverMedia = useMemo(() => editableImageUris
    .map((uri) => findMediaAssetByUrl(sourceMedia, uri))
    .filter(Boolean), [editableImageUris, sourceMedia]);
  const draftPayload = useMemo(() => ({
    step,
    locationMode,
    generalDestination,
    manualCoordinate,
    selectedCountry,
    selectedCity,
    selectedPlace,
    locationQuery,
    categoryId,
    subcategoryIds,
    customSubcategoryLabel,
    title,
    description,
    budget,
    details,
    eventSchedule,
    media: serverMedia,
    localMediaCount: Math.max(0, editableImageUris.length - serverMedia.length),
  }), [
    budget, categoryId, customSubcategoryLabel, description, details, editableImageUris.length,
    eventSchedule, generalDestination, locationMode, locationQuery, manualCoordinate, selectedCity,
    selectedCountry, selectedPlace, serverMedia, step, subcategoryIds, title,
  ]);
  latestDraftRef.current = draftPayload;
  latestComparableRef.current = draftComparable;
  const compatibilityStep = recommendationDraftResumeStep(draftPayload, editableMedia);

  useEffect(() => {
    setStep((current) => current === compatibilityStep ? current : compatibilityStep);
  }, [compatibilityStep]);

  const persistSnapshot = useCallback((snapshot, comparable, {
    force = false,
    allowDuringPublish = false,
  } = {}) => {
    saveQueueRef.current = saveQueueRef.current.catch(() => versionRef.current).then(async () => {
      if (publishHandoffRef.current && !allowDuringPublish) return versionRef.current;
      const shouldCreate = !draftIdRef.current && Boolean(sourceRecommendationIdRef.current || comparable);
      if ((!draftIdRef.current && !shouldCreate) || (!force && comparable === lastSavedComparableRef.current)) {
        return versionRef.current;
      }
      if (mountedRef.current) { setSaveStatus('saving'); setSaveError(''); }
      const pendingRequest = pendingSaveRequestRef.current?.comparable === comparable
        ? pendingSaveRequestRef.current
        : { comparable, saveRequestId: randomUUID() };
      pendingSaveRequestRef.current = pendingRequest;
      try {
        const savePayload = {
          ...(draftIdRef.current ? { draftId: draftIdRef.current, expectedVersion: versionRef.current } : {}),
          sourceRecommendationId: sourceRecommendationIdRef.current || null,
          saveRequestId: pendingRequest.saveRequestId,
          draft: snapshot,
        };
        let saved;
        try {
          saved = await saveRecommendationDraft(savePayload);
        } catch (error) {
          if (error?.details?.reason !== 'RECOMMENDATION_DRAFT_VERSION_CONFLICT' || !draftIdRef.current) {
            throw error;
          }
          let current;
          try {
            current = await getCurrentRecommendationDraft();
          } catch {
            throw error;
          }
          const currentVersion = Number(current?.version);
          const sameDraft = current?.id === draftIdRef.current &&
            (current?.sourceRecommendationId || '') === (sourceRecommendationIdRef.current || '');
          if (!sameDraft || !Number.isSafeInteger(currentVersion) || currentVersion < 1) throw error;
          versionRef.current = currentVersion;
          saved = await saveRecommendationDraft({
            ...savePayload,
            draftId: draftIdRef.current,
            expectedVersion: currentVersion,
          });
        }
        draftIdRef.current = saved.draftId;
        versionRef.current = saved.version;
        lastSavedComparableRef.current = comparable;
        pendingSaveRequestRef.current = null;
        await bindDraft(saved.draftId);
        if (mountedRef.current) {
          setDraftId(saved.draftId);
          setSaveStatus('saved');
        }
        return saved.version;
      } catch (error) {
        if (mountedRef.current) {
          setSaveStatus('error');
          setSaveError(error?.details?.reason === 'RECOMMENDATION_DRAFT_VERSION_CONFLICT'
            ? 'הטיוטה השתנתה במקום אחר. כדאי לפתוח אותה מחדש.'
            : 'לא הצלחנו לשמור. השינויים נשארו במסך ואפשר לנסות שוב.');
        }
        throw error;
      }
    });
    return saveQueueRef.current;
  }, [bindDraft]);

  const handleMediaReorderInteractionChange = useCallback((active) => {
    setMediaReorderActive(Boolean(active));
  }, []);

  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', () => {
      setKeyboardVisible(true);
    });
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardVisible(false);
    });
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const finishLeave = useCallback((action = null) => {
    leavePromptOpenRef.current = false;
    allowLeaveRef.current = true;
    if (action && typeof navigation.dispatch === 'function') navigation.dispatch(action);
    else navigation.goBack();
  }, [navigation]);

  const resumeEditing = useCallback(() => {
    leavePromptOpenRef.current = false;
    pauseAutosaveRef.current = false;
  }, []);

  const discardCurrentDraftAndLeave = useCallback(async (action = null) => {
    if (discardInFlightRef.current) return;
    discardInFlightRef.current = true;
    leavePromptOpenRef.current = false;
    pauseAutosaveRef.current = true;
    setSubmitting(true);
    setSaveStatus('discarding');
    const completeDiscard = async () => {
      try {
        await clearDraftMedia({ deleteFiles: true });
      } catch (error) {
        captureDiagnosticException(error, {
          operation: 'cleanup_recommendation_draft_media',
          code: error?.code || 'unknown',
          reason: error?.details?.reason || 'local_cleanup_failed',
          contentMode: latestDraftRef.current?.locationMode,
        });
      }
      draftIdRef.current = '';
      versionRef.current = 0;
      setDraftId('');
      finishLeave(action);
    };
    try {
      await saveQueueRef.current.catch(() => versionRef.current);
      if (draftIdRef.current) await discardRecommendationDraft(draftIdRef.current);
      await completeDiscard();
    } catch (error) {
      if (error?.details?.reason === 'RECOMMENDATION_DRAFT_NOT_FOUND') {
        await completeDiscard();
        return;
      }
      captureDiagnosticException(error, {
        operation: 'discard_recommendation_draft',
        code: error?.code || 'unknown',
        reason: error?.details?.reason || 'unknown',
        contentMode: latestDraftRef.current?.locationMode,
      });
      discardInFlightRef.current = false;
      pauseAutosaveRef.current = false;
      setSubmitting(false);
      setSaveStatus('saved');
      Alert.alert('לא הצלחנו לוותר על השינויים', 'ההמלצה לא נסגרה כדי שהשינויים לא יישארו בטעות. אפשר לנסות שוב.', [
        { text: 'המשך עריכה', style: 'cancel', onPress: resumeEditing },
        { text: 'ניסיון נוסף', onPress: () => discardCurrentDraftAndLeave(action) },
      ]);
    }
  }, [clearDraftMedia, finishLeave, resumeEditing]);

  const keepDraftAndLeave = useCallback(async (action = null) => {
    leavePromptOpenRef.current = false;
    pauseAutosaveRef.current = true;
    try {
      await persistSnapshot(latestDraftRef.current, latestComparableRef.current);
      finishLeave(action);
    } catch (error) {
      if (error?.details?.reason === 'RECOMMENDATION_DRAFT_VERSION_CONFLICT' && draftIdRef.current) {
        try {
          const current = await getCurrentRecommendationDraft();
          const currentVersion = Number(current?.version);
          const sameDraft = current?.id === draftIdRef.current &&
            (current?.sourceRecommendationId || '') === (sourceRecommendationIdRef.current || '');
          if (!sameDraft || !Number.isSafeInteger(currentVersion) || currentVersion < 1) throw error;
          versionRef.current = currentVersion;
          pendingSaveRequestRef.current = null;
          await persistSnapshot(latestDraftRef.current, latestComparableRef.current, { force: true });
          finishLeave(action);
          return;
        } catch {
          // Fall through to the existing recovery choices without losing screen state.
        }
      }
      pauseAutosaveRef.current = false;
      Alert.alert('לא הצלחנו לשמור את הטיוטה', 'השינויים עדיין מופיעים במסך. אפשר לנסות שוב או לוותר עליהם.', [
        { text: 'המשך עריכה', style: 'cancel', onPress: resumeEditing },
        { text: 'ויתור על השינויים', style: 'destructive', onPress: () => discardCurrentDraftAndLeave(action) },
        { text: 'ניסיון נוסף', onPress: () => keepDraftAndLeave(action) },
      ]);
    }
  }, [discardCurrentDraftAndLeave, finishLeave, persistSnapshot, resumeEditing]);

  const requestLeave = useCallback((action = null) => {
    Keyboard.dismiss();
    if (discardInFlightRef.current) return;
    if (publishHandoffRef.current) {
      if (leavePromptOpenRef.current) return;
      leavePromptOpenRef.current = true;
      const closeNotice = () => { leavePromptOpenRef.current = false; };
      Alert.alert(
        'ההמלצה עוברת לפרסום',
        'כבר התחלנו לשמור ולפרסם אותה. נחזור לקהילה כשהמסירה תושלם.',
        [{ text: 'הבנתי', onPress: closeNotice }],
        { cancelable: true, onDismiss: closeNotice }
      );
      return;
    }
    if (mode !== 'editor' || (!draftIdRef.current && !dirty)) {
      finishLeave(action);
      return;
    }
    if (leavePromptOpenRef.current) return;
    leavePromptOpenRef.current = true;
    pauseAutosaveRef.current = true;
    Alert.alert(
      isEdit ? 'יש שינויים שלא פורסמו' : 'ההמלצה עדיין בתהליך',
      'מה תרצו לעשות לפני היציאה?',
      [
        { text: 'המשך עריכה', style: 'cancel', onPress: resumeEditing },
        { text: 'ויתור על השינויים ויציאה', style: 'destructive', onPress: () => discardCurrentDraftAndLeave(action) },
        { text: 'שמירת טיוטה ויציאה', onPress: () => keepDraftAndLeave(action) },
      ],
      { cancelable: true, onDismiss: resumeEditing }
    );
  }, [dirty, discardCurrentDraftAndLeave, finishLeave, isEdit, keepDraftAndLeave, mode, resumeEditing]);
  useBackButton(navigation, {
    title: isEdit ? 'עריכת המלצה' : 'המלצה חדשה',
    onPress: () => requestLeave(),
  });

  useEffect(() => navigation.addListener?.('beforeRemove', (event) => {
    if (allowLeaveRef.current || mode !== 'editor') return;
    event.preventDefault?.();
    requestLeave(event.data?.action || null);
  }), [mode, navigation, requestLeave]);

  useEffect(() => {
    if (mode !== 'editor' || (!draftId && !dirty) || draftComparable === lastSavedComparableRef.current) return undefined;
    const timer = setTimeout(() => {
      if (!pauseAutosaveRef.current) persistSnapshot(draftPayload, draftComparable).catch(() => {});
    }, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [dirty, draftComparable, draftId, draftPayload, mode, persistSnapshot]);

  useEffect(() => {
    if (mode !== 'editor') return undefined;
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (!['inactive', 'background'].includes(nextState)) return;
      if (pauseAutosaveRef.current || (!draftIdRef.current && !dirtyRef.current)) return;
      persistSnapshot(latestDraftRef.current, latestComparableRef.current).catch(() => {});
    });
    return () => subscription.remove();
  }, [mode, persistSnapshot]);

  useEffect(() => () => {
    mountedRef.current = false;
    if (publishJobId && !publishHandoffRef.current && typeof endReview === 'function') {
      endReview(publishJobId);
    }
  }, [endReview, publishJobId]);

  useEffect(() => {
    if (!isEdit || !editItem || !editPostId || hydratedEditIdRef.current === editPostId) return;
    const initialMode = editItem.locationMode === LOCATION_MODES.pin || editItem.place?.source === 'manual_pin'
      ? LOCATION_MODES.pin
      : editItem.locationMode === LOCATION_MODES.destination || !editItem.place?.placeId
        ? LOCATION_MODES.destination
        : LOCATION_MODES.exact;
    const country = editItem.destination?.countryId
      ? { id: editItem.destination.countryId, name: editItem.destination.countryName || editItem.destination.countryId }
      : null;
    const city = editItem.destination?.cityId
      ? { id: editItem.destination.cityId, name: editItem.destination.cityName || editItem.destination.cityId }
      : null;
    const general = country?.id && city?.id && initialMode !== LOCATION_MODES.exact
      ? {
          key: `city:${country.id}:${city.id}`,
          kind: 'city',
          countryId: country.id,
          cityId: city.id,
          countryName: country.name,
          name: city.name,
          coordinates: editItem.place?.coordinates || null,
        }
      : null;
    const place = initialMode === LOCATION_MODES.exact ? editItem.place || null : null;
    const coordinate = initialMode === LOCATION_MODES.pin
      ? normalizeManualCoordinate(editItem.place?.coordinates || editItem.place?.geometry?.location)
      : null;
    const imageUris = (Array.isArray(editItem.media) ? editItem.media : [])
      .map((asset) => getMediaVariantUrl(asset, 'feed'))
      .filter(Boolean);
    const initialDetails = { ...(editItem.details || {}) };
    const initialSchedule = initialDetails.eventSchedule || '';
    delete initialDetails.eventSchedule;

    setLocationMode(initialMode);
    setGeneralDestination(general);
    setManualCoordinate(coordinate);
    setCategoryId(editItem.categoryId || '');
    setSubcategoryIds(Array.isArray(editItem.subcategoryIds) ? editItem.subcategoryIds : []);
    setCustomSubcategoryLabel(editItem.customSubcategoryLabel || '');
    setTitle(editItem.title || '');
    classificationEditedByUserRef.current = Boolean(editItem.categoryId);
    titleEditedByUserRef.current = Boolean(editItem.title);
    lastAutofilledTitleRef.current = '';
    setDescription(editItem.description || '');
    setBudget(editItem.budget || '');
    setDetails(cleanDetails(initialDetails));
    setEventSchedule(initialSchedule);
    setSourceMedia(Array.isArray(editItem.media) ? editItem.media : []);
    setEditableMedia(imageUris.map((uri) => createTravelMediaDescriptor({
      uri,
      asset: findMediaAssetByUrl(editItem.media, uri),
    })).filter(Boolean));
    hydrateSelection({
      country,
      city,
      place,
      query: place?.name || city?.name || '',
    });
    setEditSnapshotBaseline(catalogFormComparable({
      locationMode: initialMode,
      selectedCountry: country,
      selectedCity: city,
      selectedPlace: place,
      manualCoordinate: coordinate,
      categoryId: editItem.categoryId || '',
      subcategoryIds: Array.isArray(editItem.subcategoryIds) ? editItem.subcategoryIds : [],
      customSubcategoryLabel: editItem.customSubcategoryLabel || '',
      title: editItem.title || '',
      description: editItem.description || '',
      budget: editItem.budget || '',
      details: initialDetails,
      eventSchedule: initialSchedule,
      imageUris,
    }));
    hydratedEditIdRef.current = editPostId;
  }, [editItem, editPostId, hydrateSelection, isEdit]);

  useEffect(() => {
    const prefill = route?.params?.prefillLocation;
    if (isEdit || !prefill?.place?.placeId || !prefill?.destination) return;
    setLocationMode(LOCATION_MODES.exact);
    hydrateSelection({
      country: prefill.destination.country || null,
      city: prefill.destination.city || null,
      place: prefill.place,
      query: prefill.place.name || prefill.destination.city?.name || '',
    });
    applyPlaceAutofill({ place: prefill.place });
  }, [applyPlaceAutofill, hydrateSelection, isEdit, route?.params?.prefillLocation]);

  const hydrateServerDraft = useCallback(async (draft, { orderedItems = null } = {}) => {
    const remoteMedia = Array.isArray(draft.media) ? draft.media : [];
    const remoteItems = remoteMedia.map((asset) => createTravelMediaDescriptor({
      asset,
      id: asset.assetId,
      sourceId: asset.assetId,
      uri: getMediaVariantUrl(asset, 'feed'),
    })).filter(Boolean);
    const restored = orderedItems == null
      ? await restoreDraftMedia(draft.id, draft.localMediaCount)
      : { items: orderedItems, order: orderedItems.map(travelMediaIdentity), missingCount: 0 };
    const mediaItems = orderedItems == null
      ? mergeRecommendationDraftMedia(remoteItems, restored.items || [], restored.order || [])
      : orderedItems.slice(0, 5);
    const imageUris = mediaItems.map(travelMediaUri);
    const nextSourceId = draft.sourceRecommendationId || '';
    draftIdRef.current = draft.id || '';
    versionRef.current = Number(draft.version || 0);
    sourceRecommendationIdRef.current = nextSourceId;
    setDraftId(draftIdRef.current);
    setSourceRecommendationId(nextSourceId);
    setSourceMedia(remoteMedia);
    setMissingLocalMediaCount(restored.missingCount || 0);
    const resumeStep = recommendationDraftResumeStep(draft, mediaItems);
    setStep(resumeStep);
    setLocationMode(draft.locationMode || LOCATION_MODES.exact);
    setGeneralDestination(draft.generalDestination || null);
    setManualCoordinate(draft.manualCoordinate || null);
    setCategoryId(draft.categoryId || '');
    setSubcategoryIds(Array.isArray(draft.subcategoryIds) ? draft.subcategoryIds : []);
    setCustomSubcategoryLabel(draft.customSubcategoryLabel || '');
    setTitle(draft.title || '');
    classificationEditedByUserRef.current = Boolean(draft.categoryId);
    titleEditedByUserRef.current = Boolean(draft.title);
    lastAutofilledTitleRef.current = '';
    setDescription(draft.description || '');
    setBudget(draft.budget || '');
    setDetails(cleanDetails(draft.details));
    setEventSchedule(draft.eventSchedule || '');
    setEditableMedia(mediaItems);
    hydrateSelection({
      country: draft.selectedCountry || null,
      city: draft.selectedCity || null,
      place: draft.selectedPlace || null,
      query: draft.locationQuery || draft.selectedPlace?.name || '',
    });
    const comparable = catalogFormComparable({
      locationMode: draft.locationMode || LOCATION_MODES.exact,
      selectedCountry: draft.selectedCountry || null,
      selectedCity: draft.selectedCity || null,
      selectedPlace: draft.selectedPlace || null,
      manualCoordinate: draft.manualCoordinate || null,
      categoryId: draft.categoryId || '',
      subcategoryIds: draft.subcategoryIds || [],
      customSubcategoryLabel: draft.customSubcategoryLabel || '',
      title: draft.title || '',
      description: draft.description || '',
      budget: draft.budget || '',
      details: draft.details || {},
      eventSchedule: draft.eventSchedule || '',
      imageUris,
    });
    lastSavedComparableRef.current = draftSnapshotComparable(comparable, {
      step: resumeStep,
      generalDestination: draft.generalDestination || null,
      locationQuery: draft.locationQuery || draft.selectedPlace?.name || '',
    });
    setEditSnapshotBaseline(nextSourceId ? comparable : null);
    setSaveStatus('saved');
    setSaveError('');
    publishHandoffRef.current = false;
    pauseAutosaveRef.current = false;
    leavePromptOpenRef.current = false;
    setMode('editor');
  }, [hydrateSelection, restoreDraftMedia]);

  useEffect(() => {
    let active = true;
    mountedRef.current = true;
    const open = async () => {
      setLoadError('');
      if (publishJobId && typeof loadJobForReview === 'function') {
        const job = await loadJobForReview(publishJobId);
        if (job?.draft && job?.payload?.draftId) {
          await hydrateServerDraft({
            ...job.draft,
            id: job.payload.draftId,
            version: job.payload.expectedVersion,
            sourceRecommendationId: job.payload.sourceRecommendationId || job.draft.sourceRecommendationId || null,
          }, {
            orderedItems: (job.materializedMedia || [])
              .map((entry) => createTravelMediaDescriptor(entry))
              .filter(Boolean),
          });
          return;
        }
      }
      const current = await getCurrentRecommendationDraft();
      if (!active) return;
      if (current) {
        if (requestedEditPostId && current.sourceRecommendationId === requestedEditPostId) {
          await hydrateServerDraft(current);
        } else if (requestedEditPostId) {
          setExistingDraft(current);
          setMode('switchChoice');
        } else {
          setExistingDraft(current);
          setMode('choice');
        }
      } else {
        await clearStaleDraft();
        if (active) setMode('editor');
      }
    };
    open().catch((error) => {
      console.error('recommendation_draft_load_failed', { code: error?.code || 'unknown' });
      if (active) {
        setLoadError('לא הצלחנו לבדוק אם קיימת המלצה בתהליך. אפשר לנסות שוב.');
        setMode('loadError');
      }
    });
    return () => { active = false; };
  }, [clearStaleDraft, hydrateServerDraft, loadAttempt, loadJobForReview, publishJobId, requestedEditPostId]);

  const switchLocationMode = useCallback((nextMode) => {
    setLocationMode(nextMode);
    setValidationMessage('');
    setDismissedSuggestion(false);
    if (nextMode === LOCATION_MODES.exact) {
      setGeneralDestination(null);
      setManualCoordinate(null);
      return;
    }
    if (locationMode === LOCATION_MODES.exact) {
      hydrateSelection({ country: null, city: null, place: null, query: '' });
    } else if (generalDestination?.countryId && generalDestination?.cityId) {
      if (nextMode === LOCATION_MODES.pin && !generalDestination.coordinates && !generalDestination.viewport) {
        setGeneralDestination(null);
        hydrateSelection({ country: null, city: null, place: null, query: '' });
        setValidationMessage('כדי לסמן נקודה במפה, כדאי לבחור שוב את העיר או האזור.');
      } else {
        hydrateSelection({
          country: {
            id: generalDestination.countryId,
            name: generalDestination.countryName || generalDestination.countryId,
          },
          city: {
            id: generalDestination.cityId,
            name: generalDestination.name || generalDestination.cityId,
          },
          place: null,
          query: generalDestination.label || generalDestination.name || '',
        });
      }
    }
    if (nextMode !== LOCATION_MODES.pin) setManualCoordinate(null);
  }, [generalDestination, hydrateSelection, locationMode]);

  const adjustExactLocation = useCallback(() => {
    const coordinate = normalizeManualCoordinate(selectedPlace?.coordinates || selectedPlace?.geometry?.location);
    if (!coordinate || !selectedCountry?.id || !selectedCity?.id) return;
    adjustedExactLocationRef.current = {
      country: selectedCountry,
      city: selectedCity,
      place: selectedPlace,
      query: locationQuery,
    };
    const destination = {
      key: `city:${selectedCountry.id}:${selectedCity.id}`,
      kind: 'city',
      countryId: selectedCountry.id,
      cityId: selectedCity.id,
      countryName: selectedCountry.name,
      name: selectedCity.name,
      coordinates: { latitude: coordinate.lat, longitude: coordinate.lng },
    };
    setGeneralDestination(destination);
    setManualCoordinate({ latitude: coordinate.lat, longitude: coordinate.lng });
    setLocationMode(LOCATION_MODES.pin);
    setShowAlternativeLocations(true);
    hydrateSelection({ country: selectedCountry, city: selectedCity, place: null, query: selectedCity.name || '' });
    setValidationMessage('');
  }, [hydrateSelection, locationQuery, selectedCity, selectedCountry, selectedPlace]);

  const restoreExactLocation = useCallback(() => {
    const previous = adjustedExactLocationRef.current;
    if (!previous) return;
    setLocationMode(LOCATION_MODES.exact);
    setGeneralDestination(null);
    setManualCoordinate(null);
    hydrateSelection(previous);
    setShowAlternativeLocations(false);
    setValidationMessage('');
  }, [hydrateSelection]);

  const chooseGeneralDestination = useCallback((destination) => {
    setGeneralDestination(destination);
    setManualCoordinate(null);
    setValidationMessage('');
    if (!destination) return;
    hydrateSelection({
      country: { id: destination.countryId, name: destination.countryName || destination.countryId },
      city: { id: destination.cityId, name: destination.name || destination.cityId },
      place: null,
      query: destination.label || destination.name || '',
    });
  }, [hydrateSelection]);

  const selectCategory = (nextCategoryId) => {
    classificationEditedByUserRef.current = true;
    setCategoryId(nextCategoryId);
    setSubcategoryIds([]);
    setCustomSubcategoryLabel('');
    setShowAllSubcategories(false);
    setSubcategorySearch('');
    setValidationMessage('');
  };

  const toggleSubcategory = (subcategoryId) => {
    classificationEditedByUserRef.current = true;
    setSubcategoryIds((current) => {
      const next = current.includes(subcategoryId)
        ? current.filter((id) => id !== subcategoryId)
        : current.length >= 3
          ? current
          : [...current, subcategoryId];
      if (!next.some((id) => subcategoryById[id]?.isOther)) setCustomSubcategoryLabel('');
      return next;
    });
    setValidationMessage('');
  };

  const applySuggestion = () => {
    if (!primarySuggestion) return;
    classificationEditedByUserRef.current = true;
    setCategoryId(primarySuggestion.categoryId);
    setSubcategoryIds(primarySuggestion.subcategoryIds);
    setCustomSubcategoryLabel('');
    setDismissedSuggestion(true);
  };

  const completeMediaSelection = (items) => {
    const nextItems = (items || []).slice(0, 5);
    removedTravelMediaItems(editableMedia, nextItems)
      .filter((item) => !item.asset)
      .forEach((item) => forgetDurableImage(item).catch(() => {}));
    setEditableMedia(nextItems);
    setValidationMessage('');
    setSaveError('');
    persistDraftMedia(nextItems).catch(() => {
      setSaveError('לא הצלחנו לשמור תמונה אחת במכשיר. אפשר לבחור אותה מחדש.');
    });
  };

  const validateStep = useCallback((targetStep) => {
    if (targetStep === 1) {
      if (!editableMedia.length) return 'כדאי לבחור לפחות תמונה אחת כדי להמשיך.';
    }
    if (targetStep === 2) {
      if (resolvingLocation || pendingLocation || destinationChoice) return 'כדאי להשלים את בחירת המיקום.';
      if (locationMode === LOCATION_MODES.exact && (
        !selectedPlace?.placeId || !selectedCountry?.id || !selectedCity?.id
      )) return 'כדאי לבחור תוצאה מדויקת מהחיפוש.';
      if (locationMode !== LOCATION_MODES.exact && (!selectedCountry?.id || !selectedCity?.id)) return 'כדאי לבחור עיר או אזור.';
      if (locationMode === LOCATION_MODES.pin && !normalizeManualCoordinate(manualCoordinate)) return 'כדאי לסמן נקודה תקינה במפה.';
    }
    if (targetStep === 3 && !isRecommendationClassificationValid({
      categoryId,
      subcategoryIds,
      customSubcategoryLabel,
    })) {
      if (!categoryId) return 'כדאי לבחור על מה ההמלצה.';
      if (!subcategoryIds.length) return 'כדאי לבחור לפחות אפשרות אחת שמתארת את ההמלצה.';
      if (selectedOther) return 'כדאי לכתוב שם קצר וברור לאפשרות האחרת.';
      return 'אפשר לבחור עד שלוש אפשרויות מאותה קטגוריה.';
    }
    if (targetStep === 4) {
      if (!title.trim()) return 'כדאי להוסיף שם קצר וברור.';
      if (!description.trim()) return 'כדאי להוסיף תיאור קצר עם הפרטים החשובים.';
      if (!budget) return 'כדאי לבחור מחיר.';
      if (!isValidExternalUrl(details.externalUrl)) {
        return 'כדאי להזין קישור מלא שמתחיל ב־http:// או https://.';
      }
      if (categoryId === 'events' && !eventSchedule.trim()) {
        return 'באירוע כדאי לציין מתי הוא מתקיים.';
      }
    }
    return '';
  }, [
    categoryId,
    customSubcategoryLabel,
    destinationChoice,
    locationMode,
    manualCoordinate,
    pendingLocation,
    resolvingLocation,
    selectedCity,
    selectedCountry,
    selectedOther,
    selectedPlace,
    subcategoryIds,
    title,
    description,
    eventSchedule,
    budget,
    editableMedia.length,
  ]);

  const firstValidationIssue = useCallback(() => {
    const photoMessage = validateStep(1);
    if (photoMessage) return { message: photoMessage, section: 'photos' };
    const locationMessage = validateStep(2);
    if (locationMessage) return { message: locationMessage, section: 'location' };
    if (!title.trim()) return { message: 'כדאי להוסיף שם קצר וברור.', section: 'story' };
    if (!description.trim()) return { message: 'כדאי להוסיף תיאור קצר עם הפרטים החשובים.', section: 'story' };
    const taxonomyMessage = validateStep(3);
    if (taxonomyMessage) return { message: taxonomyMessage, section: 'taxonomy' };
    if (!budget) return { message: 'כדאי לבחור מחיר.', section: 'taxonomy' };
    if (!isValidExternalUrl(details.externalUrl)) {
      return { message: 'כדאי להזין קישור מלא שמתחיל ב־http:// או https://.', section: 'optional' };
    }
    if (categoryId === 'events' && !eventSchedule.trim()) {
      return { message: 'באירוע כדאי לציין מתי הוא מתקיים.', section: 'optional' };
    }
    return null;
  }, [budget, categoryId, description, details.externalUrl, eventSchedule, title, validateStep]);

  const scrollToSection = useCallback((section) => {
    const y = sectionOffsetsRef.current[section];
    if (!Number.isFinite(y)) return;
    requestAnimationFrame(() => scrollViewRef.current?.scrollTo?.({ y: Math.max(0, y - spacing.md), animated: true }));
  }, []);

  const handleSubmit = async () => {
    Keyboard.dismiss();
    const issue = firstValidationIssue();
    setValidationMessage(issue?.message || '');
    if (issue) {
      scrollToSection(issue.section);
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    publishHandoffRef.current = true;
    pauseAutosaveRef.current = true;
    let handedOff = false;
    try {
      const version = await persistSnapshot(draftPayload, draftComparable, {
        force: true,
        allowDuringPublish: true,
      });
      const durableMedia = await waitForDraftMedia(editableMedia);
      await enqueueCreate({
        contentType: 'recommendation',
        sourceJobId: publishJobId,
        payload: {
          draftId: draftIdRef.current,
          expectedVersion: version,
          ...(sourceRecommendationIdRef.current
            ? { sourceRecommendationId: sourceRecommendationIdRef.current }
            : {}),
        },
        media: durableMedia.map(queueMediaFromDescriptor).filter(Boolean),
        draft: { ...draftPayload, sourceRecommendationId: sourceRecommendationIdRef.current || null },
      });
      handedOff = true;
      try {
        await clearDraftMedia({ deleteFiles: false, keepItems: durableMedia });
      } catch (error) {
        console.warn('recommendation_publish_handoff_cleanup_failed', {
          code: error?.code || 'unknown',
        });
      }
      allowLeaveRef.current = true;
      navigation.goBack();
    } catch (error) {
      if (!handedOff) {
        publishHandoffRef.current = false;
        pauseAutosaveRef.current = false;
      }
      console.error('Error queueing recommendation:', error);
      captureDiagnosticException(error, {
        operation: 'save_recommendation_for_publish',
        code: error?.code || 'unknown',
        reason: error?.details?.reason || 'unknown',
        contentMode: locationMode,
      });
      Alert.alert(
        'לא הצלחנו לשמור את ההמלצה',
        travelMediaErrorMessage(error) || 'אפשר לנסות שוב בעוד רגע.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const continueExistingDraft = async () => {
    if (!existingDraft) return;
    try {
      await hydrateServerDraft(existingDraft);
      setExistingDraft(null);
    } catch {
      Alert.alert('לא הצלחנו לפתוח את הטיוטה', 'אפשר לנסות שוב בעוד רגע.');
    }
  };

  const discardExistingDraft = async () => {
    if (!existingDraft?.id || submitting) return;
    setSubmitting(true);
    try {
      await discardRecommendationDraft(existingDraft.id);
      await clearDraftMedia({ deleteFiles: true });
      setExistingDraft(null);
      draftIdRef.current = '';
      versionRef.current = 0;
      setDraftId('');
      setMode('editor');
    } catch {
      Alert.alert('לא הצלחנו למחוק את הטיוטה', 'אפשר לנסות שוב בעוד רגע.');
    } finally {
      setSubmitting(false);
    }
  };

  const renderPhotoStep = () => (
    <NoyaTourTarget targetId={NOYA_CREATOR_TARGETS.recommendationPhotos}>
      <View style={styles.fieldStack}>
        <AppText style={[styles.fieldHint, styles.photoHint]}>
          אפשר להוסיף עד חמש תמונות. החלקה עוברת ביניהן; לחיצה ארוכה וגרירה משנה את הסדר.
        </AppText>
        <TravelMediaComposer
          embedded
          visible
          value={editableMedia}
          maxItems={5}
          aspect={[1, 1]}
          maxLongEdge={RECOMMENDATION_IMAGE_LONG_EDGE}
          compress={TRAVEL_IMAGE_COMPRESSION}
          addButtonTestID="recommendation-image-picker"
          onReorderInteractionChange={handleMediaReorderInteractionChange}
          onChange={completeMediaSelection}
        />
      </View>
    </NoyaTourTarget>
  );

  const renderLocationStep = () => (
    <NoyaTourTarget targetId={NOYA_CREATOR_TARGETS.recommendationLocation}>
      {(showAlternativeLocations || locationMode !== LOCATION_MODES.exact) ? (
        <View style={styles.modeActions}>
          {[
            { id: LOCATION_MODES.exact, label: 'מקום מדויק', icon: 'location-outline' },
            { id: LOCATION_MODES.destination, label: 'עיר או אזור', icon: 'map-outline' },
            { id: LOCATION_MODES.pin, label: 'נקודה במפה', icon: 'pin-outline' },
          ].map((mode) => {
            const selected = locationMode === mode.id;
            return (
              <TouchableOpacity
                key={mode.id}
                style={[styles.modeButton, selected && styles.modeButtonSelected]}
                onPress={() => switchLocationMode(mode.id)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                testID={`recommendation-location-mode-${mode.id}`}
              >
                <Ionicons name={mode.icon} size={18} color={colors.primary} />
                <AppText style={styles.modeButtonText}>{mode.label}</AppText>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}

      <View style={styles.locationPanel}>
        {locationMode === LOCATION_MODES.exact ? (
          <>
            <AppText style={styles.fieldLabel}>חיפוש מקום</AppText>
            <GooglePlacesInput
              mode="google"
              value={locationQuery}
              onChangeValue={onChangeLocationQuery}
              onSelect={(selection) => selectExactPlace(selection).catch(() => {})}
              googleSearchFn={googleSearchFn}
              googleFallbackDelayMs={3000}
              showSearchErrors={false}
              variant="form"
              error={Boolean(locationResolveError)}
              returnSelection
              clearPlaceholderOnFocus
              placeholder="למשל: Café Central, וינה"
              inputTestID="recommendation-exact-location-search"
            />
            {selectedPlace?.placeId ? (
              <View style={styles.confirmedLocation} testID="recommendation-confirmed-location">
                <View style={styles.confirmedLocationCopy}>
                  <View style={styles.confirmedLocationTitleRow}>
                    <Ionicons name="checkmark-circle" size={21} color={colors.success} />
                    <AppText style={styles.confirmedLocationTitle}>{selectedPlace.name || selectedPlace.address}</AppText>
                  </View>
                  {selectedPlace.address ? <AppText style={styles.confirmedLocationAddress}>{selectedPlace.address}</AppText> : null}
                </View>
                <ExactLocationMapPreview place={selectedPlace} title="המיקום שנבחר" locale="he" />
                {normalizeManualCoordinate(selectedPlace.coordinates || selectedPlace.geometry?.location) ? (
                  <TouchableOpacity style={styles.locationAdjustButton} onPress={adjustExactLocation} testID="recommendation-adjust-location">
                    <Ionicons name="pin-outline" size={17} color={colors.primary} />
                    <AppText style={styles.moreText}>לא מדויק? הזזת נקודה במפה</AppText>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}
            {destinationChoice ? (
              <ExactLocationConfirmation
                pendingLocation={pendingLocation}
                destinationChoice={destinationChoice}
                resolving={resolvingLocation}
                resolvingPreview={resolvingPreview}
                onChooseDestination={(choiceId) => selectResolvedDestination(choiceId).catch(() => {})}
                onChooseFallbackDestination={(destination) => selectFallbackDestination(destination).catch(() => {})}
                onChooseAnother={chooseAnotherLocation}
              />
            ) : null}
            {resolvingLocation ? <AppText style={styles.fieldHint}>בודקים את המיקום...</AppText> : null}
            {locationResolveError ? (
              <View>
                <AppText style={styles.fieldError} testID="recommendation-location-error">{locationResolveError}</AppText>
                {locationResolveRetryable ? (
                  <TouchableOpacity style={styles.moreButton} onPress={() => retryExactLocation().catch(() => {})}>
                    <AppText style={styles.moreText}>ניסיון נוסף</AppText>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}
            {!showAlternativeLocations ? (
              <TouchableOpacity style={styles.moreButton} onPress={() => setShowAlternativeLocations(true)} testID="recommendation-show-location-alternatives">
                <Ionicons name="options-outline" size={17} color={colors.primary} />
                <AppText style={styles.moreText}>לא מצאתי מקום מדויק</AppText>
              </TouchableOpacity>
            ) : null}
          </>
        ) : (
          <>
            <AppText style={styles.fieldLabel}>בחירת עיר או אזור</AppText>
            <SingleDestinationPicker
              allowProviderDestinations
              value={generalDestination}
              onChange={chooseGeneralDestination}
            />
            {locationMode === LOCATION_MODES.destination ? (
              <AppText style={styles.fieldHint}>ההמלצה תופיע בתוך היעד בלי נקודה מדויקת במפה.</AppText>
            ) : null}
            {locationMode === LOCATION_MODES.pin && generalDestination ? (
              <View style={{ marginTop: spacing.lg }}>
                <ManualMapPinPicker
                  destination={generalDestination}
                  value={manualCoordinate}
                  onChange={setManualCoordinate}
                />
                {adjustedExactLocationRef.current ? (
                  <TouchableOpacity style={styles.moreButton} onPress={restoreExactLocation} testID="recommendation-restore-exact-location">
                    <Ionicons name="arrow-undo-outline" size={17} color={colors.primary} />
                    <AppText style={styles.moreText}>חזרה למיקום המקורי</AppText>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}
          </>
        )}
      </View>
    </NoyaTourTarget>
  );

  const renderTaxonomyStep = () => (
    <NoyaTourTarget targetId={NOYA_CREATOR_TARGETS.recommendationTaxonomy}>
      {primarySuggestion && !categoryId ? (
        <View style={styles.suggestionPanel}>
          <AppText style={styles.suggestionText}>
            נראה שהאפשרות {classificationSummary(primarySuggestion.categoryId, primarySuggestion.subcategoryIds)} מתאימה. זה נכון?
          </AppText>
          <View style={styles.suggestionActions}>
            <TouchableOpacity style={[styles.chip, styles.chipSelected]} onPress={applySuggestion}>
              <AppText style={[styles.chipText, styles.chipTextSelected]}>כן, מתאים</AppText>
            </TouchableOpacity>
            <TouchableOpacity style={styles.chip} onPress={() => setDismissedSuggestion(true)}>
              <AppText style={styles.chipText}>בחירה אחרת</AppText>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {!categoryId ? (
        <View style={styles.categoryGrid}>
          {RECOMMENDATION_CATEGORIES.map((category) => (
            <TouchableOpacity
              key={category.id}
              style={styles.categoryTile}
              onPress={() => selectCategory(category.id)}
              accessibilityRole="button"
              testID={`recommendation-category-${category.id}`}
            >
              <MaterialIcons name={category.icon} size={24} color={colors.primary} />
              <AppText style={styles.categoryTileText}>{category.label}</AppText>
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <>
          <View style={styles.taxonomyHeader}>
            <AppText style={styles.taxonomyTitle}>{selectedCategory.label}</AppText>
            <TouchableOpacity onPress={() => selectCategory('')} accessibilityRole="button">
              <AppText style={styles.textAction}>שינוי קטגוריה</AppText>
            </TouchableOpacity>
          </View>

          {showAllSubcategories ? (
            <FocusClearingFormInput
              label="חיפוש אפשרות"
              value={subcategorySearch}
              onChangeText={setSubcategorySearch}
              placeholder="למשל: גלידה, קרוז או פוניקולר"
              rtl
              testID="recommendation-subcategory-search"
            />
          ) : null}

          <View style={styles.chipWrap}>
            {visibleSubcategories.map((subcategory) => {
              const selected = subcategoryIds.includes(subcategory.id);
              return (
                <TouchableOpacity
                  key={subcategory.id}
                  style={[styles.chip, selected && styles.chipSelected]}
                  onPress={() => toggleSubcategory(subcategory.id)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                  testID={`recommendation-subcategory-${subcategory.id}`}
                >
                  <AppText style={[styles.chipText, selected && styles.chipTextSelected]}>{subcategory.label}</AppText>
                </TouchableOpacity>
              );
            })}
          </View>

          {selectedOther ? (
            <View style={styles.optionalField}>
              <FocusClearingFormInput
                label="איך לקרוא לאפשרות?"
                value={customSubcategoryLabel}
                onChangeText={(value) => {
                  classificationEditedByUserRef.current = true;
                  setCustomSubcategoryLabel(value);
                }}
                placeholder="למשל: סיור צילום לילי"
                maxLength={40}
                rtl
                testID="recommendation-custom-subcategory"
              />
              <AppText style={styles.fieldHint}>השם ייבדק לפני שההמלצה תפורסם לכולם.</AppText>
            </View>
          ) : null}

          <TouchableOpacity
            style={styles.moreButton}
            onPress={() => {
              setShowAllSubcategories((current) => !current);
              setSubcategorySearch('');
            }}
            accessibilityRole="button"
            testID="recommendation-subcategory-more"
          >
            <Ionicons name={showAllSubcategories ? 'chevron-up' : 'search'} size={17} color={colors.primary} />
            <AppText style={styles.moreText}>{showAllSubcategories ? 'הצגת האפשרויות הנפוצות' : 'עוד אפשרויות או חיפוש'}</AppText>
          </TouchableOpacity>
        </>
      )}
    </NoyaTourTarget>
  );

  const renderDetailsStep = () => (
    <NoyaTourTarget targetId={NOYA_CREATOR_TARGETS.recommendationStory}>
      <View style={styles.fieldStack}>
        <FocusClearingFormInput
          label="שם ההמלצה"
          required
          value={title}
          onChangeText={(value) => {
            titleEditedByUserRef.current = true;
            setTitle(value);
          }}
          placeholder="למשל: בית קפה קטן ושקט במרכז"
          maxLength={120}
          rtl
          testID="recommendation-title-input"
        />
        <FocusClearingFormInput
          label="תיאור"
          required
          value={description}
          onChangeText={setDescription}
          placeholder="מה חשוב לדעת? מה אהבתם, למי מתאים ומתי כדאי להגיע"
          multiline
          maxLength={5000}
          rtl
          testID="recommendation-description-input"
        />
      </View>
    </NoyaTourTarget>
  );

  const renderReviewStep = () => {
    const optionalField = OPTIONAL_FIELDS.find((field) => field.id === activeOptionalField);
    const optionalValue = optionalField ? details[optionalField.id] || '' : '';
    const optionalContentDirection = optionalField?.id === 'contactName'
      ? recommendationContactInputDirection(optionalValue)
      : optionalField?.contentDirection;
    return (
      <>
        <RtlChoiceGroup
          label="מחיר (חובה)"
          helper="מספיק לבחור הערכה כללית; אפשר להוסיף סכום מדויק בפרטים הנוספים."
          options={POST_BUDGETS}
          selectedIds={[budget]}
          selectionMode="single"
          variant="segment"
          onToggle={(value) => {
            setBudget(value);
            setValidationMessage('');
          }}
          testIDPrefix="recommendation-budget"
        />

        {categoryId === 'events' ? (
          <View style={styles.optionalField}>
            <FocusClearingFormInput
              label="מתי האירוע מתקיים?"
              required
              value={eventSchedule}
              onChangeText={setEventSchedule}
              placeholder="למשל: 12 בספטמבר 2026 בשעה 20:00"
              maxLength={160}
              rtl
              testID="recommendation-event-schedule"
            />
          </View>
        ) : null}

        <AppText style={styles.optionalTitle}>פרטים נוספים, רק אם רלוונטי</AppText>
        <View style={styles.chipWrap}>
          {OPTIONAL_FIELDS.map((field) => {
            const selected = activeOptionalField === field.id || Boolean(details[field.id]);
            return (
              <TouchableOpacity
                key={field.id}
                style={[styles.chip, selected && styles.chipSelected]}
                onPress={() => setActiveOptionalField(field.id)}
                accessibilityRole="button"
                testID={`recommendation-optional-${field.id}`}
              >
                <AppText style={[styles.chipText, selected && styles.chipTextSelected]}>{field.label}</AppText>
              </TouchableOpacity>
            );
          })}
        </View>
        {optionalField ? (
          <View style={styles.optionalField}>
            <FocusClearingFormInput
              label={optionalField.label}
              value={optionalValue}
              onChangeText={(nextValue) => setDetails((current) => ({
                ...current,
                [optionalField.id]: optionalField.id === 'externalUrl'
                  ? normalizeExternalUrl(nextValue)
                  : nextValue,
              }))}
              placeholder={optionalField.placeholder}
              keyboardType={optionalField.keyboardType}
              multiline={optionalField.multiline}
              maxLength={optionalField.maxLength}
              autoCapitalize={optionalField.id === 'externalUrl' ? 'none' : undefined}
              autoCorrect={optionalField.id !== 'externalUrl'}
              rtl={optionalContentDirection === 'rtl'}
              style={optionalContentDirection === 'ltr' ? styles.ltrInput : undefined}
              testID={`recommendation-optional-input-${optionalField.id}`}
            />
          </View>
        ) : null}
      </>
    );
  };

  if (mode === 'loading') return (
    <View style={styles.draftStateScreen}>
      <ActivityIndicator color={colors.primary} />
      <AppText style={styles.draftBody}>פותחים את ההמלצה...</AppText>
    </View>
  );
  if (mode === 'loadError') return (
    <View style={styles.draftStateScreen}>
      <View style={styles.draftCard}>
        <AppText style={styles.draftTitle}>לא הצלחנו לפתוח את ההמלצה</AppText>
        <AppText style={styles.draftBody}>{loadError}</AppText>
        <TouchableOpacity style={[styles.primaryButton, styles.draftPrimaryButton]} onPress={() => { setMode('loading'); setLoadAttempt((value) => value + 1); }} testID="recommendation-draft-load-retry">
          <AppText style={styles.primaryButtonText}>ניסיון נוסף</AppText>
        </TouchableOpacity>
      </View>
    </View>
  );
  if (mode === 'choice' || mode === 'switchChoice') return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.draftCard}>
        <AppText style={styles.draftTitle}>{existingDraft?.title || 'המלצה בתהליך'}</AppText>
        {existingDraft?.selectedCity?.name ? <AppText style={styles.draftBody}>{existingDraft.selectedCity.name}</AppText> : null}
        {mode === 'choice' ? (
          <TouchableOpacity style={[styles.primaryButton, styles.draftPrimaryButton]} onPress={continueExistingDraft} testID="recommendation-draft-continue">
            <AppText style={styles.primaryButtonText}>המשך ההמלצה</AppText>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.draftSecondaryButton} onPress={() => finishLeave()} testID="recommendation-switch-cancel">
            <AppText style={styles.draftSecondaryText}>ביטול ושמירת הטיוטה</AppText>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.draftSecondaryButton} onPress={discardExistingDraft} disabled={submitting} testID="recommendation-draft-discard">
          {submitting ? <ActivityIndicator color={colors.error} /> : <AppText style={styles.draftDestructiveText}>{existingDraft?.sourceRecommendationId ? 'ויתור על העריכות' : 'מחיקה והתחלה מחדש'}</AppText>}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  return (
    <View style={styles.screen}>
      <NoyaTourTarget targetId={NOYA_CREATOR_TARGETS.recommendationFallback}>
      <View style={styles.header} testID="recommendation-composer-header">
        <AppText style={styles.headerTitle}>{isEdit ? 'עריכת המלצה' : 'המלצה חדשה'}</AppText>
        <AppText style={styles.headerSubtitle}>הכול בעמוד אחד. אפשר להתחיל מכל חלק ולפרסם כשמוכנים.</AppText>
        <View style={styles.saveStatusRow} accessibilityLiveRegion="polite">
          {['saving', 'discarding'].includes(saveStatus) ? <ActivityIndicator size="small" color={colors.white} /> : null}
          <AppText style={styles.saveStatusText}>{saveStatus === 'discarding' ? 'מוותרים על השינויים…' : saveStatus === 'saving' ? 'שומר…' : saveStatus === 'error' ? 'לא הצלחנו לשמור' : draftId ? 'נשמר' : ''}</AppText>
          {saveStatus === 'error' ? (
            <TouchableOpacity onPress={() => persistSnapshot(draftPayload, draftComparable).catch(() => {})} testID="recommendation-save-retry">
              <AppText style={styles.saveRetryText}>ניסיון נוסף</AppText>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
      </NoyaTourTarget>

      <KeyboardAvoidingView
        style={styles.keyboardAvoiding}
        behavior={Platform.OS === 'android' ? 'height' : undefined}
        enabled={Platform.OS === 'android'}
        testID="recommendation-keyboard-avoiding"
      >
        <ScrollView
          ref={scrollViewRef}
          style={styles.scroll}
          contentContainerStyle={styles.content}
          scrollEnabled={!mediaReorderActive}
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          testID="recommendation-composer-scroll"
        >
          {missingLocalMediaCount > 0 ? (
            <View style={styles.missingMediaNotice} testID="recommendation-missing-local-media">
              <AppText style={styles.missingMediaText}>חלק מהתמונות נשמרו רק במכשיר שבו נבחרו ולא זמינות כאן. אפשר לבחור אותן שוב לפני הפרסום.</AppText>
            </View>
          ) : null}
          <View style={styles.sectionCard} onLayout={(event) => { sectionOffsetsRef.current.photos = event.nativeEvent.layout.y; }}>
            <View style={styles.sectionHeader}>
              <AppText style={styles.sectionTitle}>תמונות</AppText>
              <AppText style={styles.sectionRequired}>חובה</AppText>
            </View>
            {renderPhotoStep()}
          </View>
          <View style={styles.sectionCard} onLayout={(event) => { sectionOffsetsRef.current.location = event.nativeEvent.layout.y; }}>
            <View style={styles.sectionHeader}>
              <AppText style={styles.sectionTitle}>איפה המקום?</AppText>
              <AppText style={styles.sectionRequired}>חובה</AppText>
            </View>
            {renderLocationStep()}
          </View>
          <View style={styles.sectionCard} onLayout={(event) => { sectionOffsetsRef.current.story = event.nativeEvent.layout.y; }}>
            <View style={styles.sectionHeader}>
              <AppText style={styles.sectionTitle}>שם ותיאור</AppText>
              <AppText style={styles.sectionRequired}>חובה</AppText>
            </View>
            {renderDetailsStep()}
          </View>
          <View style={styles.sectionCard} onLayout={(event) => {
            sectionOffsetsRef.current.taxonomy = event.nativeEvent.layout.y;
            sectionOffsetsRef.current.optional = event.nativeEvent.layout.y;
          }}>
            <View style={styles.sectionHeader}>
              <AppText style={styles.sectionTitle}>קטגוריה ומחיר</AppText>
              <AppText style={styles.sectionRequired}>חובה</AppText>
            </View>
            {renderTaxonomyStep()}
            <View style={styles.sectionDivider} />
            {renderReviewStep()}
          </View>
          {saveError ? (
            <AppText style={styles.fieldError} accessibilityRole="alert" testID="recommendation-media-save-error">
              {saveError}
            </AppText>
          ) : null}
          {validationMessage ? (
            <AppText
              style={styles.fieldError}
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              testID="recommendation-step-error"
            >
              {validationMessage}
            </AppText>
          ) : null}
        </ScrollView>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'position' : undefined}
          enabled={Platform.OS === 'ios'}
          style={styles.footerKeyboardAvoiding}
          testID="recommendation-footer-keyboard-avoiding"
        >
          <SafeAreaInsetsContext.Consumer>
            {(insets) => (
              <View
                style={[
                  styles.footer,
                  { paddingBottom: Math.max(keyboardVisible ? 0 : insets?.bottom || 0, 12) },
                ]}
              >
                <View style={styles.footerInner}>
                  <TouchableOpacity
                    style={[styles.primaryButton, (submitting || resolvingLocation) && styles.primaryButtonDisabled]}
                    onPress={handleSubmit}
                    disabled={submitting || resolvingLocation}
                    accessibilityRole="button"
                    testID="recommendation-next"
                  >
                    {submitting
                      ? <ActivityIndicator color={colors.white} />
                      : <AppText style={styles.primaryButtonText}>{isEdit ? 'שמירת השינויים' : 'פרסום ההמלצה'}</AppText>}
                  </TouchableOpacity>
                  {keyboardVisible ? (
                    <TouchableOpacity
                      style={styles.keyboardDismissButton}
                      onPress={Keyboard.dismiss}
                      accessibilityRole="button"
                      accessibilityLabel="סגירת המקלדת"
                      testID="recommendation-keyboard-dismiss"
                    >
                      <Ionicons name="chevron-down" size={24} color={colors.primary} />
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            )}
          </SafeAreaInsetsContext.Consumer>
        </KeyboardAvoidingView>
      </KeyboardAvoidingView>
    </View>
  );
}
