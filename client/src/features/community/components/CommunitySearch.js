import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AppText from '../../../components/AppText';
import AppTextInput from '../../../components/AppTextInput';
import FilterModal from '../../../components/FilterModal';
import { useDestinationFilterOptions } from '../../../hooks/useDestinationFilterOptions';
import { addDestinationSelection, destinationKey, filterDestinationOptions } from '../../../utils/progressiveDiscoveryFilters';
import { rememberDiscoveryDestinations } from '../../../utils/recentDiscoveryDestinations';
import { communityDiscoveryStyles as s, communityPalette as c } from '../../../styles/communityDiscovery';

// Draft input never changes the feed. Only submitting text or choosing a target commits a request.
export default function CommunitySearch({ query = '', destinations = [], onSubmit, onDestinationsChange, prefix, navigation, target, children }) {
  const [draft, setDraft] = useState(query);
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const input = useRef(null);
  const close = () => { setOpen(false); setNotice(''); setDraft(query); Keyboard.dismiss(); };
  useEffect(() => { setDraft(query); }, [query]);
  useEffect(() => navigation?.addListener?.('blur', close), [navigation, query]);
  useEffect(() => {
    if (!open) return undefined;
    const timer = setTimeout(() => setDebounced(draft.trim()), 250);
    return () => clearTimeout(timer);
  }, [draft, open]);
  const eligible = open && draft.trim().length >= 2;
  const { options, loading, searchError, optionsError, retrySearch } = useDestinationFilterOptions(eligible && draft.trim() === debounced, debounced);
  const pending = draft.trim() !== debounced || loading;
  const results = useMemo(() => filterDestinationOptions(options, debounced, 6)
    .filter((option) => !destinations.some((selected) => destinationKey(selected) === destinationKey(option))), [options, debounced, destinations]);
  const suggestionError = searchError || (!results.length && optionsError);
  const submit = () => { onSubmit(draft.trim()); setOpen(false); setNotice(''); Keyboard.dismiss(); };
  const choose = (option) => {
    const next = addDestinationSelection(destinations, option);
    if (next.blocked) { setNotice('אפשר לבחור עד חמישה יעדים. הסירו יעד כדי לבחור אחר.'); return; }
    onDestinationsChange(next.destinations);
    rememberDiscoveryDestinations(next.destinations).catch(() => {});
    setDraft(query); // Preserve an existing free-text constraint independently of the selected destination.
    close();
  };
  return (
    <View>
      <View style={s.searchRow} testID={`${prefix}-search-row`}>
        <View ref={target?.ref} onLayout={target?.onLayout} collapsable={false} style={s.searchField} testID={`${prefix}-search-field`}>
          <Ionicons name="search-outline" size={20} color={c.navy} />
          <Pressable style={s.searchOpen} onPress={() => { setDraft(query); setOpen(true); }} accessibilityRole="button"
            accessibilityLabel={query ? `חיפוש: ${query}` : prefix === 'routes' ? 'חיפוש מסלולים ויעדים' : 'חיפוש המלצות ויעדים'} testID={`${prefix}-search-open`}>
            <AppText style={[s.searchLabel, !query && s.searchPlaceholder]} numberOfLines={1}>{query || (prefix === 'routes' ? 'מסלול, מקום או יעד' : 'מקום, יעד או המלצה')}</AppText>
          </Pressable>
          {!!query && <Pressable style={s.searchClear} accessibilityRole="button" accessibilityLabel="נקה חיפוש"
            onPress={() => { setDraft(''); setDebounced(''); onSubmit(''); }}>
            <Ionicons name="close-circle" size={18} color={c.muted} />
          </Pressable>}
        </View>
        {children(close)}
      </View>
      <FilterModal visible={open} title={prefix === 'routes' ? 'חיפוש מסלולים' : 'חיפוש המלצות'}
        subtitle="חפשו מקום, יעד או רעיון לטיול" presentation="community" onClose={close} onApply={submit} applyText="חיפוש">
        {open && <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.sheetContent} testID={`${prefix}-search-suggestions`}>
          <View style={s.searchSheetInput}>
            <Ionicons name="search-outline" size={20} color={c.navy} />
            <AppTextInput ref={input} testID={`${prefix}-search-input`} style={s.searchInput} autoFocus
              value={draft} onChangeText={(value) => { setDraft(value); setNotice(''); }}
              onSubmitEditing={submit} returnKeyType="search" accessibilityLabel="טקסט לחיפוש"
              placeholder="מדינה, עיר או טקסט חופשי" placeholderTextColor={c.muted} autoCorrect={false} autoCapitalize="none" />
            {!!draft && <Pressable style={s.searchClear} accessibilityRole="button" accessibilityLabel="מחיקת טקסט החיפוש"
              onPress={() => { setDraft(''); setDebounced(''); }}><Ionicons name="close-outline" size={20} color={c.navy} /></Pressable>}
          </View>
          <AppText style={s.notice}>יעדים בקהילה</AppText>
          {!!notice && <AppText style={s.notice} accessibilityRole="alert">{notice}</AppText>}
          {!eligible ? <AppText style={s.notice}>הקלידו לפחות שני תווים להצעות של מדינות וערים</AppText>
            : pending ? <ActivityIndicator style={s.notice} color={c.navy} accessibilityLabel="מחפש יעדים" />
              : suggestionError ? <Pressable style={s.suggestionRow} onPress={retrySearch} accessibilityRole="button"><AppText style={s.notice}>לא הצלחנו לטעון הצעות. נסו שוב</AppText></Pressable>
                : results.length ? results.map((option) => <Pressable key={destinationKey(option)} style={s.suggestionRow}
                  onPress={() => choose(option)} accessibilityRole="button" testID={`${prefix}-suggestion-${destinationKey(option)}`}>
                  <Ionicons name={option.cityId ? 'location-outline' : 'globe-outline'} size={20} color={c.navy} />
                  <View style={s.suggestionCopy}><AppText style={s.suggestionTitle} numberOfLines={1}>{option.name || option.label}</AppText>
                    <AppText style={s.suggestionHint}>{option.cityId ? `עיר · ${option.countryName}` : 'מדינה'}</AppText></View>
                </Pressable>) : <AppText style={s.notice}>לא נמצא יעד פעיל. אפשר לחפש לפי הטקסט שהקלדתם.</AppText>}
          {!!draft.trim() && <Pressable style={s.freeTextAction} accessibilityRole="button" onPress={submit} testID={`${prefix}-submit-search`}>
            <AppText style={[s.activeLabel, s.freeTextLabel]} numberOfLines={2}>חיפוש ״{draft.trim()}״ בטקסט {prefix === 'routes' ? 'המסלולים' : 'ההמלצות'} ←</AppText>
          </Pressable>}
        </ScrollView>}
      </FilterModal>
    </View>
  );
}
