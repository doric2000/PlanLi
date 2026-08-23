import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import AppText from '../../../components/AppText';
import CachedImage from '../../../components/CachedImage';
import { FormInput } from '../../../components/FormInput';
import RtlChoiceGroup from '../../../components/RtlChoiceGroup';
import { useBackButton } from '../../../hooks/useBackButton';
import {
  PACES, POST_BUDGETS, ROUTE_DIFFICULTIES, SEASONS, TRANSPORT_MODES,
} from '../../../constants/travelTaxonomy';
import {
  discardRouteDraft, getCurrentRouteDraft, publishRouteDraft, saveRouteDraft,
} from '../../../services/RouteService';
import { colors, routeBuilderStyles as styles } from '../../../styles';
import NoyaGuide from '../../community/components/NoyaGuide';
import SingleDestinationPicker from '../../community/components/SingleDestinationPicker';
import DayEditorModal from '../components/DayEditorModal';
import { flattenRouteStops, getStopMediaUrls } from '../utils/routeStops';

const SAVE_DELAY_MS = 900;
const emptyDays = (count) => Array.from({ length: count }, (_, index) => ({
  id: `day_${String(index + 1).padStart(3, '0')}`, description: '', media: null, stops: [],
}));

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
    id: `day_${String(dayIndex + 1).padStart(3, '0')}`,
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
    days,
  };
};

function FocusClearingFormInput({ placeholder, onFocus, onBlur, ...props }) {
  const [focused, setFocused] = useState(false);
  return <FormInput {...props} placeholder={focused ? '' : placeholder} onFocus={(event) => {
    setFocused(true); onFocus?.(event);
  }} onBlur={(event) => { setFocused(false); onBlur?.(event); }} />;
}

