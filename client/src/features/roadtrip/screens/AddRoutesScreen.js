import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, TouchableOpacity, View } from 'react-native';
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
import NoyaGuide from '../../community/components/NoyaGuide';
import SingleDestinationPicker from '../../community/components/SingleDestinationPicker';
import { useContentPublish } from '../../publishing/ContentPublishContext';
import StopEditorModal from '../components/StopEditorModal';
import { extractRoutePublishMedia } from '../utils/routeMedia';
import {
  flattenRouteStops, getStopCoordinates, getStopMediaUrls, markUnchangedRouteLocations,
} from '../utils/routeStops';

const SAVE_DELAY_MS = 900;
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
  id: `day_${String(index + 1).padStart(3, '0')}`, description: '', media: null, stops: [],
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
  (entries || []).forEach((entry) => {
    if (!entry?.dayId || !entry?.stopId || !entry?.uri) return;
    const key = `${entry.dayId}/${entry.stopId}`;
    if (!byStopId.has(key)) byStopId.set(key, []);
    byStopId.get(key).push({
      uri: entry.uri,
      ...(entry.mediaId ? { mediaId: entry.mediaId } : {}),
      ...(entry.localReference ? { localReference: entry.localReference } : {}),
    });
  });
  return {
    ...(draft || {}),
    days: (draft?.days || []).map((day) => ({
      ...day,
      stops: (day.stops || []).map((stop) => {
        const pendingMedia = byStopId.get(`${day.id}/${stop.id}`) || [];
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
  const routeToEdit = route?.params?.routeToEdit || null;
  const sourceRouteId = routeToEdit?.id || routeToEdit?.routeId || null;
  const publishJobId = route?.params?.publishJobId || null;
  const { enqueueCreate, loadJobForReview } = useContentPublish();
  const {
    draftJobId,
    forgetUri: forgetDurableImage,
    mediaForUri: durableMediaForUri,
    persistUris: persistDurableImages,
    bindDraft: bindDraftMedia,
    clearDraft: clearDraftMedia,
    clearStaleDraft: clearStaleDraftMedia,
    restoreDraft: restoreDraftMedia,
  } = useRouteDraftMedia();
  const [mode, setMode] = useState('loading');
  const [existingDraft, setExistingDraft] = useState(null);
  const [startArea, setStartArea] = useState(null);
  const [startDayCount, setStartDayCount] = useState(1);
  const [customDaysOpen, setCustomDaysOpen] = useState(false);
  const [startBusy, setStartBusy] = useState(false);
  const [startError, setStartError] = useState('');
  const [draftId, setDraftId] = useState('');
  const [area, setArea] = useState(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [days, setDays] = useState([]);
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
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [optionalOpen, setOptionalOpen] = useState(false);
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
  const isEditingRoute = Boolean(sourceRouteId || sourceRouteIdRef.current);

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
    setMissingLocalMediaCount(restored.missingCount || 0);
    return hydrateDraft(merged);
  }, [hydrateDraft, restoreDraftMedia]);

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
        else setMode('start');
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
      const canCreateEditDraft = !draftIdRef.current && Boolean(sourceRouteIdRef.current);
      if ((!draftIdRef.current && !canCreateEditDraft) ||
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
        lastSavedComparableRef.current = comparable;
        pendingSaveRequestRef.current = null;
        await bindDraftMedia(draftIdRef.current);
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
    if (mode !== 'editor' || (!draftId && !sourceRouteIdRef.current) ||
      draftComparable === lastSavedComparableRef.current) return undefined;
    const timer = setTimeout(() => {
      if (!pauseAutosaveRef.current) persistSnapshot(draftPayload, draftComparable).catch(() => {});
    }, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [draftComparable, draftId, draftPayload, mode, persistSnapshot]);

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
    if (mode !== 'editor') { finishLeave(action); return; }
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

  const openNewDraft = async () => {
    if (!startArea?.countryId || !startArea?.cityId) { setStartError('כדאי לבחור עיר או אזור.'); return; }
    const count = Number(startDayCount);
    if (!Number.isSafeInteger(count) || count < 1 || count > 60) { setStartError('אפשר לבחור בין יום אחד ל־60 ימים.'); return; }
    setStartBusy(true); setStartError('');
    const cityName = startArea.name || startArea.cityName || startArea.cityId;
    const initial = {
      area: startArea, dayCount: count,
      title: count === 1 ? `יום ב${cityName}` : `${count} ימים ב${cityName}`,
      description: '', categoryIds: [], subcategoryIds: [],
      attributes: { audienceScope: 'all', audiences: [], budgetLevel: '', seasons: [] },
      difficulty: '', transportModes: [], pace: '', priceBasis: 'whole_route', priceNote: '',
      days: emptyDays(count),
    };
    try {
      const saved = await saveRouteDraft({ saveRequestId: randomUUID(), draft: initial });
      await bindDraftMedia(saved.draftId);
      const normalized = hydrateDraft({ ...initial, id: saved.draftId, version: saved.version });
      lastSavedComparableRef.current = routeEditorComparable(normalized);
    } catch (error) {
      if (error?.details?.reason === 'ROUTE_DRAFT_EXISTS') {
        const current = await getCurrentRouteDraft().catch(() => null);
        if (current) { setExistingDraft(current); setMode('choice'); }
      } else setStartError('לא הצלחנו לפתוח את המסלול. אפשר לנסות שוב בעוד רגע.');
    } finally { setStartBusy(false); }
  };

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
      if (sourceRouteId) openSourceLocally(); else setMode('start');
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
    if (intentMode === 'edit' && !day.stops?.some((stop) => stop.id === stopId)) {
      Alert.alert('העצירה השתנתה', 'העצירה כבר לא קיימת ביום הזה.');
      return;
    }
    setStopEditorIntent({
      dayId: day.id,
      stopId: intentMode === 'insert' ? randomUUID() : stopId,
      beforeStopId: intentMode === 'insert' ? beforeStopId : null,
      mode: intentMode,
    });
  };
  const closeStopEditor = () => setStopEditorIntent(null);
  const saveStop = (stopData) => {
    const intent = stopEditorIntent;
    if (!intent?.dayId || !intent?.stopId) return;
    const nextStop = { ...stopData, id: intent.stopId };
    setDays((current) => current.map((day) => {
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
    }));
  };
  const removeStop = (dayId, stopId) => {
    const stop = days.find((day) => day.id === dayId)?.stops?.find((item) => item.id === stopId);
    if (!stop) return;
    Alert.alert('הסרת עצירה', `להסיר את "${stop.title || 'העצירה'}" מהיום?`, [
      { text: 'ביטול', style: 'cancel' },
      { text: 'הסרה', style: 'destructive', onPress: () => {
        (stop.pendingMedia || []).forEach((item) => Promise.resolve(forgetDurableImage(item?.uri)).catch(() => {}));
        setDays((current) => current.map((day) => day.id === dayId
          ? { ...day, stops: (day.stops || []).filter((item) => item.id !== stopId) }
          : day));
      } },
    ]);
  };
  const updateActiveDayDescription = (value) => setDays((current) => current.map((day, dayIndex) =>
    dayIndex === activeDayIndex ? { ...day, description: value } : day));
  const validatePublish = () => {
    if (!title.trim()) return 'כדאי להוסיף כותרת קצרה למסלול.';
    if (!description.trim()) return 'כדאי להוסיף תיאור למסלול.';
    if (!budgetLevel) return 'כדאי לבחור רמת מחיר למסלול כולו.';
    if (days.some((day) => !day.stops?.length)) return 'כדאי להוסיף לפחות עצירה אחת לכל יום.';
    if (flattenRouteStops(days).filter((stop) => stop.title?.trim()).length < 2) return 'כדאי להוסיף לפחות שתי עצירות שימושיות.';
    return '';
  };
  const handlePublish = async () => {
    const message = validatePublish();
    setValidationMessage(message);
    if (message) { setDetailsOpen(true); return; }
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
        media: extracted.media,
        draft: { route: publishDraft },
      });
      handedOff = true;
      try {
        await clearDraftMedia({
          deleteFiles: false,
          keepUris: extracted.media.map((entry) => entry.uri),
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
          : saveError || 'הטיוטה נשמרה. אפשר לנסות שוב בעוד רגע.'
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

  const editorStopIndex = stopEditorIntent?.mode === 'insert' && selectedDay
    ? stopEditorIntent.beforeStopId
      ? Math.max(0, selectedDay.stops.findIndex((stop) => stop.id === stopEditorIntent.beforeStopId))
      : selectedDay.stops.length
    : selectedStopIndex;

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
      <NoyaGuide dismissible tipId="route-builder" message="יש שינויים שעדיין לא פורסמו במסלול אחר. אפשר לשמור אותם ולחזור, או לוותר עליהם ולפתוח את המסלול שנבחר." />
      <View style={styles.card}>
        <AppText style={styles.startTitle}>{existingDraft?.title || 'שינויים שלא פורסמו'}</AppText>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => finishLeave()} testID="route-switch-cancel"><AppText style={styles.secondaryButtonText}>ביטול וחזרה</AppText></TouchableOpacity>
        <TouchableOpacity style={styles.primaryButton} onPress={discardExistingAndContinue} disabled={startBusy} testID="route-switch-discard">{startBusy ? <ActivityIndicator color={colors.white} /> : <AppText style={styles.primaryButtonText}>ויתור על השינויים ופתיחת המסלול</AppText>}</TouchableOpacity>
      </View>
    </ScrollView>
  );
  if (mode === 'choice') return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <NoyaGuide dismissible tipId="route-builder" message={existingDraft?.sourceRouteId ? "יש עריכות שעדיין לא פורסמו. אפשר להמשיך לערוך או לוותר עליהן." : "יש מסלול חדש בתהליך. אפשר להמשיך בדיוק מהמקום שבו נעצרנו, או למחוק ולהתחיל מחדש."} />
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
  if (mode === 'start') return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <NoyaGuide dismissible tipId="route-builder" message="מתחילים בקטן. איפה המסלול וכמה ימים?" />
      <View style={styles.card}>
        <AppText style={styles.startTitle}>פתיחת מסלול</AppText>
        <AppText style={styles.fieldLabel}>עיר או אזור</AppText>
        <SingleDestinationPicker allowProviderDestinations value={startArea} onChange={(value) => { setStartArea(value); setStartError(''); }} />
        <AppText style={styles.fieldLabel}>כמה ימים?</AppText>
        <View style={styles.dayChoices}>
          {[1, 2, 3, 4].map((count) => <TouchableOpacity key={count} style={[styles.dayChoice, !customDaysOpen && startDayCount === count && styles.dayChoiceSelected]} onPress={() => { setCustomDaysOpen(false); setStartDayCount(count); }} accessibilityRole="radio" accessibilityState={{ checked: !customDaysOpen && startDayCount === count }} testID={`route-start-days-${count}`}><AppText style={[styles.dayChoiceText, !customDaysOpen && startDayCount === count && styles.dayChoiceTextSelected]}>{count}</AppText></TouchableOpacity>)}
          <TouchableOpacity style={[styles.dayChoice, customDaysOpen && styles.dayChoiceSelected]} onPress={() => setCustomDaysOpen(true)} accessibilityRole="radio" accessibilityState={{ checked: customDaysOpen }} testID="route-start-days-custom"><AppText style={[styles.dayChoiceText, customDaysOpen && styles.dayChoiceTextSelected]}>אחר</AppText></TouchableOpacity>
        </View>
        {customDaysOpen ? <FocusClearingFormInput label="מספר ימים" value={String(startDayCount || '')} onChangeText={(value) => setStartDayCount(Number(value.replace(/\D/g, '')) || 0)} placeholder="למשל: 7" keyboardType="numeric" rtl testID="route-start-custom-days-input" /> : null}
        {startError ? <View style={styles.errorBox}><AppText style={styles.errorText}>{startError}</AppText></View> : null}
        <TouchableOpacity style={[styles.primaryButton, startBusy && styles.primaryButtonDisabled]} onPress={openNewDraft} disabled={startBusy} testID="route-start-open">{startBusy ? <ActivityIndicator color={colors.white} /> : <AppText style={styles.primaryButtonText}>פתיחת המסלול</AppText>}</TouchableOpacity>
      </View>
    </ScrollView>
  );

  const activeDay = days[activeDayIndex] || days[0];
  const allStops = flattenRouteStops(days);
  const preciseStops = allStops.filter((stop) => Boolean(getStopCoordinates(stop)));
  return (
    <GestureHandlerRootView style={styles.screen}>
      <NestableScrollContainer contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.statusRow} accessibilityLiveRegion="polite">
          {saveStatus === 'saving' ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name={saveStatus === 'error' ? 'alert-circle-outline' : 'cloud-done-outline'} size={17} color={saveStatus === 'error' ? colors.error : colors.textMuted} />}
          <AppText style={[styles.statusText, saveStatus === 'error' && styles.statusError]}>{saveStatus === 'saving' ? 'שומר טיוטה...' : saveStatus === 'error' ? 'לא הצלחנו לשמור את הטיוטה' : draftId ? 'הטיוטה נשמרה' : isEditingRoute ? 'אין שינויים שלא פורסמו' : ''}</AppText>
          {saveStatus === 'error' ? <TouchableOpacity
            onPress={() => persistSnapshot(draftPayload, draftComparable).catch(() => {})}
            testID="route-save-retry"
          ><AppText style={styles.retryText}>ניסיון נוסף</AppText></TouchableOpacity> : null}
        </View>
        {missingLocalMediaCount ? <View style={styles.errorBox} testID="route-missing-local-media"><AppText style={styles.errorText}>לא הצלחנו לשחזר {missingLocalMediaCount} תמונות מהטיוטה. אפשר לבחור אותן מחדש לפני הפרסום.</AppText></View> : null}
        <NoyaGuide dismissible tipId="route-builder" message="אפשר להתחיל מהעצירות שכבר ברורות. את שאר הפרטים משלימים לפני הפרסום." />
        <TouchableOpacity style={styles.mapPeek} onPress={() => navigation.navigate('RouteMap', { routeData: { title, days } })} accessibilityRole="button" testID="route-map-peek">
          <View><AppText style={styles.mapPeekTitle}>מפת המסלול</AppText><AppText style={styles.mapPeekMeta}>{preciseStops.length ? `${preciseStops.length} נקודות מדויקות` : 'המפה תתעדכן כשיתווספו נקודות מדויקות'}</AppText></View><Ionicons name="map-outline" size={28} color={colors.white} />
        </TouchableOpacity>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs} contentContainerStyle={styles.tabsContent}>
          {days.map((day, index) => <TouchableOpacity key={day.id || index} style={[styles.tab, activeDayIndex === index && styles.tabSelected]} onPress={() => setActiveDayIndex(index)} accessibilityRole="tab" accessibilityState={{ selected: activeDayIndex === index }} testID={`route-day-tab-${index}`}><AppText style={[styles.tabText, activeDayIndex === index && styles.tabTextSelected]}>יום {index + 1}</AppText></TouchableOpacity>)}
        </ScrollView>
        <View style={styles.card}>
          <View style={styles.sectionHeader}><AppText style={styles.sectionTitle}>יום {activeDayIndex + 1}</AppText><AppText style={styles.sectionMeta}>{activeDay?.stops?.length || 0} עצירות</AppText></View>
          <FocusClearingFormInput
            label="הערה ליום (רשות)"
            placeholder="למשל: יום רגוע עם הפסקה ארוכה לצהריים"
            value={activeDay?.description || ''}
            onChangeText={updateActiveDayDescription}
            multiline
            maxLength={1200}
            rtl
            testID="route-day-description-input"
          />
          {!activeDay?.stops?.length ? <AppText style={styles.empty}>עדיין אין עצירות ביום הזה. אפשר להוסיף גם מקום כללי שאין לו נקודה מדויקת במפות.</AppText> : <>
            <AppText style={styles.reorderHint}>לחיצה ארוכה על הידית וגרירה משנה את סדר העצירות</AppText>
            <NestableDraggableFlatList
              data={activeDay.stops}
              keyExtractor={(stop) => stop.id}
              activationDistance={8}
              onDragEnd={({ data }) => replaceDayStops(activeDay.id, data)}
              testID="route-stop-draggable-list"
              renderItem={({ item: stop, getIndex, drag, isActive }) => {
                const reportedIndex = getIndex?.();
                const resolvedIndex = Number.isInteger(reportedIndex)
                  ? reportedIndex
                  : activeDay.stops.findIndex((item) => item.id === stop.id);
                const hasValidIndex = resolvedIndex >= 0;
                const displayNumber = hasValidIndex ? resolvedIndex + 1 : '—';
                return <View>
                  {resolvedIndex > 0 ? <TouchableOpacity
                    style={styles.insertStop}
                    onPress={() => openStopEditor({ beforeStopId: stop.id, mode: 'insert' })}
                    accessibilityRole="button"
                    testID={`route-insert-stop-before-${stop.id}`}
                  ><Ionicons name="add-circle-outline" size={18} color={colors.brandOrange} /><AppText style={styles.insertStopText}>הוספת עצירה כאן</AppText></TouchableOpacity> : null}
                  <ScaleDecorator activeScale={1.02}>
                    <View
                      style={[styles.stopCard, isActive && styles.stopCardDragging]}
                    >
                      <TouchableOpacity
                        style={styles.stopMain}
                        onPress={() => openStopEditor({ stopId: stop.id, mode: 'edit' })}
                        accessibilityRole="button"
                        accessibilityLabel={`עריכת העצירה ${stop.title || displayNumber}`}
                        disabled={isActive || !hasValidIndex}
                        testID={`route-stop-edit-${stop.id}`}
                      >
                        {getStopMediaUrls(stop, 'thumb')[0] ? <CachedImage source={{ uri: getStopMediaUrls(stop, 'thumb')[0] }} style={styles.stopThumb} contentFit="cover" priority="low" /> : <View style={styles.stopNumber}><AppText style={styles.stopNumberText}>{displayNumber}</AppText></View>}
                        <View style={styles.stopCopy}><AppText style={styles.stopTitle}>{stop.title || 'עצירה ללא שם'}</AppText><AppText style={styles.stopMeta}>{stop.locationPrecision === 'general' ? 'מיקום כללי' : stop.location || stop.place?.name || 'נקודה במפה'}{stop.startTime ? ` · ${stop.startTime}` : ''}{stop.durationMinutes ? ` · ${stop.durationMinutes} דק׳` : ''}</AppText></View>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.stopAction}
                        onPress={() => removeStop(activeDay.id, stop.id)}
                        accessibilityLabel={`הסרת העצירה ${stop.title || displayNumber}`}
                        disabled={!hasValidIndex}
                        testID={`route-stop-remove-${stop.id}`}
                      ><Ionicons name="trash-outline" size={20} color={colors.error} /></TouchableOpacity>
                      <TouchableOpacity
                        style={styles.dragHandle}
                        onLongPress={drag}
                        delayLongPress={180}
                        accessibilityLabel={`שינוי מיקום העצירה ${displayNumber}`}
                        accessibilityHint="לחיצה ארוכה וגרירה משנה את הסדר"
                        accessibilityActions={[
                          ...(resolvedIndex > 0 ? [{ name: 'moveUp', label: 'העברה למעלה' }] : []),
                          ...(hasValidIndex && resolvedIndex < activeDay.stops.length - 1 ? [{ name: 'moveDown', label: 'העברה למטה' }] : []),
                        ]}
                        onAccessibilityAction={({ nativeEvent }) => {
                          if (nativeEvent.actionName === 'moveUp') moveStop(activeDay.id, resolvedIndex, resolvedIndex - 1);
                          if (nativeEvent.actionName === 'moveDown') moveStop(activeDay.id, resolvedIndex, resolvedIndex + 1);
                        }}
                        disabled={!hasValidIndex}
                        testID={`route-stop-drag-handle-${stop.id}`}
                      ><Ionicons name="reorder-three-outline" size={27} color={colors.primary} /></TouchableOpacity>
                    </View>
                  </ScaleDecorator>
                </View>
              }}
            />
          </>}
          <TouchableOpacity style={styles.addStop} onPress={() => openStopEditor({ mode: 'insert' })} testID="route-add-stop"><AppText style={styles.addStopText}>הוספת עצירה בסוף היום</AppText></TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.detailsToggle} onPress={() => setDetailsOpen((current) => !current)} testID="route-details-toggle"><AppText style={styles.detailsToggleText}>פרטי המסלול והפרסום</AppText><Ionicons name={detailsOpen ? 'chevron-up' : 'chevron-down'} size={20} color={colors.primary} /></TouchableOpacity>
        {detailsOpen ? <View style={styles.card}>
          <FocusClearingFormInput label="כותרת המסלול" required value={title} onChangeText={setTitle} placeholder="למשל: שלושה ימים של אוכל ותרבות בבודפשט" maxLength={120} rtl testID="route-title-input" />
          <FocusClearingFormInput label="תיאור המסלול" required value={description} onChangeText={setDescription} placeholder="למשל: מסלול רגוע שמשלב את השוק, מרכז העיר ושתי עצירות אוכל אהובות." multiline maxLength={5000} rtl testID="route-description-input" />
          <RtlChoiceGroup label="רמת מחיר למסלול כולו (חובה)" helper="מספיק לבחור הערכה כללית לכל המסלול." options={POST_BUDGETS} selectedIds={[budgetLevel]} selectionMode="single" variant="segment" onToggle={(value) => { setBudgetLevel(value); setValidationMessage(''); }} testIDPrefix="route-budget" />
          <FocusClearingFormInput label="מחיר מדויק או הערה (רשות)" value={priceNote} onChangeText={setPriceNote} placeholder="למשל: כ־600 ש״ח לאדם, ללא טיסות" maxLength={120} rtl testID="route-price-note" />
          <TouchableOpacity style={styles.detailsToggle} onPress={() => setOptionalOpen((current) => !current)} testID="route-optional-toggle"><AppText style={styles.detailsToggleText}>עוד פרטים שימושיים (רשות)</AppText><Ionicons name={optionalOpen ? 'remove' : 'add'} size={20} color={colors.primary} /></TouchableOpacity>
          {optionalOpen ? <View style={styles.optionalBox}><RtlChoiceGroup label="אמצעי התניידות" options={TRANSPORT_MODES} selectedIds={transportModes} onToggle={(value) => setTransportModes((current) => current.includes(value) ? current.filter((id) => id !== value) : [...current, value].slice(0, 4))} maxSelected={4} testIDPrefix="route-transport" /><RtlChoiceGroup label="רמת קושי" options={ROUTE_DIFFICULTIES} selectedIds={[difficulty]} selectionMode="single" onToggle={setDifficulty} testIDPrefix="route-difficulty" /><RtlChoiceGroup label="קצב" options={PACES} selectedIds={[pace]} selectionMode="single" onToggle={setPace} testIDPrefix="route-pace" /><RtlChoiceGroup label="עונה מתאימה" options={SEASONS} selectedIds={seasons} onToggle={(value) => setSeasons((current) => current.includes(value) ? current.filter((id) => id !== value) : [...current, value])} testIDPrefix="route-season" /></View> : null}
          {validationMessage ? <View style={styles.errorBox}><AppText style={styles.errorText}>{validationMessage}</AppText></View> : null}
          {saveError ? <View style={styles.errorBox}><AppText style={styles.errorText}>{saveError}</AppText></View> : null}
        </View> : null}
      </NestableScrollContainer>
      <View style={[styles.footer, routeFooterInsetsStyle(insets.bottom)]} testID="route-footer"><TouchableOpacity style={[styles.primaryButton, (publishBusy || (isEditingRoute && !hasUnpublishedEdit && !publishJobId)) && styles.primaryButtonDisabled]} onPress={handlePublish} disabled={publishBusy || (isEditingRoute && !hasUnpublishedEdit && !publishJobId)} testID="route-submit">{publishBusy ? <ActivityIndicator color={colors.white} /> : <AppText style={styles.primaryButtonText}>{isEditingRoute ? 'פרסום השינויים' : 'פרסום המסלול'}</AppText>}</TouchableOpacity></View>
      <StopEditorModal
        visible={Boolean(stopEditorIntent && selectedDay) && (stopEditorIntent?.mode === 'insert' || Boolean(selectedStop))}
        onClose={closeStopEditor}
        onSave={saveStop}
        initialData={stopEditorIntent?.mode === 'edit' ? selectedStop : null}
        dayIndex={selectedDayIndex >= 0 ? selectedDayIndex : 0}
        stopIndex={editorStopIndex >= 0 ? editorStopIndex : 0}
        onForgetImage={forgetDurableImage}
        onPersistImages={(uris) => persistDurableImages(uris, {
          dayId: stopEditorIntent?.dayId,
          stopId: stopEditorIntent?.stopId,
        })}
        mediaForImage={durableMediaForUri}
        routeDestination={area}
        allowImages
      />
    </GestureHandlerRootView>
  );
}
