import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
// Firestore imports
import { collection, getDocs, limit, query, collectionGroup, where } from 'firebase/firestore';
import { db, auth } from '../../../config/firebase';
import { colors, spacing, common } from '../../../styles';

// --- Custom Components ---
import { FormInput } from '../../../components/FormInput';
import { ImagePickerBox } from '../../../components/ImagePickerBox';
import GooglePlacesInput from '../../../components/GooglePlacesInput';
import SelectionModal from '../components/SelectionModal';
import UnsavedChangesModal from '../../../components/UnsavedChangesModal';
import { GuidedFormFooter, GuidedFormHeader, GuidedFormSection } from '../../../components/GuidedForm';
import RtlChoiceGroup from '../../../components/RtlChoiceGroup';
import { guidedFormStyles as guidedStyles } from '../../../components/guidedFormStyles';

// --- Custom Hooks ---
import { useBackButton } from '../../../hooks/useBackButton';
import { useUnsavedLeaveGuard } from '../../../hooks/useUnsavedLeaveGuard';
import { useImagePickerWithUpload } from '../../../hooks/useImagePickerWithUpload';
import { resolveDestinationForPlacePreview, searchPlaces } from '../../../services/LocationService';
import { saveRecommendation } from '../../../services/RecommendationService';

// --- Constants ---
import { PARENT_CATEGORIES, POST_BUDGETS, TAG_OPTIONS_BY_CATEGORY } from '../../../constants/Constants';
import { getBudgetTheme } from '../../../utils/getBudgetTheme';
import { getUserTier } from '../../../utils/userTier';
import {
  findMediaAssetByUrl,
  getMediaVariantUrl,
} from '../../../utils/mediaAssets';
import { UNSAVED_LEAVE_MESSAGE, UNSAVED_LEAVE_TITLE } from '../../../constants/unsavedLeaveStrings';
import {
  NEEDS,
  TRAVEL_PARTIES,
  VIBES,
} from '../../profile/constants/smartProfileOptions';
import {
  ENVIRONMENTS,
  TRAVEL_TAXONOMY_VERSION,
  getRecommendationAttributeRequirements,
  normalizeBudgetId,
  normalizeTagIds,
} from '../../../constants/travelTaxonomy';
import {
  emptyValidation,
  firstInvalidSection,
  sectionErrorCount,
  validateRecommendationForm,
} from '../../../utils/guidedFormValidation';



const RECOMMENDATION_SECTION_ORDER = ['place', 'story', 'category', 'fit'];
const RECOMMENDATION_SECTION_FIELDS = {
  place: ['title', 'location'],
  story: ['description'],
  category: ['category', 'selectedTags'],
  fit: ['budget', 'audiences', 'vibes', 'environment', 'needsConfirmed'],
};

// function to get category label from ID
const getCategoryLabel = (categoryId) => {
  const categoryObj = PARENT_CATEGORIES.find(c => c.id === categoryId);
  return categoryObj ? categoryObj.label : categoryId;
};

/** Stable subset for comparing saved place vs form (ignores extra Firestore/Google fields). */
function placeFingerprint(place) {
  if (!place || typeof place !== 'object') return '';
  const placeId = place.placeId || place.place_id || '';
  const lat =
    place.coordinates?.lat ??
    place.geometry?.location?.lat ??
    place.geometry?.location?.latitude ??
    '';
  const lng =
    place.coordinates?.lng ??
    place.geometry?.location?.lng ??
    place.geometry?.location?.longitude ??
    '';
  const name = place.name || '';
  return `${placeId}|${name}|${lat}|${lng}`;
}

function resolveCategoryIdFromEditItem(editItem) {
  if (!editItem) return '';
  const fromId = typeof editItem.categoryId === 'string' ? editItem.categoryId.trim() : '';
  if (fromId) return fromId;

  const raw = typeof editItem.category === 'string' ? editItem.category.trim() : '';
  if (!raw) return '';

  const byId = PARENT_CATEGORIES.find((c) => c.id === raw);
  if (byId) return byId.id;
  const byLabel = PARENT_CATEGORIES.find((c) => c.label === raw);
  return byLabel?.id || '';
}

function resolveTagsFromEditItem(editItem) {
  if (!editItem || !Array.isArray(editItem.tags)) return [];
  return normalizeTagIds(editItem.tags);
}

function buildEditComparable(editItem) {
  if (!editItem) return null;
  const tags = [...resolveTagsFromEditItem(editItem)].sort();
  const images = (Array.isArray(editItem.media) ? editItem.media : [])
    .map((asset) => getMediaVariantUrl(asset, 'feed'))
    .filter(Boolean);
  return JSON.stringify({
    title: editItem.title || '',
    description: editItem.description || '',
    category: resolveCategoryIdFromEditItem(editItem),
    tags,
    budget: normalizeBudgetId(editItem.budget, { allowFlexible: false }),
    audienceScope: editItem.facets?.audienceScope ||
      (editItem.facets?.audiences?.length ? 'selected' : 'all'),
    audiences: [...(editItem.facets?.audiences || [])].sort(),
    vibes: [...(editItem.facets?.vibes || [])].sort(),
    environment: editItem.facets?.environments?.[0] || '',
    needs: [...(editItem.facets?.needs || [])].sort(),
    needsConfirmed: Boolean(editItem.facets?.needs?.length),
    countryId: editItem.destination?.countryId || null,
    cityId: editItem.destination?.cityId || null,
    place: placeFingerprint(editItem.place),
    images: JSON.stringify(images),
  });
}

/** Params shape for navigation.setParams when merging edit targets (callers use item or recommendation). */
function buildEditRouteParams(payload, postIdFallback) {
  const id = payload?.id ?? postIdFallback ?? null;
  return {
    mode: 'edit',
    ...(id ? { postId: id } : {}),
    item: payload,
    recommendation: payload,
  };
}

