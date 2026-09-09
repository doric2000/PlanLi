import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { randomUUID } from 'expo-crypto';
import {
  NestableDraggableFlatList,
  NestableScrollContainer,
  ScaleDecorator,
} from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AppText from '../../../components/AppText';
import CachedImage from '../../../components/CachedImage';
import { FormInput } from '../../../components/FormInput';
import RtlChoiceGroup from '../../../components/RtlChoiceGroup';
import { CONTENT_COMPOSER_COPY } from '../../../constants/contentComposerCopy';
import { useBackButton } from '../../../hooks/useBackButton';
import useRouteDraftMedia from '../../../hooks/useRouteDraftMedia';
import {
  PACES, POST_BUDGETS, ROUTE_DIFFICULTIES, SEASONS, TRANSPORT_MODES,
  TRAVEL_TAXONOMY_VERSION,
} from '../../../constants/travelTaxonomy';
import {
  discardRouteDraft, getCurrentRouteDraft, loadRouteDetails, saveRouteDraft,
} from '../../../services/RouteService';
import { colors, routeBuilderStyles as styles } from '../../../styles';
import SingleDestinationPicker from '../../community/components/SingleDestinationPicker';
import { useContentPublish } from '../../publishing/ContentPublishContext';
import { NoyaTourTarget, useNoyaTour } from '../../noya/NoyaTourContext';
import { NOYA_CREATOR_TARGETS } from '../../noya/NoyaTourDefinitions';
import StopEditorModal from '../components/StopEditorModal';
import { extractRoutePublishMedia } from '../utils/routeMedia';
import { normalizeRouteTimeInput } from '../utils/routeTime';
import { validateRouteComposer } from '../utils/routeComposerValidation';
import {
  flattenRouteStops, getStopCoordinates, getStopMediaUrls, markUnchangedRouteLocations,
} from '../utils/routeStops';

const SAVE_DELAY_MS = 900;
export const MAX_ROUTE_MEDIA = 40;
export const routeFooterInsetsStyle = (bottomInset) => ({
  paddingBottom: Math.max(14, Number(bottomInset) || 0),
});
export const reorderRouteStops = (stops, from, to) => {
  const next = Array.isArray(stops) ? [...stops] : [];
  if (from === to || from < 0 || to < 0 || from >= next.length || to >= next.length) return next;
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
};
const emptyDays = (count) => Array.from({ length: count }, (_, index) => ({
  id: `day_${String(index + 1).padStart(3, '0')}`, title: '', description: '', media: null, stops: [],
}));

const comparableDestination = (value) => value?.countryId && value?.cityId ? {
  countryId: value.countryId,
  cityId: value.cityId,
  countryName: value.countryName || '',
  cityName: value.cityName || value.name || '',
  providerPlaceId: value.providerPlaceId || '',
  resolvedPlaceToken: value.resolvedPlaceToken || '',
} : null;

