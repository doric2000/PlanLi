import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import AppText from '../../../components/AppText';
import AppTextInput from '../../../components/AppTextInput';
import { useDestinationFilterOptions } from '../../../hooks/useDestinationFilterOptions';
import { colors, recommendationComposerStyles as styles } from '../../../styles';
import { compactDestinationText } from '../../../utils/destinationSearch';

export default function SingleDestinationPicker({ value, onChange }) {
  const [query, setQuery] = useState('');
  const [settledQuery, setSettledQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const {
    options,
    loading,
    searchLoading,
    searchError,
    retrySearch,
  } = useDestinationFilterOptions(true, settledQuery);

  useEffect(() => {
    const timer = setTimeout(() => setSettledQuery(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const results = useMemo(() => {
    const needle = compactDestinationText(settledQuery);
    if (needle.length < 2) return [];
    return options.filter((option) => {
      if (option.kind !== 'city') return false;
      return compactDestinationText([
        option.name,
        option.countryName,
        option.label,
      ].filter(Boolean).join(' ')).includes(needle);
    }).slice(0, 8);
  }, [options, settledQuery]);

  const select = (option) => {
    onChange?.(option);
    setQuery('');
    setSettledQuery('');
    setFocused(false);
  };

  if (value?.cityId && value?.countryId) {
    return (
      <View style={styles.selectedDestination} testID="recommendation-destination-selected">
        <View style={styles.selectedDestinationIcon}>
          <Ionicons name="location" size={20} color={colors.primary} />
        </View>
        <View style={styles.selectedDestinationCopy}>
          <AppText style={styles.selectedDestinationTitle}>{value.name || value.cityId}</AppText>
          <AppText style={styles.selectedDestinationSubtitle}>{value.countryName || value.countryId}</AppText>
        </View>
        <TouchableOpacity
          onPress={() => onChange?.(null)}
          accessibilityRole="button"
          accessibilityLabel="בחירת יעד אחר"
          testID="recommendation-destination-change"
        >
          <AppText style={styles.textAction}>שינוי</AppText>
        </TouchableOpacity>
      </View>
    );
  }

  const normalizedQuery = compactDestinationText(query);
  const searchPending = normalizedQuery.length >= 2 && (
    compactDestinationText(settledQuery) !== normalizedQuery || searchLoading
  );

  return (
    <View style={styles.destinationPicker}>
      <View style={styles.searchInputWrap}>
        {loading || searchPending
          ? <ActivityIndicator size="small" color={colors.primary} />
          : <Ionicons name="search" size={19} color={colors.textMuted} />}
        <AppTextInput
          value={query}
          onChangeText={setQuery}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 180)}
          placeholder={focused ? '' : 'למשל: בודפשט, הונגריה'}
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
          textAlign="right"
          autoCorrect={false}
          autoCapitalize="none"
          testID="recommendation-destination-search"
        />
      </View>

      {focused && normalizedQuery.length === 1 ? (
        <AppText style={styles.fieldHint}>כדאי להקליד לפחות שני תווים</AppText>
      ) : null}

      {focused && normalizedQuery.length >= 2 && !searchPending && searchError ? (
        <View style={styles.destinationResults}>
          <AppText style={styles.destinationEmpty}>{searchError}</AppText>
          <TouchableOpacity
            onPress={retrySearch}
            accessibilityRole="button"
            testID="recommendation-destination-retry"
          >
            <AppText style={styles.textAction}>ניסיון נוסף</AppText>
          </TouchableOpacity>
        </View>
      ) : null}

      {focused && normalizedQuery.length >= 2 && !searchPending && !searchError ? (
        <View style={styles.destinationResults}>
          {results.length ? results.map((option) => (
            <TouchableOpacity
              key={option.key}
              style={styles.destinationResult}
              onPress={() => select(option)}
              accessibilityRole="button"
              testID={`recommendation-destination-option-${option.countryId}-${option.cityId}`}
            >
              <Ionicons name="location-outline" size={19} color={colors.primary} />
              <View style={styles.destinationResultCopy}>
                <AppText style={styles.destinationResultTitle}>{option.name}</AppText>
                <AppText style={styles.destinationResultSubtitle}>{option.countryName}</AppText>
              </View>
            </TouchableOpacity>
          )) : (
            <AppText style={styles.destinationEmpty}>לא נמצא יעד פעיל ב־PlanLi</AppText>
          )}
        </View>
      ) : null}
    </View>
  );
}
