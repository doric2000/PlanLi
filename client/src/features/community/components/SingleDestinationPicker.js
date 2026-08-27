import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import AppText from '../../../components/AppText';
import AppTextInput from '../../../components/AppTextInput';
import { useDestinationFilterOptions } from '../../../hooks/useDestinationFilterOptions';
import {
  confirmProvisionalDestinationName,
  finalizeDestinationChoice,
  resolveDestinationForPlacePreview,
  searchCities,
} from '../../../services/LocationService';
import { colors, recommendationComposerStyles as styles } from '../../../styles';
import { compactDestinationText } from '../../../utils/destinationSearch';

function providerDestinationValue(result, selection) {
  const country = result?.destination?.country;
  const city = result?.destination?.city;
  if (!country?.id || !city?.id) throw new Error('Destination resolution is incomplete.');
  const providerPlaceId = selection?.providerPlaceId || selection?.place_id || city.googlePlaceId || '';
  const resolvedPlaceToken = result?.resolvedPlaceToken || result?.place?.resolvedPlaceToken || '';
  return {
    key: `city:${country.id}:${city.id}`,
    kind: 'city',
    countryId: country.id,
    cityId: city.id,
    countryName: country.name || country.id,
    name: city.name || city.id,
    coordinates: city.coordinates || null,
    provider: 'google',
    ...(providerPlaceId ? { providerPlaceId } : {}),
    ...(resolvedPlaceToken ? { resolvedPlaceToken } : {}),
  };
}