function buildFormComparable({
  title,
  description,
  category,
  selectedTags,
  budget,
  audienceScope,
  audiences,
  recommendationVibes,
  recommendationEnvironment,
  recommendationNeeds,
  needsConfirmed,
  selectedCountry,
  selectedCity,
  selectedPlace,
  editableImageUris,
}) {
  const tags = [...(selectedTags || [])]
    .map((t) => String(t).trim())
    .filter(Boolean)
    .sort();
  const images = Array.isArray(editableImageUris) ? [...editableImageUris] : [];
  return JSON.stringify({
    title: title || '',
    description: description || '',
    category: category || '',
    tags,
    budget: budget || '',
    audienceScope,
    audiences: [...(audiences || [])].sort(),
    vibes: [...(recommendationVibes || [])].sort(),
    environment: recommendationEnvironment || '',
    needs: [...(recommendationNeeds || [])].sort(),
    needsConfirmed: Boolean(needsConfirmed),
    countryId: selectedCountry?.id ?? null,
    cityId: selectedCity?.id ?? null,
    place: placeFingerprint(selectedPlace),
    images: JSON.stringify(images),
  });
}

const EMPTY_RECOMMENDATION_COMPARABLE = buildFormComparable({
  title: '',
  description: '',
  category: '',
  selectedTags: [],
  budget: '',
  audienceScope: 'selected',
  audiences: [],
  recommendationVibes: [],
  recommendationEnvironment: '',
  recommendationNeeds: [],
  needsConfirmed: false,
  selectedCountry: null,
  selectedCity: null,
  selectedPlace: null,
  editableImageUris: [],
});