export default function AddRoutesScreen({ navigation, route }) {
  const routeToEdit = route?.params?.routeToEdit || null;
  const sourceRouteId = routeToEdit?.id || routeToEdit?.routeId || null;
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
  const [pace, setPace] = useState('');
  const [seasons, setSeasons] = useState([]);
  const [categoryIds, setCategoryIds] = useState([]);
  const [subcategoryIds, setSubcategoryIds] = useState([]);
  const [preservedAttributes, setPreservedAttributes] = useState({});
  const [activeDayIndex, setActiveDayIndex] = useState(0);
  const [dayEditorVisible, setDayEditorVisible] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [optionalOpen, setOptionalOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState('saved');
  const [saveError, setSaveError] = useState('');
  const [publishBusy, setPublishBusy] = useState(false);
  const [validationMessage, setValidationMessage] = useState('');
  const draftIdRef = useRef('');
  const versionRef = useRef(0);
  const sourceRouteIdRef = useRef(null);
  const lastSavedComparableRef = useRef('');
  const saveQueueRef = useRef(Promise.resolve());
  const mountedRef = useRef(true);
  const isEditingRoute = Boolean(sourceRouteId || sourceRouteIdRef.current);

  useBackButton(navigation, { title: isEditingRoute ? 'עריכת מסלול' : 'מסלול חדש' });

  const hydrateDraft = useCallback((draft) => {
    const normalized = routeAsDraft(draft);
    draftIdRef.current = draft.id;
    versionRef.current = Number(draft.version || 0);
    sourceRouteIdRef.current = draft.sourceRouteId || null;
    setDraftId(draft.id);
    setArea(normalized.area);
    setTitle(normalized.title);
    setDescription(normalized.description);
    setDays(normalized.days);
    setBudgetLevel(normalized.attributes.budgetLevel);
    setPriceNote(normalized.priceNote);
    setTransportModes(normalized.transportModes);
    setDifficulty(normalized.difficulty);
    setPace(normalized.pace);
    setSeasons(normalized.attributes.seasons);
    setCategoryIds(normalized.categoryIds);
    setSubcategoryIds(normalized.subcategoryIds);
    setPreservedAttributes(normalized.attributes);
    setActiveDayIndex(0);
    setSaveStatus('saved');
    setSaveError('');
    setMode('editor');
    return normalized;
  }, []);

  const createEditDraft = useCallback(async () => {
    const initial = routeAsDraft(routeToEdit);
    if (!initial.area) {
      setStartError('לא הצלחנו לזהות יעד למסלול הקיים. כדאי להוסיף יעד לפני העריכה.');
      setMode('start');
      return;
    }
    const saved = await saveRouteDraft({ sourceRouteId, draft: initial });
    const normalized = hydrateDraft({ ...initial, id: saved.draftId, version: saved.version, sourceRouteId });
    lastSavedComparableRef.current = JSON.stringify(normalized);
  }, [hydrateDraft, routeToEdit, sourceRouteId]);

  useEffect(() => {
    mountedRef.current = true;
    let active = true;
    getCurrentRouteDraft().then(async (current) => {
      if (!active) return;
      if (current) {
        if (sourceRouteId && current.sourceRouteId === sourceRouteId) {
          const normalized = hydrateDraft(current);
          lastSavedComparableRef.current = JSON.stringify(normalized);
        } else {
          setExistingDraft(current);
          setMode('choice');
        }
      } else if (sourceRouteId) await createEditDraft();
      else setMode('start');
    }).catch((error) => {
      console.error('route_draft_load_failed', { code: error?.code || 'unknown' });
      if (active) {
        setStartError('לא הצלחנו לבדוק אם קיים מסלול בתהליך. אפשר לנסות שוב.');
        setMode('start');
      }
    });
    return () => { active = false; mountedRef.current = false; };
  }, [createEditDraft, hydrateDraft, sourceRouteId]);

  const draftPayload = useMemo(() => ({
    area, dayCount: days.length, title, description, categoryIds, subcategoryIds,
    attributes: { ...preservedAttributes, budgetLevel, seasons },
    difficulty, experienceLevel: '', transportModes, pace,
    priceBasis: 'whole_route', priceNote, days,
  }), [area, budgetLevel, categoryIds, days, description, difficulty, pace, preservedAttributes, priceNote, seasons, subcategoryIds, title, transportModes]);
  const draftComparable = useMemo(() => JSON.stringify(draftPayload), [draftPayload]);

  const persistSnapshot = useCallback((snapshot, comparable) => {
    saveQueueRef.current = saveQueueRef.current.catch(() => versionRef.current).then(async () => {
      if (!draftIdRef.current || comparable === lastSavedComparableRef.current) return versionRef.current;
      if (mountedRef.current) { setSaveStatus('saving'); setSaveError(''); }
      try {
        const saved = await saveRouteDraft({
          draftId: draftIdRef.current,
          sourceRouteId: sourceRouteIdRef.current,
          expectedVersion: versionRef.current,
          draft: snapshot,
        });
        versionRef.current = saved.version;
        lastSavedComparableRef.current = comparable;
        if (mountedRef.current) setSaveStatus('saved');
        return saved.version;
      } catch (error) {
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
  }, []);

  useEffect(() => {
    if (mode !== 'editor' || !draftId || draftComparable === lastSavedComparableRef.current) return undefined;
    const timer = setTimeout(() => persistSnapshot(draftPayload, draftComparable).catch(() => {}), SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [draftComparable, draftId, draftPayload, mode, persistSnapshot]);

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
      const saved = await saveRouteDraft({ draft: initial });
      const normalized = hydrateDraft({ ...initial, id: saved.draftId, version: saved.version });
      lastSavedComparableRef.current = JSON.stringify(normalized);
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
      setExistingDraft(null);
      if (sourceRouteId) await createEditDraft(); else setMode('start');
    } catch (error) { Alert.alert('לא הצלחנו למחוק את הטיוטה', 'אפשר לנסות שוב בעוד רגע.'); }
    finally { setStartBusy(false); }
  };
  const selectExistingDraft = () => {
    const normalized = hydrateDraft(existingDraft);
    lastSavedComparableRef.current = JSON.stringify(normalized);
    setExistingDraft(null);
  };
  const moveStop = (from, direction) => setDays((current) => current.map((day, index) => {
    if (index !== activeDayIndex) return day;
    const to = from + direction;
    if (to < 0 || to >= day.stops.length) return day;
    const stops = [...day.stops];
    [stops[from], stops[to]] = [stops[to], stops[from]];
    return { ...day, stops };
  }));
  const saveDay = (value, index) => setDays((current) => current.map((day, dayIndex) =>
    dayIndex === index ? { ...day, ...value, id: day.id } : day));
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
    try {
      const version = await persistSnapshot(draftPayload, draftComparable);
      await publishRouteDraft(draftIdRef.current, version);
      Alert.alert(
        isEditingRoute ? 'השינויים נשמרו' : 'המסלול פורסם',
        isEditingRoute ? 'המסלול המעודכן זמין עכשיו ב־PlanLi.' : 'המסלול זמין עכשיו ב־PlanLi.'
      );
      navigation.goBack();
    } catch (error) {
      Alert.alert(
        isEditingRoute ? 'לא הצלחנו לשמור את השינויים' : 'לא הצלחנו לפרסם את המסלול',
        saveError || 'הטיוטה נשמרה. אפשר לנסות שוב בעוד רגע.'
      );
    } finally { setPublishBusy(false); }
  };

  if (mode === 'loading') return <View style={styles.loading}><ActivityIndicator color={colors.primary} /><AppText style={styles.loadingText}>פותחים את בונה המסלול...</AppText></View>;
  if (mode === 'choice') return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <NoyaGuide dismissible message="יש מסלול בתהליך. אפשר להמשיך בדיוק מהמקום שבו נעצרנו, או למחוק ולהתחיל מחדש." />
      <View style={styles.card}>
        <AppText style={styles.startTitle}>{existingDraft?.title || 'מסלול בתהליך'}</AppText>
        <AppText style={styles.body}>{existingDraft?.dayCount || existingDraft?.days?.length || 1} ימים{existingDraft?.area?.cityName ? ` · ${existingDraft.area.cityName}` : ''}</AppText>
        <TouchableOpacity style={styles.primaryButton} onPress={selectExistingDraft} testID="route-draft-continue"><AppText style={styles.primaryButtonText}>המשך המסלול</AppText></TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={discardExistingAndContinue} testID="route-draft-discard">
          {startBusy ? <ActivityIndicator color={colors.primary} /> : <AppText style={styles.destructiveText}>מחיקה והתחלה מחדש</AppText>}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
  if (mode === 'start') return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <NoyaGuide dismissible message="נתחיל בקטן. איפה המסלול וכמה ימים?" />
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
  const preciseStops = allStops.filter((stop) => stop.locationPrecision !== 'general' && stop.coordinates);
  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.statusRow} accessibilityLiveRegion="polite">
          {saveStatus === 'saving' ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name={saveStatus === 'error' ? 'alert-circle-outline' : 'cloud-done-outline'} size={17} color={saveStatus === 'error' ? colors.error : colors.textMuted} />}
          <AppText style={[styles.statusText, saveStatus === 'error' && styles.statusError]}>{saveStatus === 'saving' ? 'שומר...' : saveStatus === 'error' ? 'לא הצלחנו לשמור' : 'נשמר'}</AppText>
          {saveStatus === 'error' ? <TouchableOpacity
            onPress={() => persistSnapshot(draftPayload, draftComparable).catch(() => {})}
            testID="route-save-retry"
          ><AppText style={styles.retryText}>ניסיון נוסף</AppText></TouchableOpacity> : null}
        </View>
        <NoyaGuide dismissible message="אפשר להתחיל מהעצירות שכבר ברורות. את שאר הפרטים משלימים לפני הפרסום." />
        <TouchableOpacity style={styles.mapPeek} onPress={() => navigation.navigate('RouteMap', { routeData: { title, days } })} accessibilityRole="button" testID="route-map-peek">
          <View><AppText style={styles.mapPeekTitle}>מפת המסלול</AppText><AppText style={styles.mapPeekMeta}>{preciseStops.length ? `${preciseStops.length} נקודות מדויקות` : 'המפה תתעדכן כשיתווספו נקודות מדויקות'}</AppText></View><Ionicons name="map-outline" size={28} color={colors.white} />
        </TouchableOpacity>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs} contentContainerStyle={styles.tabsContent}>
          {days.map((day, index) => <TouchableOpacity key={day.id || index} style={[styles.tab, activeDayIndex === index && styles.tabSelected]} onPress={() => setActiveDayIndex(index)} accessibilityRole="tab" accessibilityState={{ selected: activeDayIndex === index }} testID={`route-day-tab-${index}`}><AppText style={[styles.tabText, activeDayIndex === index && styles.tabTextSelected]}>יום {index + 1}</AppText></TouchableOpacity>)}
        </ScrollView>
        <View style={styles.card}>
          <View style={styles.sectionHeader}><AppText style={styles.sectionTitle}>יום {activeDayIndex + 1}</AppText><AppText style={styles.sectionMeta}>{activeDay?.stops?.length || 0} עצירות</AppText></View>
          {!activeDay?.stops?.length ? <AppText style={styles.empty}>עדיין אין עצירות ביום הזה. אפשר להוסיף גם מקום כללי שאין לו נקודה מדויקת במפות.</AppText> : activeDay.stops.map((stop, index) => (
            <TouchableOpacity key={stop.id || `${activeDayIndex}-${index}`} style={styles.stopCard} onPress={() => setDayEditorVisible(true)} accessibilityRole="button">
              {getStopMediaUrls(stop, 'thumb')[0] ? <CachedImage source={{ uri: getStopMediaUrls(stop, 'thumb')[0] }} style={styles.stopThumb} contentFit="cover" priority="low" /> : <View style={styles.stopNumber}><AppText style={styles.stopNumberText}>{index + 1}</AppText></View>}
              <View style={styles.stopCopy}><AppText style={styles.stopTitle}>{stop.title}</AppText><AppText style={styles.stopMeta}>{stop.locationPrecision === 'general' ? 'מיקום כללי' : stop.location || stop.place?.name || 'נקודה במפה'}{stop.startTime ? ` · ${stop.startTime}` : ''}{stop.durationMinutes ? ` · ${stop.durationMinutes} דק׳` : ''}</AppText></View>
              <View style={styles.stopControls}><TouchableOpacity style={styles.stopControl} onPress={(event) => { event.stopPropagation?.(); moveStop(index, -1); }} disabled={index === 0} accessibilityLabel="העברה למעלה"><Ionicons name="chevron-up" size={19} color={index === 0 ? colors.textMuted : colors.primary} /></TouchableOpacity><TouchableOpacity style={styles.stopControl} onPress={(event) => { event.stopPropagation?.(); moveStop(index, 1); }} disabled={index === activeDay.stops.length - 1} accessibilityLabel="העברה למטה"><Ionicons name="chevron-down" size={19} color={index === activeDay.stops.length - 1 ? colors.textMuted : colors.primary} /></TouchableOpacity></View>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.addStop} onPress={() => setDayEditorVisible(true)} testID="route-add-stop"><AppText style={styles.addStopText}>הוספת עצירה</AppText></TouchableOpacity>
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
      </ScrollView>
      <View style={styles.footer}><TouchableOpacity style={[styles.primaryButton, publishBusy && styles.primaryButtonDisabled]} onPress={handlePublish} disabled={publishBusy} testID="route-submit">{publishBusy ? <ActivityIndicator color={colors.white} /> : <AppText style={styles.primaryButtonText}>{isEditingRoute ? 'שמור שינויים' : 'פרסום המסלול'}</AppText>}</TouchableOpacity></View>
      <DayEditorModal visible={dayEditorVisible} onClose={() => setDayEditorVisible(false)} onSave={saveDay} initialData={activeDay} dayIndex={activeDayIndex} routeDestination={area} allowStopImages />
    </View>
  );
}