export default function SingleDestinationPicker({ value, onChange, allowProviderDestinations = false }) {
  const [query, setQuery] = useState('');
  const [settledQuery, setSettledQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [providerResults, setProviderResults] = useState([]);
  const [providerLoading, setProviderLoading] = useState(false);
  const [providerError, setProviderError] = useState('');
  const [providerRetry, setProviderRetry] = useState(0);
  const [resolvingProvider, setResolvingProvider] = useState(false);
  const [destinationChoice, setDestinationChoice] = useState(null);
  const [nameConfirmation, setNameConfirmation] = useState(null);
  const [confirmedHebrewName, setConfirmedHebrewName] = useState('');
  const providerGenerationRef = useRef(0);
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

  useEffect(() => {
    const needle = compactDestinationText(settledQuery);
    const generation = ++providerGenerationRef.current;
    if (!allowProviderDestinations || needle.length < 2 || loading || searchLoading || results.length) {
      setProviderResults([]);
      setProviderLoading(false);
      setProviderError('');
      return undefined;
    }
    const controller = new AbortController();
    setProviderLoading(true);
    setProviderError('');
    searchCities(settledQuery, { signal: controller.signal }).then((nextResults) => {
      if (generation !== providerGenerationRef.current) return;
      setProviderResults(Array.isArray(nextResults) ? nextResults.slice(0, 8) : []);
    }).catch(() => {
      if (generation !== providerGenerationRef.current || controller.signal.aborted) return;
      setProviderResults([]);
      setProviderError('לא הצלחנו לחפש יעדים חדשים כרגע.');
    }).finally(() => {
      if (generation === providerGenerationRef.current) setProviderLoading(false);
    });
    return () => controller.abort();
  }, [allowProviderDestinations, loading, providerRetry, results.length, searchLoading, settledQuery]);

  const select = (option) => {
    onChange?.(option);
    setQuery('');
    setSettledQuery('');
    setFocused(false);
    setProviderResults([]);
    setProviderError('');
    setDestinationChoice(null);
    setNameConfirmation(null);
    setConfirmedHebrewName('');
  };

  const selectProvider = async (selection) => {
    setResolvingProvider(true);
    setProviderError('');
    try {
      const result = await resolveDestinationForPlacePreview(selection, {
        selectionIntent: 'destination',
      });
      if (result?.status === 'destination_name_confirmation_required') {
        setNameConfirmation({ ...result, selection });
        setConfirmedHebrewName(result.nameConfirmation?.suggestedHebrewName || '');
        setDestinationChoice(null);
        return;
      }
      if (result?.status === 'destination_choice_required') {
        setDestinationChoice({ ...result, selection });
        return;
      }
      select(providerDestinationValue(result, selection));
    } catch {
      setProviderError('לא הצלחנו לאמת את היעד. אפשר לבחור אותו שוב.');
    } finally {
      setResolvingProvider(false);
    }
  };

  const confirmProviderName = async () => {
    if (!nameConfirmation?.resolvedPlaceToken || !confirmedHebrewName.trim()) return;
    setResolvingProvider(true);
    setProviderError('');
    try {
      const result = await confirmProvisionalDestinationName({
        resolvedPlaceToken: nameConfirmation.resolvedPlaceToken,
        incidentId: nameConfirmation.incidentId,
        confirmedHebrewName: confirmedHebrewName.trim(),
      });
      select(providerDestinationValue(result, nameConfirmation.selection));
    } catch {
      setProviderError('לא הצלחנו לאשר את שם היעד. בדקו את השם ונסו שוב.');
    } finally {
      setResolvingProvider(false);
    }
  };

  const chooseProviderDestination = async (destinationChoiceId) => {
    if (!destinationChoice?.resolutionId) return;
    setResolvingProvider(true);
    setProviderError('');
    try {
      const result = await finalizeDestinationChoice({
        resolutionId: destinationChoice.resolutionId,
        destinationChoiceId,
        incidentId: destinationChoice.incidentId,
      });
      select(providerDestinationValue(result, destinationChoice.selection));
    } catch {
      setProviderError('לא הצלחנו לאמת את היעד. אפשר לבחור אותו שוב.');
    } finally {
      setResolvingProvider(false);
    }
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
    compactDestinationText(settledQuery) !== normalizedQuery || loading || searchLoading || providerLoading || resolvingProvider
  );
  const visibleResults = results.length ? results : providerResults;
  const usingProviderResults = !results.length && providerResults.length > 0;

  return (
    <View style={styles.destinationPicker}>
      <View style={styles.searchInputWrap}>
        {loading || searchPending
          ? <ActivityIndicator size="small" color={colors.primary} />
          : <Ionicons name="search" size={19} color={colors.textMuted} />}
        <AppTextInput
          value={query}
          onChangeText={(text) => {
            setQuery(text);
            setDestinationChoice(null);
            setNameConfirmation(null);
            setProviderError('');
          }}
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

      {destinationChoice?.alternatives?.length ? (
        <View style={styles.destinationResults} testID="recommendation-destination-provider-choices">
          <AppText style={styles.destinationEmpty}>לאיזה יעד התכוונת?</AppText>
          {destinationChoice.alternatives.map((alternative) => (
            <TouchableOpacity
              key={alternative.destinationChoiceId}
              style={styles.destinationResult}
              onPress={() => chooseProviderDestination(alternative.destinationChoiceId)}
              accessibilityRole="button"
              testID={`recommendation-destination-choice-${alternative.destinationChoiceId}`}
            >
              <Ionicons name="location-outline" size={19} color={colors.primary} />
              <View style={styles.destinationResultCopy}>
                <AppText style={styles.destinationResultTitle}>{alternative.cityName}</AppText>
                <AppText style={styles.destinationResultSubtitle}>{alternative.countryName}</AppText>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {nameConfirmation ? (
        <View style={styles.destinationResults} testID="recommendation-destination-name-confirmation">
          <AppText style={styles.destinationEmpty}>
            אשרו שם עברי עבור {nameConfirmation.nameConfirmation?.englishName || 'היעד'}
          </AppText>
          <AppTextInput
            value={confirmedHebrewName}
            onChangeText={setConfirmedHebrewName}
            style={styles.searchInput}
            textAlign="right"
            autoCorrect={false}
            testID="recommendation-destination-hebrew-name"
          />
          <TouchableOpacity
            style={styles.destinationResult}
            onPress={confirmProviderName}
            disabled={resolvingProvider || !confirmedHebrewName.trim()}
            accessibilityRole="button"
            testID="recommendation-destination-confirm-name"
          >
            <Ionicons name="checkmark-circle-outline" size={19} color={colors.primary} />
            <AppText style={styles.textAction}>אישור היעד</AppText>
          </TouchableOpacity>
        </View>
      ) : null}

      {focused && normalizedQuery.length >= 2 && !searchPending && !destinationChoice && !nameConfirmation ? (
        <View style={styles.destinationResults}>
          {providerError ? (
            <View>
              <AppText style={styles.destinationEmpty}>{providerError}</AppText>
              <TouchableOpacity
                onPress={() => setProviderRetry((value) => value + 1)}
                accessibilityRole="button"
                testID="recommendation-destination-provider-retry"
              >
                <AppText style={styles.textAction}>ניסיון נוסף</AppText>
              </TouchableOpacity>
            </View>
          ) : searchError && !allowProviderDestinations ? (
            <View>
              <AppText style={styles.destinationEmpty}>{searchError}</AppText>
              <TouchableOpacity onPress={retrySearch} accessibilityRole="button" testID="recommendation-destination-retry">
                <AppText style={styles.textAction}>ניסיון נוסף</AppText>
              </TouchableOpacity>
            </View>
          ) : visibleResults.length ? visibleResults.map((option, index) => {
            const isProvider = usingProviderResults;
            return (
              <TouchableOpacity
                key={isProvider ? option.selectionId || option.providerPlaceId : option.key}
                style={styles.destinationResult}
                onPress={() => isProvider ? selectProvider(option) : select(option)}
                accessibilityRole="button"
                testID={isProvider
                  ? `recommendation-destination-provider-option-${index}`
                  : `recommendation-destination-option-${option.countryId}-${option.cityId}`}
              >
                <Ionicons name="location-outline" size={19} color={colors.primary} />
                <View style={styles.destinationResultCopy}>
                  <AppText style={styles.destinationResultTitle}>
                    {isProvider ? option.structured_formatting?.main_text || option.description : option.name}
                  </AppText>
                  <AppText style={styles.destinationResultSubtitle}>
                    {isProvider ? option.structured_formatting?.secondary_text : option.countryName}
                  </AppText>
                </View>
              </TouchableOpacity>
            );
          }) : (
            <AppText style={styles.destinationEmpty}>
              {allowProviderDestinations ? 'לא נמצא יעד מתאים' : 'לא נמצא יעד פעיל ב־PlanLi'}
            </AppText>
          )}
          {usingProviderResults ? <AppText style={styles.destinationEmpty}>תוצאות מ־Google Maps</AppText> : null}
        </View>
      ) : null}
    </View>
  );
}