export default function AddRecommendationScreen({ navigation , route }) {
  // --- Initialization & Params ---
  const isEdit = route?.params?.mode === 'edit';
  const editItem = route?.params?.item ?? route?.params?.recommendation ?? null;
  const editPostId = route?.params?.postId || null;
  /** Stable id for the post being edited (avoids re-hydrating when parent passes a new editItem object for the same post). */
  const editingPostKey = editItem?.id ?? editPostId ?? null;

  const pendingDiscardRef = useRef(null);
  /** Post id last fully hydrated into form + baseline (null in create mode or before first edit hydrate). */
  const hydratedPostKeyRef = useRef(null);
  /** Snapshot of route params to restore when blocking an in-place switch to another post. */
  const lastHydratedRouteParamsRef = useRef(null);
  /** Target route params when user tried to switch posts while dirty (React Navigation merges params without beforeRemove). */
  const pendingPostSwitchParamsRef = useRef(null);
  /** One-shot: user confirmed discard; allow hydrating the pending post even though form still looks dirty vs old baseline. */
  const forceApplyPendingPostRef = useRef(false);

  // --- Local State ---
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(''); // Stores the ID (e.g., 'food')
  const [selectedTags, setSelectedTags] = useState([]);
  const [budget, setBudget] = useState('');
  const [audienceScope, setAudienceScope] = useState('selected');
  const [audiences, setAudiences] = useState([]);
  const [recommendationVibes, setRecommendationVibes] = useState([]);
  const [recommendationEnvironment, setRecommendationEnvironment] = useState('');
  const [recommendationNeeds, setRecommendationNeeds] = useState([]);
  const [needsConfirmed, setNeedsConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editSnapshotBaseline, setEditSnapshotBaseline] = useState(null);
  const [unsavedModalVisible, setUnsavedModalVisible] = useState(false);
  const [expandedSection, setExpandedSection] = useState('place');
  const [validation, setValidation] = useState(() => emptyValidation());
  const [optionalFitOpen, setOptionalFitOpen] = useState(false);
  const scrollRef = useRef(null);
  const sectionLayoutsRef = useRef({});

  // --- Exact Location Handling (local-first) ---
  const [locationQuery, setLocationQuery] = useState('');
  const [selectedCountry, setSelectedCountry] = useState(null); // {id,name}
  const [selectedCity, setSelectedCity] = useState(null); // {id,name}
  const [selectedPlace, setSelectedPlace] = useState(null); // {placeId,name,address,coordinates,url}
  const [selectedCountryOverrideId, setSelectedCountryOverrideId] = useState(null);
  const [locationResolveError, setLocationResolveError] = useState(null);
  const [resolvingLocation, setResolvingLocation] = useState(false);

  // Kept for old in-progress forms; the server resolver is authoritative and
  // the current UI no longer offers a manual country override.
  const [countryPickerVisible, setCountryPickerVisible] = useState(false);
  const [countriesForPicker, setCountriesForPicker] = useState([]);
  const [loadingCountriesForPicker, setLoadingCountriesForPicker] = useState(false);
  const [pendingCountryOverridePlaceId, setPendingCountryOverridePlaceId] = useState(null);
  const [suggestedCountryForOverride, setSuggestedCountryForOverride] = useState(null);

  const [allCitiesForSearch, setAllCitiesForSearch] = useState([]);
  const [hasLoadedAllCitiesForSearch, setHasLoadedAllCitiesForSearch] = useState(false);
  const isFetchingAllCitiesForSearchRef = useRef(false);
  const allCitiesFetchDebounceRef = useRef(null);

  // --- Image Handling ---
  const {
    pickImages,
    uploadImageAssets,
  } = useImagePickerWithUpload({
    kind: 'recommendation',
    aspect: [1, 1],
    allowsEditing: true,
    quality: 1,
    normalizeToAspect: true,
    normalizeAspect: [1, 1],
    normalizeWidth: 2560,
    normalizeHeight: 2560,
    normalizeCompress: 0.94,
  });
  const [editableImageUris, setEditableImageUris] = useState([]);
  const editablePreviewUris = useMemo(() => {
    return editableImageUris.map((uri) => {
      const asset = findMediaAssetByUrl(editItem?.media, uri);
      return asset ? getMediaVariantUrl(asset, 'feed', uri) : uri;
    });
  }, [editItem, editableImageUris]);

  const handleAddImages = async () => {
    const uris = await pickImages({ limit: 5 });
    if (!uris?.length) return;

    setEditableImageUris((prev) => {
      const next = Array.isArray(prev) ? [...prev] : [];
      for (const uri of uris) {
        if (next.length >= 5) break;
        if (!next.includes(uri)) next.push(uri);
      }
      return next;
    });
  };

  const removeImageAt = (index) => {
    setEditableImageUris((prev) => {
      const next = Array.isArray(prev) ? [...prev] : [];
      next.splice(index, 1);
      return next;
    });
  };

  const formComparable = useMemo(
    () =>
      buildFormComparable({
        title,
        description,
        category,
        selectedTags,
        budget,
        audienceScope,
        audiences,
        recommendationVibes,
        recommendationEnvironment,
        recommendationNeeds,
        needsConfirmed,
        selectedCountry,
        selectedCity,
        selectedPlace,
        editableImageUris,
      }),
    [
      title,
      description,
      category,
      selectedTags,
      budget,
      audienceScope,
      audiences,
      recommendationVibes,
      recommendationEnvironment,
      recommendationNeeds,
      needsConfirmed,
      selectedCountry,
      selectedCity,
      selectedPlace,
      editableImageUris,
    ]
  );

  // Applies to any edit session (owner or admin editing another user's post).
  const hasUnsavedChanges = isEdit
    ? Boolean(editItem && editSnapshotBaseline != null && editSnapshotBaseline !== formComparable)
    : formComparable !== EMPTY_RECOMMENDATION_COMPARABLE;

  const dismissUnsavedModal = useCallback(() => {
    setUnsavedModalVisible(false);
    pendingDiscardRef.current = null;
    pendingPostSwitchParamsRef.current = null;
  }, []);

  const confirmUnsavedLeave = useCallback(() => {
    const onConfirm = pendingDiscardRef.current;
    setUnsavedModalVisible(false);
    pendingDiscardRef.current = null;
    if (onConfirm) onConfirm();
  }, []);

  const promptDiscardUnsaved = useCallback((onConfirmLeave) => {
    pendingDiscardRef.current = onConfirmLeave;
    setUnsavedModalVisible(true);
  }, []);

  const { allowLeaveRef, handleHeaderBackPress } = useUnsavedLeaveGuard({
    navigation,
    guardActive: Boolean(!isEdit || editItem),
    sessionKey: `${Boolean(isEdit)}-${editingPostKey ?? ''}`,
    hasUnsavedChanges,
    submitting,
    openUnsavedPrompt: promptDiscardUnsaved,
  });

  useBackButton(navigation, {
    title: isEdit ? 'עריכת המלצה' : 'המלצה חדשה',
    onPress: handleHeaderBackPress,
  });

  useEffect(() => {
    if (!isEdit) {
      setEditSnapshotBaseline(null);
      hydratedPostKeyRef.current = null;
      lastHydratedRouteParamsRef.current = null;
      setEditableImageUris([]);
      setExpandedSection('place');
      setValidation(emptyValidation());
      setOptionalFitOpen(false);
    }
  }, [isEdit]);

  // --- Effects ---
  useEffect(() => {
    if (!isEdit || !editItem) {
      if (isEdit && !editItem) {
        setEditSnapshotBaseline(null);
        hydratedPostKeyRef.current = null;
        lastHydratedRouteParamsRef.current = null;
      }
      return;
    }

    if (editingPostKey != null && editingPostKey === hydratedPostKeyRef.current) {
      return;
    }

    const sessionDirty =
      editSnapshotBaseline != null &&
      formComparable !== editSnapshotBaseline &&
      !forceApplyPendingPostRef.current;

    if (
      hydratedPostKeyRef.current != null &&
      editingPostKey != null &&
      editingPostKey !== hydratedPostKeyRef.current &&
      sessionDirty
    ) {
      if (pendingPostSwitchParamsRef.current != null) {
        return;
      }
      pendingPostSwitchParamsRef.current = buildEditRouteParams(editItem, editPostId);
      const restore = lastHydratedRouteParamsRef.current;
      if (restore) {
        navigation.setParams(restore);
      }
      promptDiscardUnsaved(() => {
        const next = pendingPostSwitchParamsRef.current;
        pendingPostSwitchParamsRef.current = null;
        forceApplyPendingPostRef.current = true;
        if (next) navigation.setParams(next);
      });
      return;
    }

    if (forceApplyPendingPostRef.current) {
      forceApplyPendingPostRef.current = false;
    }

    setTitle(editItem.title || '');
    setDescription(editItem.description || '');

    const resolvedCategoryId = resolveCategoryIdFromEditItem(editItem);
    const resolvedTags = resolveTagsFromEditItem(editItem);

    setCategory(resolvedCategoryId);
    setSelectedTags(resolvedTags);
    setBudget(normalizeBudgetId(editItem.budget, { allowFlexible: false }));
    setAudienceScope(editItem.facets?.audienceScope ||
      (editItem.facets?.audiences?.length ? 'selected' : 'all'));
    setAudiences(Array.isArray(editItem.facets?.audiences) ? editItem.facets.audiences : []);
    setRecommendationVibes(Array.isArray(editItem.facets?.vibes) ? editItem.facets.vibes : []);
    setRecommendationEnvironment(editItem.facets?.environments?.[0] || '');
    setRecommendationNeeds(Array.isArray(editItem.facets?.needs) ? editItem.facets.needs : []);
    setNeedsConfirmed(Boolean(editItem.facets?.needs?.length));

    const initialCountryId = editItem.destination?.countryId || null;
    const initialCityId = editItem.destination?.cityId || null;
    setSelectedCountry(initialCountryId ? { id: initialCountryId, name: editItem.destination?.countryName || initialCountryId } : null);
    setSelectedCity(initialCityId ? { id: initialCityId, name: editItem.destination?.cityName || initialCityId } : null);
    setSelectedPlace(editItem.place || null);
    setLocationQuery(editItem.place?.name || editItem.destination?.cityName || '');
    setEditableImageUris(
      (Array.isArray(editItem.media) ? editItem.media : [])
        .map((asset) => getMediaVariantUrl(asset, 'feed'))
        .filter(Boolean)
    );
    setEditSnapshotBaseline(buildEditComparable(editItem));
    setExpandedSection('place');
    setValidation(emptyValidation());
    setOptionalFitOpen(Boolean(editItem.facets?.needs?.length));
    hydratedPostKeyRef.current = editingPostKey;
    lastHydratedRouteParamsRef.current = buildEditRouteParams(editItem, editPostId);
  }, [
    isEdit,
    editingPostKey,
    editItem,
    editPostId,
    formComparable,
    editSnapshotBaseline,
    navigation,
    promptDiscardUnsaved,
  ]);

  useEffect(() => {
    if (isEdit) return;
    const prefill = route?.params?.prefillLocation;
    if (!prefill?.place?.placeId || !prefill?.destination) return;

    setSelectedCountry(prefill.destination.country || null);
    setSelectedCity(prefill.destination.city || null);
    setSelectedPlace(prefill.place);
    setLocationQuery(
      prefill.place.name || prefill.destination.city?.name || ''
    );
    setLocationResolveError(null);
  }, [isEdit, route?.params?.prefillLocation]);

  useEffect(() => {
    const q = locationQuery.trim();
    if (q.length < 2) return;
    if (hasLoadedAllCitiesForSearch) return;
    if (isFetchingAllCitiesForSearchRef.current) return;

    if (allCitiesFetchDebounceRef.current) {
      clearTimeout(allCitiesFetchDebounceRef.current);
    }

    allCitiesFetchDebounceRef.current = setTimeout(async () => {
      isFetchingAllCitiesForSearchRef.current = true;
      try {
        const citiesQuery = query(
          collectionGroup(db, 'cities'),
          where('status', '==', 'active'),
          limit(100)
        );
        const querySnapshot = await getDocs(citiesQuery);
        const citiesList = querySnapshot.docs.map((cityDoc) => {
          const parentCountry = cityDoc.ref.parent.parent;
          const countryId = parentCountry ? parentCountry.id : 'Unknown';
          return {
            id: cityDoc.id,
            countryId,
            ...cityDoc.data(),
          };
        });
        setAllCitiesForSearch(citiesList);
        setHasLoadedAllCitiesForSearch(true);
      } catch (error) {
        console.error('Error fetching all cities for search:', error);
      } finally {
        isFetchingAllCitiesForSearchRef.current = false;
      }
    }, 400);

    return () => {
      if (allCitiesFetchDebounceRef.current) {
        clearTimeout(allCitiesFetchDebounceRef.current);
        allCitiesFetchDebounceRef.current = null;
      }
    };
  }, [locationQuery, hasLoadedAllCitiesForSearch]);

  // --- Handlers ---

  // Custom handler for category change to reset sub-tags
  const handleCategoryChange = (newCatId) => {
    setCategory(newCatId);
    if (newCatId !== category) {
      setSelectedTags([]);
      setRecommendationVibes([]);
      setRecommendationEnvironment('');
      setRecommendationNeeds([]);
      setNeedsConfirmed(false);
    }
  };

  const toggleTag = (tagId) => {
    setSelectedTags((current) => {
      return current.includes(tagId)
        ? current.filter((item) => item !== tagId)
        : [...current, tagId];
    });
  };

  const attributeRequirements = useMemo(
    () => getRecommendationAttributeRequirements(selectedTags),
    [selectedTags]
  );

  useEffect(() => {
    if (!attributeRequirements.vibes) setRecommendationVibes([]);
    if (!attributeRequirements.environment) setRecommendationEnvironment('');
    setRecommendationNeeds((current) => current.filter(
      (needId) => attributeRequirements.needs.some((need) => need.value === needId)
    ));
  }, [attributeRequirements]);

  useEffect(() => {
    if (!recommendationNeeds.length) setNeedsConfirmed(false);
  }, [recommendationNeeds.length]);

  const validationValues = useMemo(() => ({
    title,
    description,
    category,
    selectedTags,
    budget,
    audienceScope,
    audiences,
    recommendationVibes,
    recommendationEnvironment,
    recommendationNeeds,
    needsConfirmed,
    selectedCountry,
    selectedCity,
    locationResolveError,
    resolvingLocation,
    attributeRequirements,
  }), [
    title,
    description,
    category,
    selectedTags,
    budget,
    audienceScope,
    audiences,
    recommendationVibes,
    recommendationEnvironment,
    recommendationNeeds,
    needsConfirmed,
    selectedCountry,
    selectedCity,
    locationResolveError,
    resolvingLocation,
    attributeRequirements,
  ]);

  const scrollToSection = useCallback((sectionId) => {
    const y = sectionLayoutsRef.current[sectionId];
    if (typeof y === 'number') {
      scrollRef.current?.scrollTo?.({ y: Math.max(0, y - spacing.sm), animated: true });
    }
  }, []);

  const replaceSectionValidation = useCallback((sectionId, nextValidation) => {
    setValidation((current) => {
      const fields = { ...(current?.fields || {}) };
      for (const field of RECOMMENDATION_SECTION_FIELDS[sectionId] || []) delete fields[field];
      Object.assign(fields, nextValidation.fields);
      const sections = { ...(current?.sections || {}) };
      delete sections[sectionId];
      if (nextValidation.sections[sectionId]?.length) sections[sectionId] = nextValidation.sections[sectionId];
      return { fields, sections };
    });
  }, []);

  const continueFromSection = useCallback((sectionId) => {
    const nextValidation = validateRecommendationForm(validationValues, sectionId);
    replaceSectionValidation(sectionId, nextValidation);
    if (sectionErrorCount(nextValidation, sectionId)) {
      setExpandedSection(sectionId);
      scrollToSection(sectionId);
      return false;
    }
    const currentIndex = RECOMMENDATION_SECTION_ORDER.indexOf(sectionId);
    const nextSection = RECOMMENDATION_SECTION_ORDER[currentIndex + 1];
    if (nextSection) {
      setExpandedSection(nextSection);
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => scrollToSection(nextSection));
      else scrollToSection(nextSection);
    }
    return true;
  }, [replaceSectionValidation, scrollToSection, validationValues]);

  const sectionIsComplete = useCallback((sectionId) => (
    sectionErrorCount(validateRecommendationForm(validationValues, sectionId), sectionId) === 0
  ), [validationValues]);

  const categoryLabel = PARENT_CATEGORIES.find((item) => item.id === category)?.label || '';
  const budgetLabel = POST_BUDGETS.find((item) => item.value === budget)?.postLabel || '';
  const placeSummary = [title.trim(), selectedCity?.name || selectedPlace?.name].filter(Boolean).join(' · ');
  const storySummary = description.trim()
    ? `${description.trim().slice(0, 48)}${description.trim().length > 48 ? '…' : ''}${editableImageUris.length ? ` · ${editableImageUris.length} תמונות` : ''}`
    : (editableImageUris.length ? `${editableImageUris.length} תמונות` : 'תיאור ותמונות');
  const categorySummary = categoryLabel
    ? `${categoryLabel}${selectedTags.length ? ` · ${selectedTags.length} תתי־קטגוריות` : ''}`
    : 'קטגוריה ותתי־קטגוריות';
  const fitSummary = [
    budgetLabel,
    audienceScope === 'all' ? 'מתאים לכולם' : (audiences.length ? `${audiences.length} קהלים` : ''),
  ].filter(Boolean).join(' · ');

  useEffect(() => {
    setValidation((current) => {
      const touchedSections = Object.keys(current?.sections || {});
      if (!touchedSections.length) return current;
      const next = emptyValidation();
      for (const sectionId of touchedSections) {
        const sectionValidation = validateRecommendationForm(validationValues, sectionId);
        Object.assign(next.fields, sectionValidation.fields);
        if (sectionValidation.sections[sectionId]?.length) {
          next.sections[sectionId] = sectionValidation.sections[sectionId];
        }
      }
      return next;
    });
  }, [validationValues]);

  const localCitiesSearchable = locationQuery.trim()
    ? (hasLoadedAllCitiesForSearch ? allCitiesForSearch : [])
    : [];

  const localAutocompleteResults = localCitiesSearchable
    .filter((city) => {
      const q = locationQuery.trim().toLowerCase();
      if (!q) return false;
      const name = (city.name || '').toLowerCase();
      const description = (city.description || '').toLowerCase();
      const countryId = (city.countryId || '').toLowerCase();
      return name.includes(q) || description.includes(q) || countryId.includes(q);
    })
    .slice(0, 20);

  const localResultsLoading = locationQuery.trim().length >= 2 && !hasLoadedAllCitiesForSearch;

  const handleSelectLocalCity = (city) => {
    if (!city?.id || !city?.countryId) return;
    setLocationResolveError(null);
    setSelectedCountry({ id: city.countryId, name: city.countryId });
    setSelectedCity({ id: city.id, name: city.name || city.id });
    setSelectedPlace(
      city.googlePlaceId
        ? {
            placeId: city.googlePlaceId,
            name: city.name || null,
            address: city.description || null,
            ...(city.coordinates ? { coordinates: city.coordinates } : {}),
          }
        : null
    );
  };

  const handleSelectGooglePlace = async (placeId) => {
    setResolvingLocation(true);
    setLocationResolveError(null);
    try {
      const result = await resolveDestinationForPlacePreview(placeId);
      setSelectedCountry(result.destination.country);
      setSelectedCity(result.destination.city);
      setSelectedPlace(result.place);
    } catch (error) {
      console.error(error);
      setSelectedCountry(null);
      setSelectedCity(null);
      setSelectedPlace(null);
      setLocationResolveError(
        error?.message || 'לא הצלחנו לאמת את פרטי המקום. נסה שוב.'
      );
      Alert.alert(
        'שגיאת מיקום',
        'לא הצלחנו לאמת את המקום כרגע. נסה שוב בעוד רגע או בחר תוצאה אחרת.'
      );
      return;
      // Avoid LogBox/RedBox noise for expected, user-handled flows.
      if (error?.code !== 'MISSING_COUNTRY' && error?.code !== 'DISPUTED_COUNTRY') {
        console.error(error);
      }
      if ((error?.code === 'MISSING_COUNTRY' || error?.code === 'DISPUTED_COUNTRY') && error?.parsed) {
        // Keep place + city (when available), and ask user to pick a country manually.
        const parsed = error.parsed;
        setPendingCountryOverridePlaceId(placeId);
        setSuggestedCountryForOverride(error?.suggestedCountry || null);
        setSelectedCountry(null);
        setSelectedCity(parsed?.cityName ? { id: parsed.cityName, name: parsed.cityName } : null);
        setSelectedPlace({
          placeId: parsed.placeId,
          name: parsed.name,
          address: parsed.address,
          url: parsed.url,
          ...(parsed.coordinates ? { coordinates: parsed.coordinates } : {}),
        });

        setLocationResolveError(
          error?.code === 'DISPUTED_COUNTRY'
            ? 'המדינה שזוהתה אוטומטית שנויה במחלוקת/לא חד-משמעית.'
            : 'חסרה מדינה עבור המיקום שנבחר.'
        );
        Alert.alert(
          'צריך לבחור מדינה',
          error?.code === 'DISPUTED_COUNTRY'
            ? 'המערכת זיהתה מדינה אוטומטית שעשויה להיות לא מדויקת. בחר מדינה ידנית כדי להמשיך.'
            : 'למיקום הזה אין מדינה בנתוני המפה. בחר מדינה ידנית כדי להמשיך.',
          [
            { text: 'ביטול', style: 'cancel' },
            {
              text: 'בחר מדינה',
              onPress: () => setCountryPickerVisible(true),
            },
          ]
        );
      } else {
        // Clear any stale location so the user can't accidentally save with an old city/country.
        setSelectedCountry(null);
        setSelectedCity(null);
        setSelectedPlace(null);

        const message = error?.message || 'לא הצלחנו לטעון את פרטי המיקום.';
        setLocationResolveError(message);
        Alert.alert('אוי לא!', 'לא הצלחנו לשמור את המיקום שבחרת. נסה לבחור מיקום אחר (למשל העיר עצמה) ולשמור שוב.');
      }
    }
    finally {
      setResolvingLocation(false);
    }
  };

  const loadCountriesForPicker = async () => {
    if (loadingCountriesForPicker) return;
    if (countriesForPicker.length > 0) return;

    setLoadingCountriesForPicker(true);
    try {
      const snap = await getDocs(collection(db, 'countries'));
      const list = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() || {}) }))
        .map((c) => ({
          id: c.id,
          name: c.name || c.id,
          code: c.code || null,
        }))
        .filter((c) => c.id);

      list.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'he'));
      setCountriesForPicker(list);
    } catch (e) {
      console.error('Failed to load countries for picker:', e);
      Alert.alert('שגיאה', 'לא הצלחנו לטעון את רשימת המדינות.');
    } finally {
      setLoadingCountriesForPicker(false);
    }
  };

  useEffect(() => {
    if (countryPickerVisible) {
      loadCountriesForPicker();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countryPickerVisible]);

  const handleSelectManualCountry = async (country) => {
    const placeId = pendingCountryOverridePlaceId || selectedPlace?.placeId;
    if (!placeId) {
      setCountryPickerVisible(false);
      return;
    }

    setCountryPickerVisible(false);
    setResolvingLocation(true);
    setLocationResolveError(null);

    try {
      const result = await resolveDestinationForPlacePreview(placeId, {
        countryOverride: {
          id: country?.id,
          name: country?.name || country?.id,
          code: country?.code || null,
        },
      });
      setSelectedCountry(result.destination.country);
      setSelectedCity(result.destination.city);
      setSelectedPlace(result.place);
      setSelectedCountryOverrideId(country?.id || null);
      setPendingCountryOverridePlaceId(null);
      setSuggestedCountryForOverride(null);
    } catch (e) {
      // This is still user-visible via Alert; keep console clean unless needed.
      console.error(e);
      setSelectedCountry(null);
      setLocationResolveError(e?.message || 'לא הצלחנו לשמור את המדינה שנבחרה.');
      Alert.alert('שגיאה', 'לא הצלחנו לשמור את המדינה שנבחרה. נסה לבחור מדינה אחרת.');
    } finally {
      setResolvingLocation(false);
    }
  };

const handleSubmit = async () => {
    const tier = getUserTier(auth.currentUser);
    if (tier === 'guest') {
      Alert.alert('יש להתחבר', 'כדי ליצור/לערוך המלצה צריך להתחבר.');
      navigation.navigate('Login');
      return;
    }
    if (tier === 'unverified') {
      Alert.alert('נדרש אימות', 'כדי ליצור/לערוך המלצה צריך לאמת את האימייל.');
      navigation.navigate('VerifyEmail');
      return;
    }

    const nextValidation = validateRecommendationForm(validationValues);
    setValidation(nextValidation);
    const invalidSection = firstInvalidSection(nextValidation, RECOMMENDATION_SECTION_ORDER);
    if (invalidSection) {
      setExpandedSection(invalidSection);
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => scrollToSection(invalidSection));
      else scrollToSection(invalidSection);
      return;
    }

    setSubmitting(true);
    try {
      // Build final images list: keep existing remote URLs, upload local URIs.
      const current = Array.isArray(editableImageUris) ? editableImageUris.slice(0, 5) : [];
      const isRemote = (uri) => typeof uri === 'string' && /^https?:\/\//i.test(uri);
      const localUris = current.filter((uri) => !isRemote(uri));

      const uploadedLocal = localUris.length ? await uploadImageAssets(localUris) : [];
      const uploadedQueue = [...uploadedLocal];
      const finalMedia = current.map((uri) => {
        if (!isRemote(uri)) return uploadedQueue.shift();
        return findMediaAssetByUrl(editItem?.media, uri);
      }).filter(Boolean);
      const destinationPayload = selectedPlace?.placeId
        ? {
            placeId: selectedPlace.placeId,
          }
        : {
            destinationRef: {
              countryId: selectedCountry.id,
              cityId: selectedCity.id,
            },
          };
      const callablePayload = {
        ...(isEdit ? { recommendationId: editPostId } : {}),
        ...destinationPayload,
        recommendation: {
          taxonomyVersion: TRAVEL_TAXONOMY_VERSION,
          title,
          description,
          category: getCategoryLabel(category),
          categoryId: category,
          tags: selectedTags,
          budget,
          media: finalMedia,
          attributes: {
            audienceScope,
            audiences,
            vibes: recommendationVibes,
            environment: recommendationEnvironment,
            needs: recommendationNeeds,
            needsConfirmed,
          },
        },
      };

      await saveRecommendation(callablePayload);
      if (!isEdit) {
        Alert.alert("איזה כיף!", "ההמלצה נוספה בהצלחה!");
      } else {
        Alert.alert("איזה כיף!", "ההמלצה עודכנה בהצלחה!");
      }
      if (
        typeof URL !== 'undefined' &&
        typeof URL.revokeObjectURL === 'function'
      ) {
        Array.from(
          new Set(
            editableImageUris.filter(
              (uri) => typeof uri === 'string' && uri.startsWith('blob:')
            )
          )
        ).forEach((uri) => URL.revokeObjectURL(uri));
      }
      allowLeaveRef.current = true;
      navigation.goBack();

    } catch (error) {
      console.error("Error saving document: ", error);
      // Unclaimed prepared media is removed by the scheduled server cleanup.
      Alert.alert("אוי לא!", "לא הצלחנו לשמור את ההמלצה.");
    } finally {
      setSubmitting(false);
    }
  };

  // --- Render ---
  const currentStep = Math.max(1, RECOMMENDATION_SECTION_ORDER.indexOf(expandedSection) + 1);
  return (
    <View style={[common.container, guidedStyles.screen]}>
      <ScrollView
        ref={scrollRef}
        style={guidedStyles.scroll}
        contentContainerStyle={guidedStyles.content}
        keyboardShouldPersistTaps="handled"
      >
        <GuidedFormHeader
          currentStep={currentStep}
          totalSteps={RECOMMENDATION_SECTION_ORDER.length}
          title={isEdit ? 'עריכת ההמלצה' : 'בואו נבנה המלצה מעולה'}
          intro="רק המידע הנחוץ מוצג בכל שלב. תמיד אפשר לחזור ולשנות."
          testID="add-rec-guided-header"
        />

        <View onLayout={(event) => { sectionLayoutsRef.current.place = event.nativeEvent.layout.y; }}>
          <GuidedFormSection
            id="place"
            index={1}
            title="המקום"
            summary={placeSummary || 'כותרת ומיקום מדויק'}
            expanded={expandedSection === 'place'}
            completed={sectionIsComplete('place')}
            errorCount={sectionErrorCount(validation, 'place')}
            onToggle={() => setExpandedSection((current) => current === 'place' ? null : 'place')}
            onContinue={() => continueFromSection('place')}
            testIDPrefix="add-rec-section"
          >
        <FormInput
          label="כותרת"
          required
          rtl
          placeholder="למשל: 'המסעדה האיטלקית הכי טובה בעיר!'"
          value={title}
          onChangeText={setTitle}
          error={validation.fields.title}
          testID="add-rec-title-input"
        />

        <View style={guidedStyles.fieldGroup}>
          <Text style={guidedStyles.fieldLabel}>מיקום מדויק (חובה)</Text>
          <Text style={guidedStyles.fieldHelper}>חפשו ובחרו תוצאה כדי שנוכל לשייך את ההמלצה לעיר הנכונה</Text>
          <GooglePlacesInput
            mode="google"
            value={locationQuery}
            onChangeValue={(text) => {
              setLocationQuery(text);
              setSelectedPlace(null);
              setLocationResolveError(null);
              setPendingCountryOverridePlaceId(null);
              setSuggestedCountryForOverride(null);
              // Don't clear selected destination immediately; user may be editing text.
            }}
            localResults={localAutocompleteResults}
            localResultsLoading={localResultsLoading}
            onSelectLocal={handleSelectLocalCity}
            onSelect={handleSelectGooglePlace}
            googleFallbackDelayMs={2000}
            googleSearchFn={(text, opts) => searchPlaces(text, { ...opts, types: 'all' })}
            placeholder="חפש מקום / אטרקציה / מסעדה..."
            inputTestID="add-rec-location-input"
          />
          {!!validation.fields.location && (
            <Text style={guidedStyles.fieldError} accessibilityLiveRegion="polite">
              {validation.fields.location}
            </Text>
          )}

          {false && !!(locationResolveError && (pendingCountryOverridePlaceId || selectedPlace?.placeId) && !selectedCountry?.id) && (
            <TouchableOpacity
              onPress={() => setCountryPickerVisible(true)}
              activeOpacity={0.85}
              style={{ alignSelf: 'flex-end', marginTop: 8 }}
            >
              <Text style={{ color: colors.primary, fontWeight: 'bold' }}>
                בחר מדינה ידנית
              </Text>
            </TouchableOpacity>
          )}

          {false && !!(selectedPlace?.placeId && selectedCountry?.id) && (
            <TouchableOpacity
              onPress={() => {
                setPendingCountryOverridePlaceId(selectedPlace.placeId);
                setCountryPickerVisible(true);
              }}
              activeOpacity={0.85}
              style={{ alignSelf: 'flex-end', marginTop: 8 }}
            >
              <Text style={{ color: colors.textSecondary, fontWeight: 'bold' }}>
                שנה מדינה
              </Text>
            </TouchableOpacity>
          )}
        </View>
          </GuidedFormSection>
        </View>

        <View onLayout={(event) => { sectionLayoutsRef.current.story = event.nativeEvent.layout.y; }}>
          <GuidedFormSection
            id="story"
            index={2}
            title="הסיפור והתמונות"
            summary={storySummary}
            expanded={expandedSection === 'story'}
            completed={sectionIsComplete('story')}
            errorCount={sectionErrorCount(validation, 'story')}
            onToggle={() => setExpandedSection((current) => current === 'story' ? null : 'story')}
            onContinue={() => continueFromSection('story')}
            testIDPrefix="add-rec-section"
          >
        <FormInput
          label="למה המקום מומלץ?"
          required
          rtl
          placeholder="תאר לנו למה אתה ממליץ על המקום הזה..."
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
          error={validation.fields.description}
          testID="add-rec-description-input"
        />

        <Text style={guidedStyles.fieldLabel}>תמונות (רשות)</Text>
        <Text style={guidedStyles.fieldHelper}>אפשר להוסיף עד חמש תמונות ולמחוק את התמונה המוצגת</Text>
        <ImagePickerBox
          imageUris={editablePreviewUris}
          onPress={handleAddImages}
          onRemove={removeImageAt}
          maxImages={5}
          placeholderText="הוספת תמונות"
          imageFit="cover"
          style={{ marginBottom: spacing.sm }}
          testID="add-rec-image-picker"
        />
          </GuidedFormSection>
        </View>

        <View onLayout={(event) => { sectionLayoutsRef.current.category = event.nativeEvent.layout.y; }}>
          <GuidedFormSection
            id="category"
            index={3}
            title="קטגוריה וסוג"
            summary={categorySummary}
            expanded={expandedSection === 'category'}
            completed={sectionIsComplete('category')}
            errorCount={sectionErrorCount(validation, 'category')}
            onToggle={() => setExpandedSection((current) => current === 'category' ? null : 'category')}
            onContinue={() => continueFromSection('category')}
            testIDPrefix="add-rec-section"
          >
            <RtlChoiceGroup
              label="מה הכי מתאים להמלצה?"
              helper="בחרו קטגוריה אחת. הרשימה מתחילה מימין."
              options={PARENT_CATEGORIES}
              selectedIds={category ? [category] : []}
              onToggle={handleCategoryChange}
              selectionMode="single"
              variant="tile"
              layout="responsive"
              error={validation.fields.category}
              testIDPrefix="add-rec-category"
            />
            {category ? (
              <View style={guidedStyles.nestedPanel}>
                <Text style={guidedStyles.nestedTitle}>תתי־קטגוריות · {categoryLabel}</Text>
                <RtlChoiceGroup
                  helper="אפשר לבחור יותר מאחת"
                  options={TAG_OPTIONS_BY_CATEGORY[category] || []}
                  selectedIds={selectedTags}
                  onToggle={toggleTag}
                  variant="chip"
                  layout="wrap"
                  error={validation.fields.selectedTags}
                  testIDPrefix="add-rec-tag"
                />
              </View>
            ) : (
              <Text style={guidedStyles.fieldHelper}>אחרי בחירת קטגוריה יוצגו כאן האפשרויות המתאימות בלבד.</Text>
            )}
          </GuidedFormSection>
        </View>

        <View onLayout={(event) => { sectionLayoutsRef.current.fit = event.nativeEvent.layout.y; }}>
          <GuidedFormSection
            id="fit"
            index={4}
            title="למי זה מתאים"
            summary={fitSummary || 'מחיר, קהל ומאפיינים'}
            expanded={expandedSection === 'fit'}
            completed={sectionIsComplete('fit')}
            errorCount={sectionErrorCount(validation, 'fit')}
            onToggle={() => setExpandedSection((current) => current === 'fit' ? null : 'fit')}
            testIDPrefix="add-rec-section"
          >
        <RtlChoiceGroup
          label="רמת מחיר (חובה)"
          options={POST_BUDGETS}
          selectedIds={budget ? [budget] : []}
          onToggle={setBudget}
          selectionMode="single"
          variant="segment"
          getItemTheme={(label) => getBudgetTheme(label)}
          error={validation.fields.budget}
          testIDPrefix="add-rec-budget"
        />

        <RtlChoiceGroup
          label="למי זה מתאים?"
          options={[
            { id: 'all', label: 'מתאים לכולם' },
            { id: 'selected', label: 'בחירת קהלים' },
          ]}
          selectedIds={[audienceScope]}
          onToggle={(nextScope) => {
            setAudienceScope(nextScope);
            if (nextScope === 'all') setAudiences([]);
          }}
          selectionMode="single"
          variant="segment"
          testIDPrefix="add-rec-audience-scope"
        />

        {audienceScope === 'selected' ? (
          <RtlChoiceGroup
            label="מתאים במיוחד למי? (חובה)"
            options={TRAVEL_PARTIES}
            selectedIds={audiences}
            onToggle={(value) => {
              setAudiences((current) => current.includes(value)
                ? current.filter((item) => item !== value)
                : [...current, value].slice(0, 4));
            }}
            variant="chip"
            error={validation.fields.audiences}
            testIDPrefix="add-rec-audience"
          />
        ) : null}

        {attributeRequirements.vibes ? (
          <RtlChoiceGroup
            label="אווירה (חובה)"
            options={VIBES}
            selectedIds={recommendationVibes}
            onToggle={(value) => {
              setRecommendationVibes((current) => current.includes(value)
                ? current.filter((item) => item !== value)
                : [...current, value].slice(0, 3));
            }}
            variant="chip"
            error={validation.fields.vibes}
            testIDPrefix="add-rec-vibe"
          />
        ) : null}

        {attributeRequirements.environment ? (
          <RtlChoiceGroup
            label="סביבה (חובה)"
            options={ENVIRONMENTS}
            selectedIds={recommendationEnvironment ? [recommendationEnvironment] : []}
            onToggle={setRecommendationEnvironment}
            selectionMode="single"
            variant="segment"
            error={validation.fields.environment}
            testIDPrefix="add-rec-environment"
          />
        ) : null}

        {attributeRequirements.needs.length ? (
          <>
            <TouchableOpacity
              style={guidedStyles.optionalToggle}
              onPress={() => setOptionalFitOpen((current) => !current)}
              accessibilityRole="button"
              accessibilityState={{ expanded: optionalFitOpen }}
              testID="add-rec-optional-toggle"
            >
              <Text style={guidedStyles.optionalToggleText}>מידע מעשי ונגישות (רשות)</Text>
              <Text style={guidedStyles.optionalToggleText}>{optionalFitOpen ? '−' : '+'}</Text>
            </TouchableOpacity>
            {optionalFitOpen ? (
              <View style={guidedStyles.nestedPanel}>
                <RtlChoiceGroup
                  helper="סמנו רק מידע שנבדק או צוין במפורש"
                  options={attributeRequirements.needs}
                  selectedIds={recommendationNeeds}
                  onToggle={(value) => {
                    setRecommendationNeeds((current) => current.includes(value)
                      ? current.filter((item) => item !== value)
                      : [...current, value]);
                  }}
                  variant="chip"
                  testIDPrefix="add-rec-need"
                />
                {recommendationNeeds.length ? (
                  <TouchableOpacity
                    style={guidedStyles.checkboxRow}
                    onPress={() => setNeedsConfirmed((current) => !current)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: needsConfirmed }}
                    testID="add-rec-needs-confirmed"
                  >
                    <View style={[guidedStyles.checkboxBox, needsConfirmed && guidedStyles.checkboxBoxChecked]}>
                      {needsConfirmed ? <Text style={guidedStyles.checkboxCheck}>✓</Text> : null}
                    </View>
                    <Text style={guidedStyles.checkboxText}>אישרתי שהמידע הזה צוין או נבדק במפורש</Text>
                  </TouchableOpacity>
                ) : null}
                {!!validation.fields.needsConfirmed && <Text style={guidedStyles.fieldError}>{validation.fields.needsConfirmed}</Text>}
              </View>
            ) : null}
          </>
        ) : null}
          </GuidedFormSection>
        </View>
      </ScrollView>

      <GuidedFormFooter
        label={isEdit ? 'שמור שינויים' : 'פרסם המלצה'}
        onPress={handleSubmit}
        loading={submitting}
        disabled={submitting}
        testID="add-rec-submit"
      />

      {false && <SelectionModal
        visible={countryPickerVisible}
        onClose={() => setCountryPickerVisible(false)}
        title={loadingCountriesForPicker ? 'טוען מדינות...' : 'בחר מדינה'}
        data={countriesForPicker}
        onSelect={handleSelectManualCountry}
        selectedId={selectedCountry?.id}
        emptyText={loadingCountriesForPicker ? 'טוען...' : 'אין מדינות להצגה'}
      />}

      <UnsavedChangesModal
        visible={unsavedModalVisible}
        title={UNSAVED_LEAVE_TITLE}
        message={UNSAVED_LEAVE_MESSAGE}
        onCancel={dismissUnsavedModal}
        onConfirm={confirmUnsavedLeave}
      />

    </View>
  );
}
