import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
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
import ImageCropReviewModal from '../../../components/ImageCropReviewModal';
import { ImagePickerBox } from '../../../components/ImagePickerBox';
import UnsavedChangesModal from '../../../components/UnsavedChangesModal';
import { UNSAVED_LEAVE_MESSAGE, UNSAVED_LEAVE_TITLE } from '../../../constants/unsavedLeaveStrings';
import {
  RECOMMENDATION_CATALOG,
  RECOMMENDATION_CATEGORIES,
  RECOMMENDATION_SUBCATEGORIES,
  POST_BUDGETS,
  TRAVEL_TAXONOMY_VERSION,
  isRecommendationClassificationValid,
  searchRecommendationCatalog,
  suggestClassificationFromGoogleTypes,
} from '../../../constants/travelTaxonomy';
import {
  RECOMMENDATION_IMAGE_LONG_EDGE,
  TRAVEL_IMAGE_COMPRESSION,
} from '../../../constants/travelMedia';
import useDurableDraftMedia from '../../../hooks/useDurableDraftMedia';
import useExactPlaceSelection from '../../../hooks/useExactPlaceSelection';
import { useBackButton } from '../../../hooks/useBackButton';
import useReviewedImagePicker from '../../../hooks/useReviewedImagePicker';
import { useUnsavedLeaveGuard } from '../../../hooks/useUnsavedLeaveGuard';
import {
  colors,
  recommendationComposerStyles as styles,
  spacing,
} from '../../../styles';
import { findMediaAssetByUrl, getMediaVariantUrl } from '../../../utils/mediaAssets';
import { travelMediaErrorMessage } from '../../../utils/travelMediaErrors';
import { useRecommendationPublish } from '../publishing/RecommendationPublishContext';
import { saveRecommendation } from '../../../services/RecommendationService';
import ManualMapPinPicker from '../components/ManualMapPinPicker';
import NoyaGuide from '../components/NoyaGuide';
import SingleDestinationPicker from '../components/SingleDestinationPicker';

const STEP_COUNT = 4;
const LOCATION_MODES = {
  exact: 'exact',
  destination: 'destination',
  pin: 'pin',
};
const OPTIONAL_FIELDS = [
  { id: 'contactName', label: 'איש קשר', placeholder: 'למשל: דנה מהקבלה', maxLength: 80 },
  { id: 'phone', label: 'טלפון', placeholder: 'למשל: +36 20 123 4567', keyboardType: 'phone-pad', maxLength: 40 },
  { id: 'externalUrl', label: 'קישור', placeholder: 'למשל: https://example.com', keyboardType: 'url', maxLength: 500 },
  { id: 'priceNote', label: 'מחיר', placeholder: 'למשל: כ־45 ש״ח לאדם', maxLength: 120 },
  { id: 'accessibilityNote', label: 'נגישות', placeholder: 'למשל: כניסה נגישה ומעלית', multiline: true, maxLength: 500 },
];

const categoryById = Object.fromEntries(RECOMMENDATION_CATEGORIES.map((item) => [item.id, item]));
const subcategoryById = Object.fromEntries(RECOMMENDATION_SUBCATEGORIES.map((item) => [item.id, item]));

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
    .map(([key, value]) => [key, typeof value === 'string' ? value.trim() : ''])
    .filter(([, value]) => value));
}