const comparableCoordinates = (value) => {
  const lat = Number(value?.lat ?? value?.latitude);
  const lng = Number(value?.lng ?? value?.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
};

const comparablePlace = (value) => value?.placeId || value?.name || value?.address ? {
  placeId: value.placeId || '',
  resolvedPlaceToken: value.resolvedPlaceToken || '',
  name: value.name || '',
  address: value.address || '',
  coordinates: comparableCoordinates(value.coordinates || value.geometry?.location),
} : null;

export const routeDraftForServer = (draft) => ({
  ...(draft || {}),
  days: (Array.isArray(draft?.days) ? draft.days : []).map((day) => {
    const serverDay = { ...(day || {}) };
    delete serverDay.image;
    serverDay.stops = (Array.isArray(day?.stops) ? day.stops : []).map((stop) => {
      const serverStop = { ...(stop || {}) };
      delete serverStop.image;
      delete serverStop.pendingMedia;
      return serverStop;
    });
    return serverDay;
  }),
});

export const mergeRestoredRouteMedia = (draft, entries = []) => {
  const byStopId = new Map();
  const previousLocations = new Map();
  const stopIdCounts = new Map();
  (draft?.days || []).forEach((day) => (day.stops || []).forEach((stop) =>
    stopIdCounts.set(stop.id, (stopIdCounts.get(stop.id) || 0) + 1)));
  [...(entries || [])].sort((a, b) => (a.position || 0) - (b.position || 0)).forEach((entry) => {
    if (!entry?.dayId || !entry?.stopId || !entry?.uri) return;
    const key = `${entry.dayId}/${entry.stopId}`;
    (entry.previousLocations || []).forEach((location) => {
      const previousKey = `${location.dayId}/${location.stopId}`;
      if (!previousLocations.has(previousKey)) previousLocations.set(previousKey, new Set());
      previousLocations.get(previousKey).add(key);
    });
    if (!byStopId.has(key)) byStopId.set(key, []);
    byStopId.get(key).push({
      manifestLocation: { dayId: entry.dayId, stopId: entry.stopId },
      uri: entry.uri,
      ...(entry.sourceUri ? { sourceUri: entry.sourceUri } : {}),
      ...(entry.previewUri ? { previewUri: entry.previewUri } : {}),
      ...(entry.sourceId ? { sourceId: entry.sourceId } : {}),
      ...(entry.assetId ? { assetId: entry.assetId } : {}),
      ...(entry.width ? { width: entry.width } : {}),
      ...(entry.height ? { height: entry.height } : {}),
      ...(entry.mediaId ? { mediaId: entry.mediaId } : {}),
      ...(entry.localReference ? { localReference: entry.localReference } : {}),
      ...(entry.transform ? { transform: entry.transform } : {}),
      ...(entry.persistence ? { persistence: entry.persistence } : {}),
    });
  });
  return {
    ...(draft || {}),
    days: (draft?.days || []).map((day) => ({
      ...day,
      stops: (day.stops || []).map((stop) => {
        const matches = Array.from(byStopId.entries()).filter(([key]) => key.endsWith(`/${stop.id}`));
        const previousKeys = Array.from(previousLocations.get(`${day.id}/${stop.id}`) || []);
        // A crash can interrupt the two local/server writes of a move. Only a
        // unique stop identity may recover media from its previous day.
        const pendingMedia = byStopId.get(`${day.id}/${stop.id}`) ||
          (previousKeys.length === 1 ? byStopId.get(previousKeys[0]) : null) ||
          (stopIdCounts.get(stop.id) === 1 && matches.length === 1 ? matches[0][1] : []);
        if (!pendingMedia.length) return stop;
        return {
          ...stop,
          pendingMedia,
          image: pendingMedia[0]?.uri || stop.image || null,
        };
      }),
    })),
  };
};

const countPendingRouteMedia = (days = []) => (days || []).reduce((total, day) => (
  total + (day?.stops || []).reduce((stopTotal, stop) => (
    stopTotal + (Array.isArray(stop?.pendingMedia) ? stop.pendingMedia.length : 0)
  ), 0)
), 0);

export const countRouteMedia = (days = []) => (days || []).reduce((total, day) => (
  total + (day?.media ? 1 : 0) + (day?.stops || []).reduce((stopTotal, stop) => (
    stopTotal
      + (stop?.media ? 1 : 0)
      + (Array.isArray(stop?.additionalMedia) ? stop.additionalMedia.length : 0)
      + (Array.isArray(stop?.pendingMedia) ? stop.pendingMedia.length : 0)
  ), 0)
), 0);

const destinationFromRoute = (route) => {
  const destination = route?.destinations?.[0] || route?.days?.flatMap((day) => day?.stops || [])
    .map((stop) => stop?.destination).find((value) => value?.countryId && value?.cityId);
  if (!destination) return null;
  return {
    key: `city:${destination.countryId}:${destination.cityId}`,
    kind: 'city',
    countryId: destination.countryId,
    cityId: destination.cityId,
    countryName: destination.countryName || destination.countryId,
    name: destination.cityName || destination.name || destination.cityId,
  };
};

const routeAsDraft = (route) => {
  const area = route?.area || destinationFromRoute(route);
  const rawDays = Array.isArray(route?.days) && route.days.length
    ? route.days
    : emptyDays(Math.max(1, Number(route?.dayCount || 1)));
  const days = rawDays.map((day, dayIndex) => ({
    ...day,
    id: day.id || `day_${String(dayIndex + 1).padStart(3, '0')}`,
    stops: (day.stops || []).map((stop, stopIndex) => ({
      ...stop,
      id: stop.id || `stop_${dayIndex + 1}_${stopIndex + 1}`,
      locationPrecision: stop.locationPrecision || (stop.place?.placeId ? 'exact' : 'general'),
    })),
  }));
  return {
    area,
    dayCount: days.length,
    title: route?.title || '',
    description: route?.description || '',
    categoryIds: route?.categoryIds || [],
    subcategoryIds: route?.subcategoryIds || [],
    attributes: {
      audienceScope: route?.attributes?.audienceScope || route?.facets?.audienceScope ||
        (route?.facets?.audiences?.length ? 'selected' : 'all'),
      audiences: route?.attributes?.audiences || route?.facets?.audiences || [],
      budgetLevel: route?.attributes?.budgetLevel || route?.facets?.budgetLevel || '',
      vibes: route?.attributes?.vibes || route?.facets?.vibes || [],
      travelerStyles: route?.attributes?.travelerStyles || route?.facets?.travelerStyles || [],
      needs: route?.attributes?.needs || route?.facets?.needs || [],
      needsCoverageConfirmed: route?.attributes?.needsCoverageConfirmed === true ||
        route?.facets?.needsScope === 'entire_route',
      seasons: route?.attributes?.seasons || route?.facets?.seasons || [],
      environment: route?.attributes?.environment || route?.facets?.environments?.[0] || '',
    },
    difficulty: route?.difficulty || '',
    experienceLevel: route?.experienceLevel || '',
    transportModes: route?.transportModes || [],
    pace: route?.pace || '',
    priceBasis: 'whole_route',
    priceNote: route?.priceNote || '',
    localMediaCount: Number(route?.localMediaCount || 0),
    days,
  };
};

export const routeEditorComparable = (value) => {
  const draft = routeAsDraft(value);
  return JSON.stringify({
    area: comparableDestination(draft.area),
    dayCount: draft.days.length,
    title: draft.title.trim(),
    description: draft.description.trim(),
    categoryIds: draft.categoryIds,
    subcategoryIds: draft.subcategoryIds,
    attributes: draft.attributes,
    difficulty: draft.difficulty,
    experienceLevel: draft.experienceLevel,
    transportModes: draft.transportModes,
    pace: draft.pace,
    priceBasis: 'whole_route',
    priceNote: draft.priceNote.trim(),
    days: draft.days.map((day) => ({
      id: day.id,
      title: (day.title || '').trim(),
      description: (day.description || '').trim(),
      media: day.media || null,
      stops: (day.stops || []).map((stop) => ({
        id: stop.id,
        title: (stop.title || '').trim(),
        description: (stop.description || '').trim(),
        location: (stop.location || '').trim(),
        country: (stop.country || '').trim(),
        locationPrecision: stop.locationPrecision || '',
        destination: comparableDestination(stop.destination || stop.destinationRef),
        place: comparablePlace(stop.place),
        coordinates: comparableCoordinates(stop.coordinates || stop.place?.coordinates),
        sourceRecommendationId: stop.source?.recommendationId || stop.recommendationId || '',
        startTime: stop.startTime || '',
        durationMinutes: stop.durationMinutes == null || stop.durationMinutes === ''
          ? null
          : Number(stop.durationMinutes),
        categoryId: stop.categoryId || '',
        subcategoryIds: stop.subcategoryIds || [],
        media: stop.media || null,
        additionalMedia: stop.additionalMedia || [],
        pendingMedia: stop.pendingMedia || [],
        mediaOrder: stop.mediaOrder?.includes('local') ? stop.mediaOrder : [],
        editorState: stop.editorState?.locationIncomplete || stop.editorState?.query ||
          normalizeRouteTimeInput(stop.editorState?.startTime || '') === null ||
          (stop.editorState?.durationMinutes && (!Number.isSafeInteger(Number(stop.editorState.durationMinutes)) ||
            Number(stop.editorState.durationMinutes) < 1 || Number(stop.editorState.durationMinutes) > 1440))
          ? stop.editorState : null,
      })),
    })),
  });
};

function FocusClearingFormInput({ placeholder, onFocus, onBlur, ...props }) {
  const [focused, setFocused] = useState(false);
  return <FormInput {...props} placeholder={focused ? '' : placeholder} onFocus={(event) => {
    setFocused(true); onFocus?.(event);
  }} onBlur={(event) => { setFocused(false); onBlur?.(event); }} />;
}

export default function AddRoutesScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { requestCreatorStep } = useNoyaTour();
  const routeToEdit = route?.params?.routeToEdit || null;
  const sourceRouteId = routeToEdit?.id || routeToEdit?.routeId || null;
  const publishJobId = route?.params?.publishJobId || null;
  const { endReview, enqueueCreate, loadJobForReview } = useContentPublish();
  const {
    draftJobId,
    forgetMedia: forgetDurableImage,
    mediaForItem: durableMediaForItem,
    persistMedia: persistDurableMedia,
    waitForMedia: waitForDurableMedia,
    bindDraft: bindDraftMedia,
    clearDraft: clearDraftMedia,
    clearStaleDraft: clearStaleDraftMedia,
    restoreDraft: restoreDraftMedia,
    moveStopMedia,
  } = useRouteDraftMedia();
  const [mode, setMode] = useState('loading');
  const [existingDraft, setExistingDraft] = useState(null);
  const [startBusy, setStartBusy] = useState(false);
  const [startError, setStartError] = useState('');
  const [draftId, setDraftId] = useState('');
  const [area, setArea] = useState(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [days, setDays] = useState(() => emptyDays(1));
  const [budgetLevel, setBudgetLevel] = useState('');
  const [priceNote, setPriceNote] = useState('');
  const [transportModes, setTransportModes] = useState([]);
  const [difficulty, setDifficulty] = useState('');
  const [experienceLevel, setExperienceLevel] = useState('');
  const [pace, setPace] = useState('');
  const [seasons, setSeasons] = useState([]);
  const [categoryIds, setCategoryIds] = useState([]);
  const [subcategoryIds, setSubcategoryIds] = useState([]);
  const [preservedAttributes, setPreservedAttributes] = useState({});
  const [activeDayIndex, setActiveDayIndex] = useState(0);
  const [stopEditorIntent, setStopEditorIntent] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [optionalOpen, setOptionalOpen] = useState(false);
  const [dayManagerOpen, setDayManagerOpen] = useState(false);
  const [dayDetailsOpen, setDayDetailsOpen] = useState(false);
  const [transferStopId, setTransferStopId] = useState(null);
  const [editorBusy, setEditorBusy] = useState(false);
  const [moveBusy, setMoveBusy] = useState(false);
  const [validationTarget, setValidationTarget] = useState(null);
  const sectionYRef = useRef({});
  const titleInputRef = useRef(null);
  const descriptionInputRef = useRef(null);
  const areaInputRef = useRef(null);
  const [saveStatus, setSaveStatus] = useState('saved');
  const [saveError, setSaveError] = useState('');
  const [missingLocalMediaCount, setMissingLocalMediaCount] = useState(0);
  const [sourceComparable, setSourceComparable] = useState('');
  const [publishBusy, setPublishBusy] = useState(false);
  const [validationMessage, setValidationMessage] = useState('');
  const draftIdRef = useRef('');
  const versionRef = useRef(0);
  const sourceRouteIdRef = useRef(null);
  const lastSavedComparableRef = useRef('');
  const saveQueueRef = useRef(Promise.resolve());
  const pendingSaveRequestRef = useRef(null);
  const mountedRef = useRef(true);
  const allowLeaveRef = useRef(false);
  const leavePromptOpenRef = useRef(false);
  const pauseAutosaveRef = useRef(false);
  const publishHandoffRef = useRef(false);
  const latestDraftPayloadRef = useRef(null);
  const latestDraftComparableRef = useRef('');
  const builderScrollRef = useRef(null);
  const publishGuideScrolledRef = useRef(false);

  useEffect(() => () => {
    if (publishJobId && !publishHandoffRef.current && typeof endReview === 'function') {
      endReview(publishJobId);
    }
  }, [endReview, publishJobId]);
  const isEditingRoute = Boolean(sourceRouteId || sourceRouteIdRef.current);

  useEffect(() => {
    if (mode !== 'editor' || draftId || isEditingRoute || publishJobId) return;
    requestCreatorStep('route', 0);
  }, [draftId, isEditingRoute, mode, publishJobId, requestCreatorStep]);

  useEffect(() => {
    if (mode !== 'editor' || isEditingRoute || publishJobId || stopEditorIntent ||
      !flattenRouteStops(days).some((stop) => stop.title && !stop.editorState?.locationIncomplete)) return;
    const shown = requestCreatorStep('route', 2);
    if (!shown || publishGuideScrolledRef.current) return;
    publishGuideScrolledRef.current = true;
    const timer = setTimeout(() => {
      builderScrollRef.current?.scrollToEnd?.({ animated: true });
    }, 120);
    return () => clearTimeout(timer);
  }, [days, isEditingRoute, mode, publishJobId, requestCreatorStep, stopEditorIntent]);

  const hydrateDraft = useCallback((draft, { localSourceRouteId = null } = {}) => {
    const normalized = routeAsDraft(draft);
    const nextDraftId = draft.id || '';
    const nextSourceRouteId = draft.sourceRouteId || localSourceRouteId || null;
    draftIdRef.current = nextDraftId;
    versionRef.current = Number(draft.version || 0);
    sourceRouteIdRef.current = nextSourceRouteId;
    setDraftId(nextDraftId);
    setArea(normalized.area);
    setTitle(normalized.title);
    setDescription(normalized.description);
    setDays(normalized.days);
    setBudgetLevel(normalized.attributes.budgetLevel);
    setPriceNote(normalized.priceNote);
    setTransportModes(normalized.transportModes);
    setDifficulty(normalized.difficulty);
    setExperienceLevel(normalized.experienceLevel);
    setPace(normalized.pace);
    setSeasons(normalized.attributes.seasons);
    setCategoryIds(normalized.categoryIds);
    setSubcategoryIds(normalized.subcategoryIds);
    setPreservedAttributes(normalized.attributes);
    setActiveDayIndex(0);
    setSaveStatus('saved');
    setSaveError('');
    publishHandoffRef.current = false;
    pauseAutosaveRef.current = false;
    leavePromptOpenRef.current = false;
    setMode('editor');
    return normalized;
  }, []);

  const hydrateServerDraft = useCallback(async (draft) => {
    const restored = await restoreDraftMedia(draft?.id, draft?.localMediaCount);
    const merged = mergeRestoredRouteMedia(draft, restored.entries);
    const reconciled = new Set();
    for (const day of merged.days || []) for (const stop of day.stops || []) for (const item of stop.pendingMedia || []) {
      const previous = item.manifestLocation;
      const key = previous && `${previous.dayId}/${previous.stopId}`;
      if (previous && !reconciled.has(key) && (previous.dayId !== day.id || previous.stopId !== stop.id)) {
        await moveStopMedia({ fromDayId: previous.dayId, toDayId: day.id, stopId: previous.stopId, toStopId: stop.id });
        reconciled.add(key);
      }
      delete item.manifestLocation;
    }
    setMissingLocalMediaCount(Math.max(restored.missingCount || 0,
      Number(draft?.localMediaCount || 0) - countPendingRouteMedia(merged.days)));
    return hydrateDraft(merged);
  }, [hydrateDraft, moveStopMedia, restoreDraftMedia]);

  const openSourceLocally = useCallback(() => {
    const initial = routeAsDraft(routeToEdit);
    if (!initial.area) {
      setStartError('לא הצלחנו לזהות יעד למסלול הקיים. כדאי להוסיף יעד לפני העריכה.');
      setMode('loadError');
      return false;
    }
    const normalized = hydrateDraft(initial, { localSourceRouteId: sourceRouteId });
    setMissingLocalMediaCount(0);
    const comparable = routeEditorComparable(normalized);
    lastSavedComparableRef.current = comparable;
    setSourceComparable(comparable);
    return true;
  }, [hydrateDraft, routeToEdit, sourceRouteId]);

  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    mountedRef.current = true;
    let active = true;
    const openInitialState = async () => {
      setStartError('');
      if (publishJobId && typeof loadJobForReview === 'function') {
        const job = await loadJobForReview(publishJobId);
        if (job?.contentType === 'route' && job?.reviewedDraft?.route && job?.payload?.draftId) {
          const restored = {
            ...job.reviewedDraft.route,
            id: job.payload.draftId,
            version: job.payload.expectedVersion,
            sourceRouteId: job.payload.sourceRouteId || null,
          };
          const normalized = hydrateDraft(restored);
          lastSavedComparableRef.current = routeEditorComparable(normalized);
          return;
        }
      }
      const current = await getCurrentRouteDraft();
      if (!active) return;
      if (current) {
        if (sourceRouteId && current.sourceRouteId === sourceRouteId) {
          let activeSourceComparable = '';
          try {
            const activeSource = await loadRouteDetails(sourceRouteId);
            activeSourceComparable = activeSource ? routeEditorComparable(activeSource) : '';
          } catch (error) {
            console.warn('route_source_compare_failed', { code: error?.code || 'unknown' });
          }
          if (!active) return;
          const currentComparable = routeEditorComparable(current);
          if (activeSourceComparable && currentComparable === activeSourceComparable &&
            Number(current.localMediaCount || 0) === 0) {
            try {
              await discardRouteDraft(current.id);
              await clearDraftMedia({ deleteFiles: true });
              if (active) openSourceLocally();
            } catch (error) {
              console.warn('route_noop_draft_discard_failed', { code: error?.code || 'unknown' });
              if (active) {
                setStartError('לא הצלחנו לנקות טיוטה ישנה שלא מכילה שינויים. אפשר לנסות שוב.');
                setMode('loadError');
              }
            }
          } else {
            const normalized = await hydrateServerDraft(current);
            if (!active) return;
            lastSavedComparableRef.current = routeEditorComparable(normalized);
            setSourceComparable(activeSourceComparable);
          }
        } else if (sourceRouteId) {
          let isLegacyNoOp = false;
          if (current.sourceRouteId) {
            try {
              const activeSource = await loadRouteDetails(current.sourceRouteId);
              isLegacyNoOp = Boolean(activeSource) &&
                Number(current.localMediaCount || 0) === 0 &&
                routeEditorComparable(current) === routeEditorComparable(activeSource);
            } catch (error) {
              console.warn('route_legacy_draft_compare_failed', { code: error?.code || 'unknown' });
            }
          }
          if (!active) return;
          if (isLegacyNoOp) {
            try {
              await discardRouteDraft(current.id);
              await clearDraftMedia({ deleteFiles: true });
              if (active) openSourceLocally();
            } catch (error) {
              console.warn('route_legacy_draft_discard_failed', { code: error?.code || 'unknown' });
              if (active) {
                setExistingDraft(current);
                setMode('switchChoice');
                Alert.alert('לא הצלחנו לנקות את העריכה הישנה', 'המסלול החדש לא נפתח. אפשר לנסות שוב.');
              }
            }
          } else {
            setExistingDraft(current);
            setMode('switchChoice');
          }
        } else {
          setExistingDraft(current);
          setMode('choice');
        }
      } else {
        await clearStaleDraftMedia();
        if (!active) return;
        if (sourceRouteId) openSourceLocally();
        else hydrateDraft({ days: emptyDays(1) });
      }
    };
    openInitialState().catch((error) => {
      console.error('route_draft_load_failed', { code: error?.code || 'unknown' });
      if (active) {
        setStartError('לא הצלחנו לבדוק אם קיים מסלול בתהליך. אפשר לנסות שוב.');
        setMode('loadError');
      }
    });
    return () => { active = false; mountedRef.current = false; };
  }, [clearDraftMedia, clearStaleDraftMedia, hydrateDraft, hydrateServerDraft, loadAttempt, loadJobForReview, openSourceLocally, publishJobId, sourceRouteId]);

  const draftPayload = useMemo(() => ({
    area, dayCount: days.length, title, description, categoryIds, subcategoryIds,
    attributes: { ...preservedAttributes, budgetLevel, seasons },
    difficulty, experienceLevel, transportModes, pace,
    priceBasis: 'whole_route', priceNote, localMediaCount: countPendingRouteMedia(days), days,
  }), [area, budgetLevel, categoryIds, days, description, difficulty, experienceLevel, pace, preservedAttributes, priceNote, seasons, subcategoryIds, title, transportModes]);
  const draftComparable = useMemo(() => routeEditorComparable(draftPayload), [draftPayload]);
  const hasUnpublishedEdit = isEditingRoute && (
    missingLocalMediaCount > 0 || !sourceComparable || draftComparable !== sourceComparable
  );
  latestDraftPayloadRef.current = draftPayload;
  latestDraftComparableRef.current = draftComparable;

  const persistSnapshot = useCallback((snapshot, comparable, {
    force = false,
    allowDuringPublish = false,
  } = {}) => {
    saveQueueRef.current = saveQueueRef.current.catch(() => versionRef.current).then(async () => {
      if (publishHandoffRef.current && !allowDuringPublish) return versionRef.current;
      const canCreateDraft = !draftIdRef.current && Boolean(sourceRouteIdRef.current || (snapshot.area?.countryId && snapshot.area?.cityId));
      if ((!draftIdRef.current && !canCreateDraft) ||
        (!force && comparable === lastSavedComparableRef.current)) return versionRef.current;
      if (mountedRef.current) { setSaveStatus('saving'); setSaveError(''); }
      const pendingRequest = pendingSaveRequestRef.current?.comparable === comparable
        ? pendingSaveRequestRef.current
        : { comparable, saveRequestId: randomUUID() };
      pendingSaveRequestRef.current = pendingRequest;
      try {
        const saved = await saveRouteDraft({
          ...(draftIdRef.current ? { draftId: draftIdRef.current } : {}),
          sourceRouteId: sourceRouteIdRef.current,
          ...(draftIdRef.current ? { expectedVersion: versionRef.current } : {}),
          saveRequestId: pendingRequest.saveRequestId,
          draft: routeDraftForServer(snapshot),
        });
        draftIdRef.current = saved.draftId || draftIdRef.current;
        versionRef.current = saved.version;
        await bindDraftMedia(draftIdRef.current);
        lastSavedComparableRef.current = comparable;
        pendingSaveRequestRef.current = null;
        if (mountedRef.current) {
          setDraftId(draftIdRef.current);
          setSaveStatus('saved');
        }
        return saved.version;
      } catch (error) {
        console.error('route_draft_save_failed', {
          code: String(error?.code || 'unknown'),
          reason: String(error?.details?.reason || 'unknown'),
        });
        if (mountedRef.current) {
          setSaveStatus('error');
          setSaveError(error?.details?.reason === 'ROUTE_DRAFT_VERSION_CONFLICT'
            ? 'הטיוטה השתנתה במקום אחר. כדאי לפתוח אותה מחדש.'
            : 'לא הצלחנו לשמור. השינויים נשארו במסך ואפשר לנסות שוב.');
        }
        throw error;
      }
    });
    return saveQueueRef.current;
  }, [bindDraftMedia]);

  useEffect(() => {
    if (!['editor', 'start'].includes(mode) || (!draftId && !sourceRouteIdRef.current && !area?.cityId) ||
      draftComparable === lastSavedComparableRef.current) return undefined;
    const timer = setTimeout(() => {
      if (!pauseAutosaveRef.current) persistSnapshot(draftPayload, draftComparable).catch(() => {});
    }, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [area?.cityId, draftComparable, draftId, draftPayload, mode, persistSnapshot]);

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
    leavePromptOpenRef.current = false;
    pauseAutosaveRef.current = true;
    const completeDiscard = async () => {
      await clearDraftMedia({ deleteFiles: true });
      draftIdRef.current = '';
      versionRef.current = 0;
      setDraftId('');
      finishLeave(action);
    };
    try {
      await saveQueueRef.current.catch(() => versionRef.current);
      if (draftIdRef.current) await discardRouteDraft(draftIdRef.current);
      await completeDiscard();
    } catch (error) {
      if (error?.details?.reason === 'ROUTE_DRAFT_NOT_FOUND') {
        try {
          await completeDiscard();
          return;
        } catch {
          // Use the standard retry choices when local cleanup also fails.
        }
      }
      pauseAutosaveRef.current = false;
      Alert.alert('לא הצלחנו לוותר על השינויים', 'המסלול לא נסגר כדי שהשינויים לא יישארו בטעות. אפשר לנסות שוב.', [
        { text: 'המשך עריכה', style: 'cancel' },
        { text: 'ניסיון נוסף', onPress: () => discardCurrentDraftAndLeave(action) },
      ]);
    }
  }, [clearDraftMedia, finishLeave]);

  const keepDraftAndLeave = useCallback(async (action = null) => {
    if (!latestDraftPayloadRef.current?.area?.cityId) {
      setDetailsOpen(true);
      setValidationMessage('כדאי לבחור עיר או אזור כדי לשמור את הטיוטה.');
      leavePromptOpenRef.current = false;
      pauseAutosaveRef.current = false;
      return;
    }
    leavePromptOpenRef.current = false;
    pauseAutosaveRef.current = true;
    try {
      await persistSnapshot(
        latestDraftPayloadRef.current,
        latestDraftComparableRef.current
      );
      finishLeave(action);
    } catch (error) {
      if (error?.details?.reason === 'ROUTE_DRAFT_VERSION_CONFLICT' && draftIdRef.current) {
        try {
          const current = await getCurrentRouteDraft();
          const currentVersion = Number(current?.version);
          const sameDraft = current?.id === draftIdRef.current &&
            (current?.sourceRouteId || '') === (sourceRouteIdRef.current || '');
          if (!sameDraft || !Number.isSafeInteger(currentVersion) || currentVersion < 1) throw error;
          versionRef.current = currentVersion;
          pendingSaveRequestRef.current = null;
          await persistSnapshot(
            latestDraftPayloadRef.current,
            latestDraftComparableRef.current,
            { force: true }
          );
          finishLeave(action);
          return;
        } catch {
          // Fall through to the existing recovery choices without losing screen state.
        }
      }
      pauseAutosaveRef.current = false;
      Alert.alert(
        'לא הצלחנו לשמור את הטיוטה',
        'השינויים עדיין מופיעים במסך. אפשר לנסות שוב או לוותר עליהם.',
        [
          { text: 'המשך עריכה', style: 'cancel' },
          { text: 'ויתור על השינויים', style: 'destructive', onPress: () => discardCurrentDraftAndLeave(action) },
          { text: 'ניסיון נוסף', onPress: () => keepDraftAndLeave(action) },
        ]
      );
    }
  }, [discardCurrentDraftAndLeave, finishLeave, persistSnapshot]);

  const requestLeave = useCallback(async (action = null) => {
    if (publishHandoffRef.current) {
      if (leavePromptOpenRef.current) return;
      leavePromptOpenRef.current = true;
      const closeNotice = () => { leavePromptOpenRef.current = false; };
      Alert.alert(
        'המסלול עובר לפרסום',
        'כבר התחלנו לשמור ולפרסם אותו. נחזור לקהילה כשהמסירה תושלם.',
        [{ text: 'הבנתי', onPress: closeNotice }],
        { cancelable: true, onDismiss: closeNotice }
      );
      return;
    }
    if (mode !== 'editor' || (!latestDraftPayloadRef.current?.area && !latestDraftPayloadRef.current?.title && !latestDraftPayloadRef.current?.description && !flattenRouteStops(latestDraftPayloadRef.current?.days).length)) { finishLeave(action); return; }
    if (isEditingRoute && !hasUnpublishedEdit) {
      if (!draftIdRef.current) { finishLeave(action); return; }
      await discardCurrentDraftAndLeave(action);
      return;
    }
    if (leavePromptOpenRef.current) return;
    leavePromptOpenRef.current = true;
    pauseAutosaveRef.current = true;
    Alert.alert(
      isEditingRoute ? 'יש שינויים שלא פורסמו' : 'המסלול עדיין בתהליך',
      'מה תרצו לעשות לפני היציאה?',
      [
        { text: 'המשך עריכה', style: 'cancel', onPress: resumeEditing },
        { text: 'ויתור על השינויים ויציאה', style: 'destructive', onPress: () => discardCurrentDraftAndLeave(action) },
        { text: 'שמירת טיוטה ויציאה', onPress: () => keepDraftAndLeave(action) },
      ],
      { cancelable: true, onDismiss: resumeEditing }
    );
  }, [discardCurrentDraftAndLeave, finishLeave, hasUnpublishedEdit, isEditingRoute, keepDraftAndLeave, mode, resumeEditing]);

  useBackButton(navigation, {
    title: isEditingRoute ? 'עריכת מסלול' : 'מסלול חדש',
    onPress: () => requestLeave(),
  });

  useEffect(() => navigation.addListener?.('beforeRemove', (event) => {
    if (allowLeaveRef.current || mode !== 'editor') return;
    event.preventDefault?.();
    requestLeave(event.data?.action || null);
  }), [mode, navigation, requestLeave]);

  const discardExistingAndContinue = async () => {
    if (!existingDraft?.id || startBusy) return;
    setStartBusy(true);
    try {
      await discardRouteDraft(existingDraft.id);
      await clearDraftMedia({ deleteFiles: true });
      draftIdRef.current = '';
      versionRef.current = 0;
      setDraftId('');
      setExistingDraft(null);
      if (sourceRouteId) openSourceLocally(); else hydrateDraft({ days: emptyDays(1) });
    } catch (error) { Alert.alert('לא הצלחנו למחוק את הטיוטה', 'אפשר לנסות שוב בעוד רגע.'); }
    finally { setStartBusy(false); }
  };
  const selectExistingDraft = async () => {
    if (!existingDraft || startBusy) return;
    setStartBusy(true);
    try {
      const normalized = await hydrateServerDraft(existingDraft);
      lastSavedComparableRef.current = routeEditorComparable(normalized);
      setExistingDraft(null);
    } catch {
      Alert.alert('לא הצלחנו לפתוח את הטיוטה', 'אפשר לנסות שוב בעוד רגע.');
    } finally {
      setStartBusy(false);
    }
  };
  const moveStop = (dayId, from, to) => setDays((current) => current.map((day) => {
    if (day.id !== dayId) return day;
    return { ...day, stops: reorderRouteStops(day.stops, from, to) };
  }));
  const replaceDayStops = (dayId, stops) => setDays((current) => current.map((day) =>
    day.id === dayId ? { ...day, stops } : day));
  const openStopEditor = ({ stopId = null, beforeStopId = null, mode: intentMode }) => {
    const day = days[activeDayIndex];
    if (!day?.id || !['edit', 'insert'].includes(intentMode)) return;
    if (editorBusy || moveBusy || publishBusy) return;
    if (intentMode === 'edit' && stopEditorIntent?.stopId === stopId && stopEditorIntent?.dayId === day.id) {
      setStopEditorIntent(null);
      return;
    }
    if (intentMode === 'edit' && !day.stops?.some((stop) => stop.id === stopId)) {
      Alert.alert('העצירה השתנתה', 'העצירה כבר לא קיימת ביום הזה.');
      return;
    }
    const nextStopId = intentMode === 'insert' ? randomUUID() : stopId;
    if (intentMode === 'insert') {
      if (flattenRouteStops(days).length >= 150) {
        Alert.alert('המסלול מלא', 'אפשר להוסיף עד 150 עצירות למסלול.');
        return;
      }
      const stops = [...(day.stops || [])];
      const before = beforeStopId ? stops.findIndex((stop) => stop.id === beforeStopId) : stops.length;
      stops.splice(before >= 0 ? before : stops.length, 0, {
        id: nextStopId, title: '', description: '', media: null, additionalMedia: [], pendingMedia: [],
        editorState: { locationMode: 'exact', locationIncomplete: true, query: '', startTime: '', durationMinutes: '' },
      });
      replaceDayStops(day.id, stops);
    }
    setValidationTarget(null);
    setTransferStopId(null);
    setStopEditorIntent({
      dayId: day.id,
      stopId: nextStopId,
      mode: 'edit',
    });
  };
  const closeStopEditor = () => setStopEditorIntent(null);
  const saveStop = (stopData) => {
    const intent = stopEditorIntent;
    if (!intent?.dayId || !intent?.stopId) return;
    const nextStop = { ...stopData, id: intent.stopId };
    const nextDays = days.map((day) => {
      if (day.id !== intent.dayId) return day;
      const stops = [...(day.stops || [])];
      if (intent.mode === 'insert') {
        if (stops.some((stop) => stop.id === intent.stopId)) return day;
        const beforeIndex = intent.beforeStopId
          ? stops.findIndex((stop) => stop.id === intent.beforeStopId)
          : stops.length;
        stops.splice(beforeIndex >= 0 ? beforeIndex : stops.length, 0, nextStop);
      } else {
        const stopIndex = stops.findIndex((stop) => stop.id === intent.stopId);
        if (stopIndex < 0) return day;
        stops[stopIndex] = nextStop;
      }
      return { ...day, stops };
    });
    if (countRouteMedia(nextDays) > MAX_ROUTE_MEDIA) {
      Alert.alert('יותר מדי תמונות במסלול', `אפשר להוסיף עד ${MAX_ROUTE_MEDIA} תמונות בכל המסלול.`);
      return false;
    }
    setDays(nextDays);
    return true;
  };
  const removeStop = (dayId, stopId) => {
    const stop = days.find((day) => day.id === dayId)?.stops?.find((item) => item.id === stopId);
    if (!stop) return;
    Alert.alert('הסרת עצירה', `להסיר את "${stop.title || 'העצירה'}" מהיום?`, [
      { text: 'ביטול', style: 'cancel' },
      { text: 'הסרה', style: 'destructive', onPress: () => {
        if (stopEditorIntent?.dayId === dayId && stopEditorIntent?.stopId === stopId) closeStopEditor();
        (stop.pendingMedia || []).forEach((item) => Promise.resolve(forgetDurableImage(item, {
          dayId,
          stopId,
        })).catch(() => {}));
        setDays((current) => current.map((day) => day.id === dayId
          ? { ...day, stops: (day.stops || []).filter((item) => item.id !== stopId) }
          : day));
      } },
    ]);
  };
  const updateActiveDayDescription = (value) => setDays((current) => current.map((day, dayIndex) =>
    dayIndex === activeDayIndex ? { ...day, description: value } : day));
  const selectDay = (index) => {
    if (editorBusy || moveBusy) return;
    setActiveDayIndex(index); setStopEditorIntent(null); setTransferStopId(null); setDayDetailsOpen(false);
  };
  const addDay = () => {
    if (days.length >= 60 || editorBusy || moveBusy) return;
    setDays((current) => [...current, { id: randomUUID(), title: '', description: '', stops: [], media: null }]);
    selectDay(days.length);
  };
  const moveDay = (from, to) => {
    const activeId = days[activeDayIndex]?.id;
    const next = reorderRouteStops(days, from, to);
    setDays(next); setActiveDayIndex(next.findIndex((day) => day.id === activeId));
  };
  const removeDay = (dayId) => {
    if (days.length <= 1 || editorBusy || moveBusy) return;
    const day = days.find((item) => item.id === dayId);
    const remove = () => {
      day.stops.forEach((stop) => (stop.pendingMedia || []).forEach((item) =>
        Promise.resolve(forgetDurableImage(item, { dayId, stopId: stop.id })).catch(() => {})));
      const activeId = days[activeDayIndex]?.id;
      const next = days.filter((item) => item.id !== dayId);
      setDays(next);
      setActiveDayIndex(Math.max(0, next.findIndex((item) => item.id === activeId)));
      if (stopEditorIntent?.dayId === dayId) closeStopEditor();
    };
    if (day.stops.length || day.description || day.title || day.media) {
      Alert.alert('מחיקת יום', 'היום וכל העצירות שבו יוסרו מהטיוטה.', [
        { text: 'ביטול', style: 'cancel' }, { text: 'מחיקת היום', style: 'destructive', onPress: remove },
      ]);
    } else remove();
  };
  const transferStop = async (stopId, toDayId) => {
    if (moveBusy || editorBusy) return;
    const fromDay = days[activeDayIndex];
    const stop = fromDay.stops.find((item) => item.id === stopId);
    const targetIndex = days.findIndex((day) => day.id === toDayId);
    if (!stop || targetIndex < 0 || fromDay.id === toDayId) return;
    const toStopId = days[targetIndex].stops.some((item) => item.id === stopId) ? randomUUID() : stopId;
    setMoveBusy(true);
    try {
      await moveStopMedia({ fromDayId: fromDay.id, toDayId, stopId, toStopId });
      setDays((current) => current.map((day) => day.id === fromDay.id
        ? { ...day, stops: day.stops.filter((item) => item.id !== stopId) }
        : day.id === toDayId ? { ...day, stops: [...day.stops, { ...stop, id: toStopId,
          savedLocationDayId: stop.savedLocationDayId || fromDay.id, savedLocationStopId: stop.savedLocationStopId || stopId }] } : day));
      setActiveDayIndex(targetIndex);
      setStopEditorIntent({ dayId: toDayId, stopId: toStopId, mode: 'edit' });
      setTransferStopId(null);
    } catch { Alert.alert('לא הצלחנו להעביר את העצירה', 'העצירה והתמונות נשארו ביום המקורי. אפשר לנסות שוב.'); }
    finally { setMoveBusy(false); }
  };
  const handlePublish = async () => {
    if (publishHandoffRef.current || publishBusy || editorBusy || moveBusy) return;
    const issue = validateRouteComposer(draftPayload);
    setValidationMessage(issue?.message || '');
    setValidationTarget(issue);
    if (issue) {
      if (issue.dayIndex == null) {
        setDetailsOpen(true);
        setTimeout(() => {
          builderScrollRef.current?.scrollTo?.({ y: Math.max(0, (sectionYRef.current.details || 0) + (sectionYRef.current[issue.field] || 0) - 16), animated: true });
          ({ title: titleInputRef, description: descriptionInputRef, area: areaInputRef })[issue.field]?.current?.focus?.();
        }, 100);
      } else {
        setActiveDayIndex(issue.dayIndex);
        setStopEditorIntent(issue.stopId ? { dayId: days[issue.dayIndex].id, stopId: issue.stopId, mode: 'edit' } : null);
        setTimeout(() => builderScrollRef.current?.scrollTo?.({
          y: Math.max(0, (sectionYRef.current.day || 0) + (issue.stopId ? (sectionYRef.current.stops || 0) + (sectionYRef.current[issue.stopId] || 0) : 0) - 70), animated: true,
        }), 100);
      }
      return;
    }
    setPublishBusy(true);
    publishHandoffRef.current = true;
    pauseAutosaveRef.current = true;
    let handedOff = false;
    try {
      const publishDraft = isEditingRoute ? {
        ...draftPayload,
        days: markUnchangedRouteLocations(draftPayload.days, routeAsDraft(routeToEdit).days),
      } : draftPayload;
      const version = await persistSnapshot(publishDraft, draftComparable, {
        force: isEditingRoute,
        allowDuringPublish: true,
      });
      if (typeof enqueueCreate !== 'function') throw new Error('Route publishing is unavailable.');
      const extracted = extractRoutePublishMedia(publishDraft.days);
      const durableMedia = await waitForDurableMedia(extracted.media);
      const queuedRoute = {
        ...publishDraft,
        routeSchemaVersion: 2,
        taxonomyVersion: TRAVEL_TAXONOMY_VERSION,
        days: extracted.days,
      };
      await enqueueCreate({
        contentType: 'route',
        draftJobId: publishJobId ? null : draftJobId,
        sourceJobId: publishJobId,
        payload: {
          route: queuedRoute,
          draftId: draftIdRef.current,
          expectedVersion: version,
          ...(sourceRouteIdRef.current ? { sourceRouteId: sourceRouteIdRef.current } : {}),
        },
        media: durableMedia,
        draft: { route: publishDraft },
      });
      handedOff = true;
      try {
        await clearDraftMedia({
          deleteFiles: false,
          keepItems: durableMedia,
        });
      } catch (error) {
        console.warn('route_publish_handoff_cleanup_failed', {
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
      Alert.alert(
        isEditingRoute ? 'לא הצלחנו לשמור את השינויים' : 'לא הצלחנו לפרסם את המסלול',
        error?.details?.reason === 'ROUTE_NEW_PLACE_LIMIT'
          ? 'אפשר לפרסם עד חמישה מקומות חדשים בכל עדכון. שמרו חלק מהעצירות ונסו שוב.'
          : saveError || 'השינויים נשארו במסך. אפשר לנסות שוב בעוד רגע.'
      );
    } finally { setPublishBusy(false); }
  };

  const selectedDayIndex = stopEditorIntent?.dayId
    ? days.findIndex((day) => day.id === stopEditorIntent.dayId)
    : -1;
  const selectedDay = selectedDayIndex >= 0 ? days[selectedDayIndex] : null;
  const selectedStopIndex = selectedDay && stopEditorIntent?.stopId
    ? selectedDay.stops?.findIndex((stop) => stop.id === stopEditorIntent.stopId) ?? -1
    : -1;
  const selectedStop = stopEditorIntent?.mode === 'edit' && selectedStopIndex >= 0
    ? selectedDay.stops[selectedStopIndex]
    : null;
  useEffect(() => {
    if (!stopEditorIntent || (selectedDay && (stopEditorIntent.mode !== 'edit' || selectedStop))) return;
    setStopEditorIntent(null);
    Alert.alert('העצירה השתנתה', 'העצירה שנבחרה כבר אינה זמינה. אפשר לבחור עצירה אחרת.');
  }, [selectedDay, selectedStop, stopEditorIntent]);

  if (mode === 'loading') return <View style={styles.loading}><ActivityIndicator color={colors.primary} /><AppText style={styles.loadingText}>פותחים את בונה המסלול...</AppText></View>;
  if (mode === 'loadError') return (
    <View style={styles.loading}>
      <Ionicons name="alert-circle-outline" size={34} color={colors.error} />
      <AppText style={styles.loadingText}>{startError}</AppText>
      <TouchableOpacity style={styles.secondaryButton} onPress={() => { setMode('loading'); setLoadAttempt((value) => value + 1); }} testID="route-draft-load-retry"><AppText style={styles.secondaryButtonText}>ניסיון נוסף</AppText></TouchableOpacity>
    </View>
  );
  if (mode === 'switchChoice') return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <AppText style={styles.startTitle}>{existingDraft?.title || 'שינויים שלא פורסמו'}</AppText>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => finishLeave()} testID="route-switch-cancel"><AppText style={styles.secondaryButtonText}>ביטול וחזרה</AppText></TouchableOpacity>
        <TouchableOpacity style={styles.primaryButton} onPress={discardExistingAndContinue} disabled={startBusy} testID="route-switch-discard">{startBusy ? <ActivityIndicator color={colors.white} /> : <AppText style={styles.primaryButtonText}>ויתור על השינויים ופתיחת המסלול</AppText>}</TouchableOpacity>
      </View>
    </ScrollView>
  );
  if (mode === 'choice') return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <AppText style={styles.startTitle}>{existingDraft?.title || 'מסלול בתהליך'}</AppText>
        <AppText style={styles.body}>{existingDraft?.dayCount || existingDraft?.days?.length || 1} ימים{existingDraft?.area?.cityName ? ` · ${existingDraft.area.cityName}` : ''}</AppText>
        <TouchableOpacity style={styles.primaryButton} onPress={selectExistingDraft} disabled={startBusy} testID="route-draft-continue">{startBusy ? <ActivityIndicator color={colors.white} /> : <AppText style={styles.primaryButtonText}>המשך המסלול</AppText>}</TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={discardExistingAndContinue} disabled={startBusy} testID="route-draft-discard">
          {startBusy ? <ActivityIndicator color={colors.primary} /> : <AppText style={styles.destructiveText}>{existingDraft?.sourceRouteId ? 'ויתור על העריכות' : 'מחיקה והתחלה מחדש'}</AppText>}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
  const activeDay = days[activeDayIndex] || days[0];
  const allStops = flattenRouteStops(days);
  const locked = editorBusy || moveBusy || publishBusy;
  const unsaved = draftComparable !== lastSavedComparableRef.current;
  const usefulSummary = [
    ...TRANSPORT_MODES.filter((item) => transportModes.includes(item.value)),
    ...ROUTE_DIFFICULTIES.filter((item) => item.value === difficulty),
    ...PACES.filter((item) => item.value === pace),
    ...SEASONS.filter((item) => seasons.includes(item.value)),
  ].map((item) => item.label).join(' · ');
  return (
    <GestureHandlerRootView style={styles.screen}>
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={insets.top + 56}>
      <NestableScrollContainer pointerEvents={moveBusy || publishBusy ? 'none' : 'auto'} ref={builderScrollRef} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" stickyHeaderIndices={[1]}>
        <View style={styles.headerContent}>
          <View style={styles.statusRow} accessibilityLiveRegion="polite">
            {saveStatus === 'saving' ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name={saveStatus === 'error' ? 'alert-circle-outline' : 'cloud-done-outline'} size={17} color={saveStatus === 'error' ? colors.error : colors.textMuted} />}
            <AppText style={[styles.statusText, saveStatus === 'error' && styles.statusError]}>{saveStatus === 'saving' ? 'שומר טיוטה...' : saveStatus === 'error' ? 'לא הצלחנו לשמור את הטיוטה' : !area ? 'הטיוטה תישמר לאחר בחירת עיר או אזור' : unsaved ? 'השינויים ממתינים לשמירה' : draftId ? 'הטיוטה נשמרה' : isEditingRoute ? 'אין שינויים שלא פורסמו' : ''}</AppText>
            {saveStatus === 'error' ? <TouchableOpacity style={styles.stopAction} onPress={() => persistSnapshot(draftPayload, draftComparable).catch(() => {})} testID="route-save-retry"><AppText style={styles.retryText}>ניסיון נוסף</AppText></TouchableOpacity> : null}
          </View>
          {saveError ? <AppText style={styles.errorText} testID="route-save-error">{saveError}</AppText> : null}
          {missingLocalMediaCount ? <View style={styles.errorBox} testID="route-missing-local-media"><AppText style={styles.errorText}>לא הצלחנו לשחזר {missingLocalMediaCount} תמונות מהטיוטה. אפשר לבחור אותן מחדש לפני הפרסום.</AppText></View> : null}
          <View onLayout={(event) => { sectionYRef.current.details = event.nativeEvent.layout.y + 16; }}><NoyaTourTarget targetId={NOYA_CREATOR_TARGETS.routeBase}>
          <View style={styles.card}>
            <TouchableOpacity style={styles.detailsToggle} onPress={() => setDetailsOpen((current) => !current)} accessibilityRole="button" accessibilityState={{ expanded: detailsOpen }} testID="route-details-toggle">
              <View style={styles.flexCopy}><AppText style={styles.sectionTitle}>{detailsOpen ? 'פרטי המסלול' : title || 'מסלול חדש'}</AppText>{!detailsOpen ? <AppText style={styles.body}>{[area?.name || area?.cityName, `${days.length} ימים · ${allStops.length} עצירות`].filter(Boolean).join(' · ')}</AppText> : null}</View>
              <Ionicons name={detailsOpen ? 'chevron-up' : 'chevron-down'} size={20} color={colors.primary} />
            </TouchableOpacity>
            {detailsOpen ? <>
              <View onLayout={(event) => { sectionYRef.current.title = event.nativeEvent.layout.y; }}><FocusClearingFormInput inputRef={titleInputRef} label="שם המסלול" required value={title} onChangeText={setTitle} placeholder="למשל: שלושה ימים סביב אגם גארדה" maxLength={120} rtl testID="route-title-input" /></View>
              <View onLayout={(event) => { sectionYRef.current.area = event.nativeEvent.layout.y; }}><AppText style={styles.fieldLabel}>עיר או אזור</AppText>
              <SingleDestinationPicker inputRef={areaInputRef} allowProviderDestinations value={area} onChange={setArea} /></View>
              <View onLayout={(event) => { sectionYRef.current.description = event.nativeEvent.layout.y; }}><FocusClearingFormInput inputRef={descriptionInputRef} label="תיאור" required value={description} onChangeText={setDescription} placeholder="מה מחכה בדרך ולמי המסלול מתאים?" multiline maxLength={5000} rtl testID="route-description-input" /></View>
              <View onLayout={(event) => { sectionYRef.current.budget = event.nativeEvent.layout.y; }}><RtlChoiceGroup label={CONTENT_COMPOSER_COPY.budgetLabel} helper={CONTENT_COMPOSER_COPY.budgetHelper} options={POST_BUDGETS} selectedIds={[budgetLevel]} selectionMode="single" variant="segment" onToggle={(value) => { setBudgetLevel(value); setValidationMessage(''); }} testIDPrefix="route-budget" /></View>
              <TouchableOpacity style={styles.detailsToggle} onPress={() => setOptionalOpen((current) => !current)} accessibilityRole="button" accessibilityState={{ expanded: optionalOpen }} testID="route-optional-toggle"><View style={styles.flexCopy}><AppText style={styles.detailsToggleText}>{CONTENT_COMPOSER_COPY.optionalDetails}</AppText><AppText style={styles.sectionMeta}>{usefulSummary || 'התניידות, רמת קושי, קצב, עונה ומחיר מדויק'}</AppText></View><Ionicons name={optionalOpen ? 'remove' : 'add'} size={20} color={colors.primary} /></TouchableOpacity>
              {optionalOpen ? <View style={styles.optionalBox}>
                <RtlChoiceGroup label="אמצעי התניידות" options={TRANSPORT_MODES} selectedIds={transportModes} onToggle={(value) => setTransportModes((current) => current.includes(value) ? current.filter((id) => id !== value) : [...current, value].slice(0, 4))} maxSelected={4} testIDPrefix="route-transport" />
                <RtlChoiceGroup label="רמת קושי" options={ROUTE_DIFFICULTIES} selectedIds={[difficulty]} selectionMode="single" onToggle={(value) => setDifficulty((current) => current === value ? '' : value)} testIDPrefix="route-difficulty" />
                <RtlChoiceGroup label="קצב" options={PACES} selectedIds={[pace]} selectionMode="single" onToggle={(value) => setPace((current) => current === value ? '' : value)} testIDPrefix="route-pace" />
                <RtlChoiceGroup label="עונה מתאימה" options={SEASONS} selectedIds={seasons} onToggle={(value) => setSeasons((current) => current.includes(value) ? current.filter((id) => id !== value) : [...current, value])} testIDPrefix="route-season" />
                <FocusClearingFormInput label="מחיר" value={priceNote} onChangeText={setPriceNote} placeholder="למשל: כ־600 ש״ח לאדם לכל המסלול, ללא טיסות" maxLength={120} rtl testID="route-price-note" />
              </View> : null}
              {validationMessage && validationTarget?.dayIndex == null ? <AppText style={styles.errorText} accessibilityLiveRegion="assertive">{validationMessage}</AppText> : null}
            </> : null}
          </View>
          </NoyaTourTarget></View>
        </View>
        <View style={styles.dayRail}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs} contentContainerStyle={styles.tabsContent} keyboardShouldPersistTaps="handled">
            {days.map((day, index) => <TouchableOpacity key={day.id} style={[styles.tab, activeDayIndex === index && styles.tabSelected]} onPress={() => selectDay(index)} disabled={locked} accessibilityRole="tab" accessibilityState={{ selected: activeDayIndex === index, disabled: locked }} accessibilityLabel={`יום ${index + 1}${day.title ? `, ${day.title}` : ''}`} testID={`route-day-tab-${index}`}><AppText style={[styles.tabText, activeDayIndex === index && styles.tabTextSelected]}>יום {index + 1}</AppText></TouchableOpacity>)}
            <TouchableOpacity style={styles.tab} onPress={addDay} disabled={locked || days.length >= 60} accessibilityRole="button" accessibilityLabel="הוספת יום" testID="route-add-day"><Ionicons name="add" size={22} color={colors.primary} /></TouchableOpacity>
          </ScrollView>
          <View style={styles.sectionHeader}>
            <TouchableOpacity style={styles.textButton} onPress={() => setDayManagerOpen((current) => !current)} accessibilityRole="button" accessibilityState={{ expanded: dayManagerOpen }} testID="route-manage-days"><Ionicons name="swap-vertical-outline" size={17} color={colors.primary} /><AppText style={styles.retryText}>ניהול ימים</AppText></TouchableOpacity>
            <TouchableOpacity style={styles.textButton} onPress={() => navigation.navigate('RouteMap', { routeData: { title, days } })} accessibilityRole="button" testID="route-map-peek"><Ionicons name="map-outline" size={17} color={colors.primary} /><AppText style={styles.retryText}>מפת המסלול</AppText></TouchableOpacity>
          </View>
          {dayManagerOpen ? <ScrollView style={styles.dayManager} nestedScrollEnabled keyboardShouldPersistTaps="handled">{days.map((day, index) => <View key={day.id} style={styles.managerRow}>
            <AppText style={styles.flexCopy}>יום {index + 1}{day.title ? ` · ${day.title}` : ''}</AppText>
            <TouchableOpacity style={styles.stopAction} disabled={locked || index === 0} onPress={() => moveDay(index, index - 1)} accessibilityLabel={`העברת יום ${index + 1} מוקדם יותר`} testID={`route-day-up-${day.id}`}><Ionicons name="arrow-up" size={20} color={index ? colors.primary : colors.textMuted} /></TouchableOpacity>
            <TouchableOpacity style={styles.stopAction} disabled={locked || index === days.length - 1} onPress={() => moveDay(index, index + 1)} accessibilityLabel={`העברת יום ${index + 1} מאוחר יותר`} testID={`route-day-down-${day.id}`}><Ionicons name="arrow-down" size={20} color={colors.primary} /></TouchableOpacity>
            <TouchableOpacity style={styles.stopAction} disabled={locked || days.length === 1} onPress={() => removeDay(day.id)} accessibilityLabel={`מחיקת יום ${index + 1}`} testID={`route-day-remove-${day.id}`}><Ionicons name="trash-outline" size={20} color={days.length === 1 ? colors.textMuted : colors.error} /></TouchableOpacity>
          </View>)}</ScrollView> : null}
        </View>
        <View style={styles.dayContent} onLayout={(event) => { sectionYRef.current.day = event.nativeEvent.layout.y; }}>
          <View style={styles.sectionHeader}>
            <View style={styles.flexCopy}><AppText style={styles.sectionTitle}>יום {activeDayIndex + 1}{activeDay?.title ? ` · ${activeDay.title}` : ''}</AppText><AppText style={styles.sectionMeta}>{activeDay?.stops?.length || 0} עצירות</AppText></View>
            <TouchableOpacity style={styles.stopAction} onPress={() => setDayDetailsOpen((current) => !current)} accessibilityLabel="עריכת שם היום והערה" accessibilityRole="button" accessibilityState={{ expanded: dayDetailsOpen }} testID="route-day-details-toggle"><Ionicons name="create-outline" size={22} color={colors.primary} /></TouchableOpacity>
          </View>
          {dayDetailsOpen ? <View style={styles.card}>
            <FocusClearingFormInput label="שם היום (רשות)" value={activeDay?.title || ''} onChangeText={(value) => setDays((current) => current.map((day) => day.id === activeDay.id ? { ...day, title: value } : day))} placeholder="למשל: כפרים ואגמים" maxLength={120} rtl testID="route-day-title-input" />
            <FocusClearingFormInput label="הערה ליום (רשות)" value={activeDay?.description || ''} onChangeText={updateActiveDayDescription} multiline maxLength={5000} rtl testID="route-day-description-input" />
          </View> : activeDay?.description ? <AppText style={styles.body}>{activeDay.description}</AppText> : null}
          {activeDay?.stops?.some((stop) => getStopMediaUrls(stop).length) ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsContent} testID="route-day-photos">{activeDay.stops.flatMap((stop, stopIndex) => getStopMediaUrls(stop, 'thumb').map((uri, photoIndex) => <TouchableOpacity key={`${stop.id}:${photoIndex}`} style={styles.dayPhotoButton} onPress={() => { setStopEditorIntent({ dayId: activeDay.id, stopId: stop.id, mode: 'edit' }); builderScrollRef.current?.scrollTo?.({ y: Math.max(0, (sectionYRef.current.day || 0) + (sectionYRef.current.stops || 0) + (sectionYRef.current[stop.id] || 0) - 70), animated: true }); }} disabled={locked} accessibilityLabel={`תמונה ${photoIndex + 1}, עצירה ${stopIndex + 1}: ${stop.title || 'עצירה חדשה'}`}><CachedImage source={{ uri }} style={styles.dayPhoto} contentFit="cover" /><AppText style={styles.photoCaption}>{stopIndex + 1}</AppText></TouchableOpacity>))}</ScrollView> : null}
          {!activeDay?.stops?.length ? <View style={styles.emptyDay}><Ionicons name="trail-sign-outline" size={32} color={colors.brandOrange} /><AppText style={styles.sectionTitle}>כאן מתחיל היום שלכם</AppText><AppText style={styles.empty}>מקום שאהבתם, תצפית או קפה בדרך — מוסיפים עצירה וממשיכים משם.</AppText></View> : <NestableDraggableFlatList
            key={activeDay.id}
            onLayout={(event) => { sectionYRef.current.stops = event.nativeEvent.layout.y; }}
            data={activeDay.stops}
            keyExtractor={(stop) => stop.id}
            activationDistance={8}
            onDragEnd={({ data }) => replaceDayStops(activeDay.id, data)}
            testID="route-stop-draggable-list"
            renderItem={({ item: stop, getIndex, drag, isActive }) => {
              const reportedIndex = getIndex?.();
              const index = Number.isInteger(reportedIndex) ? reportedIndex : activeDay.stops.findIndex((item) => item.id === stop.id);
              const open = stopEditorIntent?.dayId === activeDay.id && stopEditorIntent?.stopId === stop.id;
              return <View onLayout={(event) => { sectionYRef.current[stop.id] = event.nativeEvent.layout.y; }}>
                <TouchableOpacity style={styles.insertStop} onPress={() => openStopEditor({ beforeStopId: stop.id, mode: 'insert' })} disabled={locked} accessibilityRole="button" testID={`route-insert-stop-before-${stop.id}`}><Ionicons name="add" size={16} color={colors.brandOrange} /><AppText style={styles.insertStopText}>הוספת עצירה כאן</AppText></TouchableOpacity>
                <ScaleDecorator activeScale={1.02}>
                  <View style={[styles.stopShell, open && styles.stopShellOpen, isActive && styles.stopCardDragging]}>
                    <View style={styles.stopHeading}>
                      <TouchableOpacity style={styles.stopMain} onPress={() => openStopEditor({ stopId: stop.id, mode: 'edit' })} accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`עריכת העצירה ${stop.title || index + 1}`} disabled={locked || isActive} testID={`route-stop-edit-${stop.id}`}>
                        {getStopMediaUrls(stop, 'thumb')[0] ? <CachedImage source={{ uri: getStopMediaUrls(stop, 'thumb')[0] }} style={styles.stopThumb} contentFit="cover" /> : <View style={styles.stopNumber}><AppText style={styles.stopNumberText}>{index + 1}</AppText></View>}
                        <View style={styles.stopCopy}><AppText style={styles.stopTitle}>{stop.title || 'עצירה חדשה'}</AppText><AppText style={styles.stopMeta}>{stop.editorState?.locationIncomplete ? 'בחירת מקום והוספת פרטים' : stop.location || stop.place?.name || 'מיקום כללי'}</AppText></View>
                        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.primary} />
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.dragHandle} onLongPress={drag} delayLongPress={180} disabled={locked} accessibilityLabel={`שינוי מיקום העצירה ${index + 1}`} accessibilityHint="לחיצה ארוכה וגרירה משנה את הסדר" accessibilityActions={[...(index > 0 ? [{ name: 'moveUp', label: 'העברה למעלה' }] : []), ...(index < activeDay.stops.length - 1 ? [{ name: 'moveDown', label: 'העברה למטה' }] : [])]} onAccessibilityAction={({ nativeEvent }) => { if (nativeEvent.actionName === 'moveUp') moveStop(activeDay.id, index, index - 1); if (nativeEvent.actionName === 'moveDown') moveStop(activeDay.id, index, index + 1); }} testID={`route-stop-drag-handle-${stop.id}`}><Ionicons name="reorder-three-outline" size={27} color={colors.primary} /></TouchableOpacity>
                    </View>
                    {open ? <View style={styles.inlineStop}>
                      <StopEditorModal key={`${activeDay.id}:${stop.id}`} embedded visible initialData={stop} dayIndex={activeDayIndex} stopIndex={index} onClose={closeStopEditor} onSave={saveStop} onDraftChange={saveStop} onBusyChange={setEditorBusy}
                        validationField={validationTarget?.field || ''} validationError={validationTarget?.stopId === stop.id ? validationMessage : ''}
                        onForgetImage={(item) => forgetDurableImage(item, { dayId: activeDay.id, stopId: stop.id })}
                        onPersistImages={(items) => persistDurableMedia(items, { dayId: activeDay.id, stopId: stop.id })}
                        mediaForImage={(item) => durableMediaForItem(item, { dayId: activeDay.id, stopId: stop.id })}
                        maxPhotos={Math.min(3, MAX_ROUTE_MEDIA - countRouteMedia(days) + countRouteMedia([{ stops: [stop] }]))}
                        routeDestination={area} guideEnabled={!isEditingRoute && !publishJobId} />
                      <View style={styles.stopTools}>
                        <TouchableOpacity style={styles.textButton} disabled={locked || index === 0} onPress={() => moveStop(activeDay.id, index, index - 1)} accessibilityLabel="העברת העצירה למעלה" testID={`route-stop-up-${stop.id}`}><Ionicons name="arrow-up" size={18} color={colors.primary} /></TouchableOpacity>
                        <TouchableOpacity style={styles.textButton} disabled={locked || index === activeDay.stops.length - 1} onPress={() => moveStop(activeDay.id, index, index + 1)} accessibilityLabel="העברת העצירה למטה" testID={`route-stop-down-${stop.id}`}><Ionicons name="arrow-down" size={18} color={colors.primary} /></TouchableOpacity>
                        {days.length > 1 ? <TouchableOpacity style={styles.textButton} disabled={locked} onPress={() => setTransferStopId((current) => current === stop.id ? null : stop.id)} testID={`route-stop-transfer-${stop.id}`}><AppText style={styles.retryText}>העברה ליום אחר</AppText></TouchableOpacity> : null}
                        <TouchableOpacity style={styles.stopAction} disabled={locked} onPress={() => removeStop(activeDay.id, stop.id)} accessibilityLabel={`הסרת העצירה ${stop.title || index + 1}`} testID={`route-stop-remove-${stop.id}`}><Ionicons name="trash-outline" size={20} color={colors.error} /></TouchableOpacity>
                      </View>
                      {transferStopId === stop.id ? <View style={styles.dayChoices}>{days.map((day, dayIndex) => day.id !== activeDay.id ? <TouchableOpacity key={day.id} style={styles.dayChoice} disabled={locked} onPress={() => transferStop(stop.id, day.id)} testID={`route-transfer-to-${day.id}`}><AppText>יום {dayIndex + 1}{day.title ? ` · ${day.title}` : ''}</AppText></TouchableOpacity> : null)}</View> : null}
                    </View> : null}
                  </View>
                </ScaleDecorator>
              </View>;
            }}
          />}
          <TouchableOpacity style={styles.addStop} onPress={() => openStopEditor({ mode: 'insert' })} disabled={locked || allStops.length >= 150} testID="route-add-stop"><Ionicons name="add-circle-outline" size={23} color={colors.brandOrange} /><AppText style={styles.addStopText}>{activeDay?.stops?.length ? 'הוספת עצירה בסוף היום' : 'הוספת העצירה הראשונה'}</AppText></TouchableOpacity>
        </View>
      </NestableScrollContainer>
      <NoyaTourTarget targetId={NOYA_CREATOR_TARGETS.routePublish}>
      <View style={[styles.footer, routeFooterInsetsStyle(insets.bottom)]} testID="route-footer">
        {validationMessage ? <AppText style={styles.errorText} accessibilityLiveRegion="assertive">{validationMessage}</AppText> : <AppText style={styles.footerMeta}>{days.length} ימים · {allStops.length} עצירות · התמונות הן לבחירתכם</AppText>}
        <TouchableOpacity style={[styles.primaryButton, (locked || (isEditingRoute && !hasUnpublishedEdit && !publishJobId)) && styles.primaryButtonDisabled]} onPress={handlePublish} disabled={locked || (isEditingRoute && !hasUnpublishedEdit && !publishJobId)} testID="route-submit">{publishBusy ? <ActivityIndicator color={colors.white} /> : <AppText style={styles.primaryButtonText}>{isEditingRoute ? 'פרסום השינויים' : 'פרסום המסלול'}</AppText>}</TouchableOpacity>
      </View>
      </NoyaTourTarget>
      </KeyboardAvoidingView>
    </GestureHandlerRootView>
  );
}
