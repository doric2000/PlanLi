import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useDestinationFilterOptions } from '../hooks/useDestinationFilterOptions';
import { useFavoriteCityIds } from '../hooks/useFavoriteCityIds';
import { colors, discoveryFilterStyles as styles } from '../styles';
import {
  addDestinationSelection,
  destinationKey,
  filterDestinationOptions,
  removeDestinationSelection,
} from '../utils/progressiveDiscoveryFilters';
import { loadRecentDiscoveryDestinations } from '../utils/recentDiscoveryDestinations';

function uniqueOptions(options, used, selectedKeys, maximum) {
  const output = [];
  for (const option of options || []) {
    const key = option.key || destinationKey(option);
    if (!key || used.has(key) || selectedKeys.has(key)) continue;
    used.add(key);
    output.push(option);
    if (output.length >= maximum) break;
  }
  return output;
}

function SuggestionRow({ option, onPress }) {
  return (
    <TouchableOpacity
      style={styles.destinationSuggestion}
      onPress={() => onPress(option)}
      accessibilityRole="button"
      testID={`discovery-destination-option-${option.key || destinationKey(option)}`}
    >
      <Ionicons name={option.cityId ? 'location-outline' : 'earth-outline'} size={19} color={colors.primary} />
      <View style={styles.destinationSuggestionTextWrap}>
        <Text style={styles.destinationSuggestionTitle} numberOfLines={1}>{option.name || option.label}</Text>
        {!!option.cityId && (
          <Text style={styles.destinationSuggestionSubtitle} numberOfLines={1}>{option.countryName}</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function DiscoveryDestinationAutocomplete({ destinations, onChange, enabled = true }) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [recent, setRecent] = useState([]);
  const [notice, setNotice] = useState('');
  const { options, popularOptions, loading } = useDestinationFilterOptions(enabled);
  const { favorites } = useFavoriteCityIds({ enabled });
  const selected = Array.isArray(destinations) ? destinations : [];
  const trimmedQuery = query.trim();
  const searchSettled = debouncedQuery === trimmedQuery;
  const selectedKeys = useMemo(() => new Set(selected.map(destinationKey)), [selected]);

  useEffect(() => {
    if (!enabled) return undefined;
    let active = true;
    loadRecentDiscoveryDestinations().then((items) => {
      if (active && items.length) setRecent(items);
    });
    return () => { active = false; };
  }, [enabled]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const optionByKey = useMemo(() => Object.fromEntries(options.map((option) => [option.key, option])), [options]);
  const favoriteOptions = useMemo(() => favorites.map((favorite) => (
    optionByKey[`city:${favorite.countryId}:${favorite.id}`]
  )).filter(Boolean), [favorites, optionByKey]);
  const recentOptions = useMemo(() => recent
    .map((item) => optionByKey[destinationKey(item)])
    .filter(Boolean), [optionByKey, recent]);
  const searchResults = useMemo(() => (
    filterDestinationOptions(options, debouncedQuery, 10)
      .filter((option) => !selectedKeys.has(option.key))
  ), [debouncedQuery, options, selectedKeys]);
  const suggestionGroups = useMemo(() => {
    const used = new Set();
    return [
      { title: 'יעדים אחרונים', items: uniqueOptions(recentOptions, used, selectedKeys, 3) },
      { title: 'יעדים שמורים', items: uniqueOptions(favoriteOptions, used, selectedKeys, 3) },
      { title: 'יעדים פופולריים', items: uniqueOptions(popularOptions, used, selectedKeys, 6) },
    ].filter((group) => group.items.length);
  }, [favoriteOptions, popularOptions, recentOptions, selectedKeys]);

  const selectOption = (option) => {
    const result = addDestinationSelection(selected, option, 5);
    if (result.blocked) {
      setNotice('אפשר לבחור עד חמישה יעדים. הסירו יעד כדי לבחור אחר.');
      return;
    }
    setNotice('');
    onChange?.(result.destinations);
    setQuery('');
    setDebouncedQuery('');
    setShowSuggestions(false);
  };

  return (
    <View style={styles.destinationSection}>
      <Text style={styles.primarySectionTitle}>לאן?</Text>
      <Text style={styles.primarySectionHelper}>אפשר לבחור עד חמישה יעדים</Text>
      <View style={styles.destinationInputWrap}>
        {loading ? <ActivityIndicator size="small" color={colors.primary} /> : (
          <Ionicons name="search" size={19} color={colors.textMuted} />
        )}
        <TextInput
          style={styles.destinationInput}
          value={query}
          onChangeText={(value) => {
            setQuery(value);
            setShowSuggestions(true);
            setNotice('');
          }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 180)}
          placeholder="חפשו מדינה או עיר"
          placeholderTextColor={colors.textMuted}
          textAlign="right"
          autoCorrect={false}
          autoCapitalize="none"
          testID="discovery-destination-search"
        />
      </View>

      {!!selected.length && (
        <View style={styles.selectedDestinations}>
          {selected.map((destination) => {
            const key = destinationKey(destination);
            return (
              <View key={key} style={styles.selectedDestinationChip}>
                <TouchableOpacity
                  onPress={() => onChange?.(removeDestinationSelection(selected, key))}
                  accessibilityRole="button"
                  accessibilityLabel={`הסר ${destination.label}`}
                >
                  <Ionicons name="close-circle" size={18} color={colors.primary} />
                </TouchableOpacity>
                <Text style={styles.selectedDestinationText}>{destination.label}</Text>
              </View>
            );
          })}
        </View>
      )}

      {!!notice && <Text style={styles.inlineNotice}>{notice}</Text>}
      {showSuggestions && (
        <View style={styles.destinationSuggestionsPanel}>
          {trimmedQuery.length >= 2 ? (
            !searchSettled ? (
              <View style={styles.destinationLoadingRow}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.destinationEmptyText}>מחפש...</Text>
              </View>
            ) : searchResults.length ? searchResults.map((option) => (
              <SuggestionRow key={option.key} option={option} onPress={selectOption} />
            )) : (
              <Text style={styles.destinationEmptyText}>לא נמצא יעד פעיל ב־PlanLi</Text>
            )
          ) : trimmedQuery.length === 1 ? (
            <Text style={styles.destinationEmptyText}>הקלידו לפחות שני תווים</Text>
          ) : suggestionGroups.length ? suggestionGroups.map((group) => (
            <View key={group.title} style={styles.destinationSuggestionGroup}>
              <Text style={styles.destinationSuggestionGroupTitle}>{group.title}</Text>
              {group.items.map((option) => (
                <SuggestionRow key={option.key || destinationKey(option)} option={option} onPress={selectOption} />
              ))}
            </View>
          )) : loading ? (
            <View style={styles.destinationLoadingRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.destinationEmptyText}>טוען יעדים...</Text>
            </View>
          ) : (
            <Text style={styles.destinationEmptyText}>התחילו להקליד כדי למצוא יעד</Text>
          )}
        </View>
      )}
    </View>
  );
}