function normalizeManualCoordinate(value) {
  const lat = Number(value?.latitude ?? value?.lat);
  const lng = Number(value?.longitude ?? value?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
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

export default function CreateRecommendationScreen({ navigation, route }) {
  const editItem = route?.params?.item ?? route?.params?.recommendation ?? null;
  const isEdit = route?.params?.mode === 'edit' && Number(editItem?.recommendationCatalogVersion || 0) > 0;
  const editPostId = route?.params?.postId || editItem?.id || null;
  const publishJobId = isEdit ? null : route?.params?.publishJobId || null;
  const { enqueueCreate, loadJobForReview } = useRecommendationPublish();
  const {
    draftJobId,
    forgetUri: forgetDurableImage,
    markEnqueued: markDurableImagesEnqueued,
    mediaForUri: durableMediaForUri,
    persistUris: persistReviewedImages,
  } = useDurableDraftMedia({ enabled: !isEdit });

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
  const [editableImageUris, setEditableImageUris] = useState([]);
  const [validationMessage, setValidationMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [unsavedModalVisible, setUnsavedModalVisible] = useState(false);
  const [editSnapshotBaseline, setEditSnapshotBaseline] = useState(null);
  const pendingDiscardRef = useRef(null);
  const hydratedEditIdRef = useRef(null);

  const {
    cancelReview,
    completeReview,
    pickImagesForReview,
    reviewUris,
    uploadImageAssets,
  } = useReviewedImagePicker({
    kind: 'recommendation',
    aspect: [1, 1],
    allowsEditing: false,
    quality: 1,
  });

  const {
    chooseAnotherLocation,
    chooseDestination,
    confirmPendingLocation,
    destinationChoice,
    googleSearchFn,
    handleSelectGooglePlace,
    hydrateSelection,
    locationQuery,
    locationResolveError,
    locationResolveRetryable,
    pendingLocation,
    clearSelectionForTyping: onChangeLocationQuery,
    resolvingLocation,
    retryLocationResolution,
    selectedCity,
    selectedCountry,
    selectedPlace,
  } = useExactPlaceSelection();

  const selectedCategory = categoryById[categoryId] || null;
  const selectedOther = subcategoryIds.some((id) => subcategoryById[id]?.isOther);
  const locationDestination = generalDestination || (
    selectedCountry?.id && selectedCity?.id
      ? {
          countryId: selectedCountry.id,
          cityId: selectedCity.id,
          countryName: selectedCountry.name,
          name: selectedCity.name,
        }
      : null
  );

  const classificationSuggestions = useMemo(() => {
    if (locationMode !== LOCATION_MODES.exact || dismissedSuggestion || !selectedPlace?.placeId) return [];
    return suggestClassificationFromGoogleTypes({
      placeId: selectedPlace.placeId,
      primaryType: selectedPlace.primaryType || selectedPlace.primary_type || '',
      types: selectedPlace.types || [],
    });
  }, [dismissedSuggestion, locationMode, selectedPlace]);

  const primarySuggestion = classificationSuggestions[0] || null;
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

  const previewUris = useMemo(() => editableImageUris.map((uri) => {
    const asset = findMediaAssetByUrl(editItem?.media, uri);
    return asset ? getMediaVariantUrl(asset, 'feed', uri) : uri;
  }), [editItem?.media, editableImageUris]);

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
  const createDirty = Boolean(
    title.trim() || description.trim() || budget || categoryId || subcategoryIds.length ||
    selectedCountry?.id || generalDestination?.cityId || editableImageUris.length ||
    locationQuery.trim() || Object.keys(cleanDetails(details)).length || eventSchedule.trim()
  );
  const dirty = isEdit
    ? Boolean(editSnapshotBaseline && editSnapshotBaseline !== formComparable)
    : createDirty;

  const promptDiscard = useCallback((onConfirm) => {
    pendingDiscardRef.current = onConfirm;
    setUnsavedModalVisible(true);
  }, []);
  const { allowLeaveRef, handleHeaderBackPress } = useUnsavedLeaveGuard({
    navigation,
    guardActive: true,
    sessionKey: `${isEdit ? 'edit' : 'create'}-recommendation-${editPostId || publishJobId || draftJobId}`,
    hasUnsavedChanges: dirty,
    submitting,
    openUnsavedPrompt: promptDiscard,
  });
  useBackButton(navigation, { title: isEdit ? 'עריכת המלצה' : 'המלצה חדשה', onPress: handleHeaderBackPress });

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
    setDescription(editItem.description || '');
    setBudget(editItem.budget || '');
    setDetails(initialDetails);
    setEventSchedule(initialSchedule);
    setEditableImageUris(imageUris);
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
  }, [hydrateSelection, isEdit, route?.params?.prefillLocation]);

  useEffect(() => {
    if (isEdit || !publishJobId || typeof loadJobForReview !== 'function') return undefined;
    let active = true;
    loadJobForReview(publishJobId).then((job) => {
      if (!active || !job?.draft) return;
      const draft = job.draft;
      setStep(Math.max(1, Math.min(STEP_COUNT, Number(draft.step || 3))));
      setLocationMode(draft.locationMode || LOCATION_MODES.exact);
      setGeneralDestination(draft.generalDestination || null);
      setManualCoordinate(draft.manualCoordinate || null);
      setCategoryId(draft.categoryId || '');
      setSubcategoryIds(Array.isArray(draft.subcategoryIds) ? draft.subcategoryIds : []);
      setCustomSubcategoryLabel(draft.customSubcategoryLabel || '');
      setTitle(draft.title || '');
      setDescription(draft.description || '');
      setBudget(draft.budget || '');
      setDetails(draft.details || {});
      setEventSchedule(draft.eventSchedule || '');
      hydrateSelection({
        country: draft.selectedCountry || null,
        city: draft.selectedCity || null,
        place: draft.selectedPlace || null,
        query: draft.locationQuery || draft.selectedPlace?.name || '',
      });
      setEditableImageUris(Array.isArray(job.imageUris) ? job.imageUris : []);
    }).catch((error) => {
      console.error('Could not restore queued recommendation:', error);
      if (active) Alert.alert('לא הצלחנו לפתוח את ההמלצה', 'אפשר לנסות שוב מסרגל הפרסום.');
    });
    return () => { active = false; };
  }, [hydrateSelection, isEdit, loadJobForReview, publishJobId]);

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
    setCategoryId(nextCategoryId);
    setSubcategoryIds([]);
    setCustomSubcategoryLabel('');
    setShowAllSubcategories(false);
    setSubcategorySearch('');
    setValidationMessage('');
  };

  const toggleSubcategory = (subcategoryId) => {
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
    setCategoryId(primarySuggestion.categoryId);
    setSubcategoryIds(primarySuggestion.subcategoryIds);
    setCustomSubcategoryLabel('');
    setDismissedSuggestion(true);
  };

  const handleAddImages = async () => {
    const remaining = Math.max(0, 5 - editableImageUris.length);
    if (!remaining) return;
    await pickImagesForReview({
      limit: remaining,
      onComplete: async (uris) => {
        await persistReviewedImages(uris);
        setEditableImageUris((current) => Array.from(new Set([...current, ...(uris || [])])).slice(0, 5));
      },
    });
  };

  const removeImageAt = (index) => {
    setEditableImageUris((current) => {
      const next = [...current];
      const [removed] = next.splice(index, 1);
      forgetDurableImage(removed).catch(() => {});
      return next;
    });
  };

  const validateStep = useCallback((targetStep) => {
    if (targetStep === 1) {
      if (resolvingLocation || pendingLocation || destinationChoice) return 'כדאי להשלים את בחירת המיקום.';
      if (locationMode === LOCATION_MODES.exact && !selectedPlace?.placeId) return 'כדאי לבחור תוצאה מדויקת מהחיפוש.';
      if (locationMode !== LOCATION_MODES.exact && (!selectedCountry?.id || !selectedCity?.id)) return 'כדאי לבחור עיר או אזור.';
      if (locationMode === LOCATION_MODES.pin && !normalizeManualCoordinate(manualCoordinate)) return 'כדאי לסמן נקודה תקינה במפה.';
    }
    if (targetStep === 2 && !isRecommendationClassificationValid({
      categoryId,
      subcategoryIds,
      customSubcategoryLabel,
    })) {
      if (!categoryId) return 'כדאי לבחור על מה ההמלצה.';
      if (!subcategoryIds.length) return 'כדאי לבחור לפחות אפשרות אחת שמתארת את ההמלצה.';
      if (selectedOther) return 'כדאי לכתוב שם קצר וברור לאפשרות האחרת.';
      return 'אפשר לבחור עד שלוש אפשרויות מאותה קטגוריה.';
    }
    if (targetStep === 3) {
      if (!title.trim()) return 'כדאי להוסיף שם קצר וברור.';
      if (!description.trim()) return 'כדאי לכתוב במשפט או שניים למה ההמלצה שווה.';
    }
    if (targetStep === 4) {
      if (!budget) return 'כדאי לבחור את רמת המחיר.';
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
  ]);

  const goNext = () => {
    const message = validateStep(step);
    setValidationMessage(message);
    if (message) return;
    if (step < STEP_COUNT) {
      setStep((current) => current + 1);
      return;
    }
    handleSubmit();
  };

  const handleSubmit = async () => {
    const message = validateStep(4) || validateStep(3) || validateStep(2) || validateStep(1);
    setValidationMessage(message);
    if (message || submitting) return;
    setSubmitting(true);
    try {
      const destinationPayload = locationMode === LOCATION_MODES.exact
        ? selectedPlace?.resolvedPlaceToken
          ? {
              resolvedPlaceToken: selectedPlace.resolvedPlaceToken,
              ...(selectedPlace.placeId ? { placeId: selectedPlace.placeId } : {}),
              ...(selectedPlace.incidentId ? { incidentId: selectedPlace.incidentId } : {}),
              locationMode,
            }
          : isEdit && selectedCountry?.id && selectedCity?.id
            ? {
                destinationRef: { countryId: selectedCountry.id, cityId: selectedCity.id },
                locationMode,
              }
            : { placeId: selectedPlace.placeId, locationMode }
        : {
            destinationRef: { countryId: selectedCountry.id, cityId: selectedCity.id },
            locationMode,
            ...(locationMode === LOCATION_MODES.pin
              ? { manualLocation: { coordinates: normalizeManualCoordinate(manualCoordinate) } }
              : {}),
          };

      const recommendation = {
        taxonomyVersion: TRAVEL_TAXONOMY_VERSION,
        recommendationCatalogVersion: RECOMMENDATION_CATALOG.schemaVersion,
        title: title.trim(),
        description: description.trim(),
        budget,
        categoryId,
        subcategoryIds,
        ...(customSubcategoryLabel.trim() ? { customSubcategoryLabel: customSubcategoryLabel.trim() } : {}),
        details: {
          ...cleanDetails(details),
          ...(eventSchedule.trim() ? { eventSchedule: eventSchedule.trim() } : {}),
        },
      };

      if (isEdit) {
        const localUris = editableImageUris.filter((uri) => !findMediaAssetByUrl(editItem?.media, uri));
        const uploaded = localUris.length ? await uploadImageAssets(localUris) : [];
        const uploadedQueue = [...uploaded];
        const media = editableImageUris.map((uri) => (
          findMediaAssetByUrl(editItem?.media, uri) || uploadedQueue.shift()
        )).filter(Boolean);
        await saveRecommendation({
          recommendationId: editPostId,
          ...destinationPayload,
          recommendation: { ...recommendation, media },
        });
        Alert.alert('השינויים נשמרו', 'ההמלצה עודכנה בהצלחה.');
        allowLeaveRef.current = true;
        navigation.goBack();
        return;
      }

      await enqueueCreate({
        contentType: 'recommendation',
        draftJobId: publishJobId ? null : draftJobId,
        sourceJobId: publishJobId,
        payload: {
          ...destinationPayload,
          recommendation: { ...recommendation, media: [] },
        },
        media: editableImageUris.map((uri) => durableMediaForUri(uri)),
        draft: {
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
        },
      });
      markDurableImagesEnqueued();
      allowLeaveRef.current = true;
      navigation.goBack();
    } catch (error) {
      console.error('Error queueing recommendation:', error);
      Alert.alert(
        'לא הצלחנו לשמור את ההמלצה',
        travelMediaErrorMessage(error) || 'אפשר לנסות שוב בעוד רגע.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const renderLocationStep = () => (
    <>
      <NoyaGuide message="איפה ההמלצה? אפשר לחפש מקום מדויק. אם הוא לא מופיע, מספיק לבחור עיר או אזור." />
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

      <View style={styles.locationPanel}>
        {locationMode === LOCATION_MODES.exact ? (
          <>
            <AppText style={styles.fieldLabel}>חיפוש מקום</AppText>
            <GooglePlacesInput
              mode="google"
              value={locationQuery}
              onChangeValue={onChangeLocationQuery}
              onSelect={(selection) => handleSelectGooglePlace(selection).catch(() => {})}
              googleSearchFn={googleSearchFn}
              explicitSearch
              returnSelection
              clearPlaceholderOnFocus
              placeholder="למשל: Café Central, וינה"
              inputTestID="recommendation-exact-location-search"
            />
            <ExactLocationConfirmation
              pendingLocation={pendingLocation}
              destinationChoice={destinationChoice}
              onChooseDestination={(choiceId) => chooseDestination(choiceId).catch(() => {})}
              onConfirm={confirmPendingLocation}
              onChooseAnother={chooseAnotherLocation}
            />
            {resolvingLocation ? <AppText style={styles.fieldHint}>בודקים את המיקום...</AppText> : null}
            {locationResolveError ? (
              <View>
                <AppText style={styles.fieldError} testID="recommendation-location-error">{locationResolveError}</AppText>
                {locationResolveRetryable ? (
                  <TouchableOpacity style={styles.moreButton} onPress={() => retryLocationResolution().catch(() => {})}>
                    <AppText style={styles.moreText}>ניסיון נוסף</AppText>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}
          </>
        ) : (
          <>
            <AppText style={styles.fieldLabel}>בחירת עיר או אזור</AppText>
            <SingleDestinationPicker value={generalDestination} onChange={chooseGeneralDestination} />
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
              </View>
            ) : null}
          </>
        )}
      </View>
    </>
  );

  const renderTaxonomyStep = () => (
    <>
      <NoyaGuide message={categoryId ? 'מה מתאר הכי טוב את ההמלצה? אפשר לבחור עד שלוש אפשרויות.' : 'על מה ההמלצה?'} />
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
                onChangeText={setCustomSubcategoryLabel}
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
    </>
  );

  const renderStoryStep = () => (
    <>
      <NoyaGuide message="משפט קצר ותמונה טובה מספיקים כדי להבין למה כדאי להגיע." />
      <View style={styles.fieldStack}>
        <FocusClearingFormInput
          label="איך קוראים למקום או להמלצה?"
          required
          value={title}
          onChangeText={setTitle}
          placeholder="למשל: בית קפה קטן ושקט במרכז"
          maxLength={120}
          rtl
          testID="recommendation-title-input"
        />
        <FocusClearingFormInput
          label="למה שווה?"
          required
          value={description}
          onChangeText={setDescription}
          placeholder="למשל: קפה מצוין, מאפים טריים ושירות חם. כדאי להגיע מוקדם."
          multiline
          maxLength={5000}
          rtl
          testID="recommendation-description-input"
        />
        <AppText style={styles.fieldLabel}>תמונות</AppText>
        <AppText style={[styles.fieldHint, styles.photoHint]}>אפשר להוסיף עד חמש תמונות. זה מומלץ, אבל לא חובה.</AppText>
        <ImagePickerBox
          imageUris={previewUris}
          onPress={handleAddImages}
          onRemove={removeImageAt}
          maxImages={5}
          placeholderText="הוספת תמונות"
          imageFit="cover"
          previewAspectRatio={1}
          testID="recommendation-image-picker"
        />
      </View>
    </>
  );

  const renderReviewStep = () => {
    const destinationLabel = [selectedCity?.name, selectedCountry?.name].filter(Boolean).join(', ');
    const optionalField = OPTIONAL_FIELDS.find((field) => field.id === activeOptionalField);
    return (
      <>
        <NoyaGuide message="כמעט סיימנו. מה רמת המחיר? אחר כך אפשר להוסיף עוד פרט שימושי או לפרסם." />
        <View style={styles.preview}>
          {previewUris[0] ? (
            <Image source={{ uri: previewUris[0] }} style={styles.previewImage} resizeMode="cover" />
          ) : (
            <View style={styles.previewPlaceholder}>
              <Ionicons name="image-outline" size={34} color={colors.white} />
            </View>
          )}
          <View style={styles.previewCopy}>
            <AppText style={styles.previewTitle}>{title}</AppText>
            <AppText style={styles.previewMeta}>
              {[classificationSummary(categoryId, subcategoryIds), destinationLabel].filter(Boolean).join(' · ')}
            </AppText>
          </View>
        </View>

        <RtlChoiceGroup
          label="רמת מחיר (חובה)"
          helper="הסכום המדויק יכול להשתנות. כאן מספיק לבחור הערכה כללית."
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
              value={details[optionalField.id] || ''}
              onChangeText={(value) => setDetails((current) => ({ ...current, [optionalField.id]: value }))}
              placeholder={optionalField.placeholder}
              keyboardType={optionalField.keyboardType}
              multiline={optionalField.multiline}
              maxLength={optionalField.maxLength}
              autoCapitalize={optionalField.id === 'externalUrl' ? 'none' : undefined}
              autoCorrect={optionalField.id !== 'externalUrl'}
              rtl
              testID={`recommendation-optional-input-${optionalField.id}`}
            />
          </View>
        ) : null}
      </>
    );
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header} testID="recommendation-composer-header">
        <View style={styles.progressCopy}>
          <AppText style={styles.progressText}>{`שלב ${step} מתוך ${STEP_COUNT}`}</AppText>
          <AppText style={styles.progressText}>{isEdit ? 'עריכת המלצה' : 'פחות משתי דקות'}</AppText>
        </View>
        <View
          style={styles.progressTrack}
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 1, max: STEP_COUNT, now: step }}
        >
          <View style={[styles.progressFill, { width: `${(step / STEP_COUNT) * 100}%` }]} />
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {step === 1 ? renderLocationStep() : null}
        {step === 2 ? renderTaxonomyStep() : null}
        {step === 3 ? renderStoryStep() : null}
        {step === 4 ? renderReviewStep() : null}
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

      <SafeAreaInsetsContext.Consumer>
        {(insets) => (
          <View style={[styles.footer, { paddingBottom: Math.max(insets?.bottom || 0, 12) }]}>
            <View style={styles.footerInner}>
              <TouchableOpacity
                style={[styles.primaryButton, (submitting || resolvingLocation) && styles.primaryButtonDisabled]}
                onPress={goNext}
                disabled={submitting || resolvingLocation}
                accessibilityRole="button"
                testID="recommendation-next"
              >
                {submitting
                  ? <ActivityIndicator color={colors.white} />
                  : <AppText style={styles.primaryButtonText}>{step === STEP_COUNT ? (isEdit ? 'שמירת השינויים' : 'פרסום ההמלצה') : 'המשך'}</AppText>}
              </TouchableOpacity>
              {step > 1 ? (
                <TouchableOpacity
                  style={styles.backButton}
                  onPress={() => {
                    setValidationMessage('');
                    setStep((current) => Math.max(1, current - 1));
                  }}
                  accessibilityRole="button"
                  testID="recommendation-back"
                >
                  <AppText style={styles.backButtonText}>חזרה</AppText>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        )}
      </SafeAreaInsetsContext.Consumer>

      <UnsavedChangesModal
        visible={unsavedModalVisible}
        title={UNSAVED_LEAVE_TITLE}
        message={UNSAVED_LEAVE_MESSAGE}
        onCancel={() => {
          pendingDiscardRef.current = null;
          setUnsavedModalVisible(false);
        }}
        onConfirm={() => {
          const confirm = pendingDiscardRef.current;
          pendingDiscardRef.current = null;
          setUnsavedModalVisible(false);
          confirm?.();
        }}
      />

      <ImageCropReviewModal
        visible={reviewUris.length > 0}
        uris={reviewUris}
        aspect={[1, 1]}
        maxLongEdge={RECOMMENDATION_IMAGE_LONG_EDGE}
        compress={TRAVEL_IMAGE_COMPRESSION}
        onCancel={cancelReview}
        onComplete={completeReview}
      />
    </View>
  );
}
