import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Keyboard, ScrollView, TouchableOpacity, View } from 'react-native';
import AppText from '../../../components/AppText';
import AppTextInput from '../../../components/AppTextInput';
import CachedImage from '../../../components/CachedImage';
import RtlChoiceGroup from '../../../components/RtlChoiceGroup';
import { CATEGORIES, POST_BUDGETS } from '../../../constants/travelTaxonomy';
import { getPersonalizedRecommendations } from '../../../services/PersonalizationService';
import { getMediaVariantUrl } from '../../../utils/mediaAssets';
import { colors, routeBuilderStyles as styles } from '../../../styles';
import SingleDestinationPicker from '../../community/components/SingleDestinationPicker';

// This is a screen-sized mode in the composer, never a list inside the stop form.
export default function RouteRecommendationPicker({ routeDestination, onSelect, onCancel }) {
  const [destination, setDestination] = useState(routeDestination || null);
  const [query, setQuery] = useState('');
  const [settledQuery, setSettledQuery] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [budget, setBudget] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState({ key: '', items: [], loading: true, error: '' });
  const selectedRef = useRef(false);
  const retriedAttemptRef = useRef(0);
  const trimmedQuery = query.trim();
  const tooShort = trimmedQuery.length === 1;
  const requestKey = JSON.stringify({ query: settledQuery, countryId: destination?.countryId || '',
    cityId: destination?.cityId || '', categoryId, budget, attempt });

  useEffect(() => {
    const timer = setTimeout(() => setSettledQuery(trimmedQuery), 250);
    return () => clearTimeout(timer);
  }, [trimmedQuery]);

  useEffect(() => {
    let active = true;
    if (trimmedQuery !== settledQuery || tooShort || filtersOpen) return undefined;
    setResult({ key: requestKey, items: [], loading: true, error: '' });
    const retryFailed = attempt !== retriedAttemptRef.current;
    retriedAttemptRef.current = attempt;
    getPersonalizedRecommendations({
      ...(destination?.countryId ? { context: { countryId: destination.countryId,
        ...(destination.cityId ? { cityId: destination.cityId } : {}) } } : {}),
      query: settledQuery, sort: settledQuery ? 'relevance' : 'forYou', limit: 30,
      filters: { categoryIds: categoryId ? [categoryId] : [], budgetLevels: budget ? [budget] : [] },
    }, { retryFailed }).then((response) => {
      if (active) setResult({ key: requestKey, items: Array.isArray(response?.items) ? response.items.slice(0, 30) : [], loading: false, error: '' });
    }).catch(() => {
      if (active) setResult({ key: requestKey, items: [], loading: false, error: 'לא הצלחנו לטעון המלצות כרגע.' });
    });
    return () => { active = false; };
  }, [requestKey, trimmedQuery, settledQuery, tooShort, filtersOpen]);

  const pending = !tooShort && (trimmedQuery !== settledQuery || result.key !== requestKey || result.loading);
  const items = pending || tooShort || result.error ? [] : result.items;
  const scopeName = destination?.cityName || destination?.name || destination?.countryName || 'כל היעדים';
  return (
    <View style={styles.screen} testID="route-recommendation-picker">
      <View style={styles.modeHeader}>
        <View style={styles.sectionHeader}>
          <AppText style={styles.sectionTitle}>בחירה מהמלצות PlanLi</AppText>
          <TouchableOpacity style={styles.textButton} onPress={() => { Keyboard.dismiss(); onCancel(); }} accessibilityRole="button" testID="route-recommendations-cancel"><AppText style={styles.retryText}>חזרה לעצירה</AppText></TouchableOpacity>
        </View>
        <AppTextInput accessibilityLabel="חיפוש המלצות" placeholder="חיפוש מקום או המלצה" value={query} onChangeText={setQuery} maxLength={120} style={styles.searchInput} returnKeyType="search" onSubmitEditing={Keyboard.dismiss} testID="route-recommendations-search" />
        <TouchableOpacity style={styles.detailsToggle} onPress={() => { Keyboard.dismiss(); setFiltersOpen((open) => !open); }} accessibilityRole="button" accessibilityState={{ expanded: filtersOpen }} testID="route-recommendations-filters">
          <AppText style={styles.body}>{scopeName}{categoryId || budget ? ' · סינון פעיל' : ''}</AppText><AppText style={styles.retryText}>{filtersOpen ? 'חזרה לתוצאות' : 'שינוי וסינון'}</AppText>
        </TouchableOpacity>
      </View>
      {filtersOpen ? <ScrollView style={styles.modeList} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AppText style={styles.fieldLabel}>עיר או אזור לחיפוש</AppText>
        <SingleDestinationPicker value={destination} onChange={setDestination} />
        <View style={styles.rowActions}>
          <TouchableOpacity accessibilityRole="button" style={styles.textButton} onPress={() => setDestination(routeDestination || null)} testID="route-recommendations-route-area"><AppText style={styles.retryText}>יעד המסלול</AppText></TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" style={styles.textButton} onPress={() => setDestination(null)} testID="route-recommendations-all-areas"><AppText style={styles.retryText}>כל היעדים</AppText></TouchableOpacity>
        </View>
        <RtlChoiceGroup label="קטגוריה" options={CATEGORIES} selectedIds={[categoryId]} selectionMode="single" onToggle={(id) => setCategoryId((current) => current === id ? '' : id)} testIDPrefix="route-recommendations-category" />
        <RtlChoiceGroup label="מחיר" options={POST_BUDGETS} selectedIds={[budget]} selectionMode="single" onToggle={(id) => setBudget((current) => current === id ? '' : id)} testIDPrefix="route-recommendations-budget" />
        <TouchableOpacity accessibilityRole="button" style={styles.primaryButton} onPress={() => setFiltersOpen(false)} testID="route-recommendations-apply"><AppText style={styles.primaryButtonText}>הצגת המלצות</AppText></TouchableOpacity>
      </ScrollView> : <FlatList
        style={styles.modeList} contentContainerStyle={styles.content} data={items} keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" initialNumToRender={6} maxToRenderPerBatch={6} windowSize={5}
        testID="route-recommendations-list"
        renderItem={({ item }) => {
          const uri = getMediaVariantUrl(item.media, 'thumb');
          return <TouchableOpacity style={styles.stopCard} accessibilityRole="button" testID={`route-stop-recommendation-${item.id}`} onPress={() => {
            if (selectedRef.current) return;
            selectedRef.current = true; Keyboard.dismiss(); onSelect(item);
          }}>
            {!!uri && <CachedImage source={{ uri }} style={styles.stopThumb} contentFit="cover" />}
            <View style={styles.flexCopy}><AppText style={styles.stopTitle} numberOfLines={2}>{item.title}</AppText><AppText style={styles.stopMeta} numberOfLines={1}>{item.destination?.cityName || item.location || ''}</AppText></View>
          </TouchableOpacity>;
        }}
        ListEmptyComponent={<View style={styles.emptyDay}>
          {pending ? <ActivityIndicator color={colors.primary} /> : <AppText style={styles.body}>{tooShort ? 'הקלידו לפחות שני תווים לחיפוש.' : result.error || 'לא נמצאו המלצות שמתאימות לחיפוש וליעד שנבחרו.'}</AppText>}
          {!pending && !!result.error && <TouchableOpacity accessibilityRole="button" style={styles.secondaryButton} onPress={() => setAttempt((value) => value + 1)} testID="route-stop-recommendations-retry"><AppText style={styles.secondaryButtonText}>ניסיון נוסף</AppText></TouchableOpacity>}
          {!pending && !tooShort && !result.error && <TouchableOpacity accessibilityRole="button" style={styles.textButton} onPress={() => setFiltersOpen(true)}><AppText style={styles.retryText}>שינוי היעד או המסננים</AppText></TouchableOpacity>}
        </View>}
        ListFooterComponent={items.length ? <AppText style={styles.empty}>לחיפוש המלצות נוספות, נסו לדייק את שם המקום או לשנות את הסינון.</AppText> : null}
      />}
    </View>
  );
}
