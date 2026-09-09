import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import AppText from './AppText';
import AppTextInput from './AppTextInput';
import {
  confirmProvisionalDestinationName,
  finalizeDestinationChoice,
  resolveDestinationForPlacePreview,
  searchDestinationChoices,
} from '../services/LocationService';
import { colors, recommendationComposerStyles as styles } from '../styles';

function destinationValue(result, selection) {
  const country = result?.destination?.country;
  const city = result?.destination?.city;
  if (!country?.id || !city?.id) return null;
  return {
    key: `city:${country.id}:${city.id}`,
    kind: 'city',
    countryId: country.id,
    cityId: city.id,
    countryName: country.name || country.id,
    name: city.name || city.id,
    coordinates: city.coordinates || null,
    provider: 'google',
    providerPlaceId: selection?.providerPlaceId || selection?.place_id || city.googlePlaceId || '',
    resolvedPlaceToken: result.resolvedPlaceToken || '',
  };
}

export default function DestinationFallbackPicker({ onSelect, countryId }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [choice, setChoice] = useState(null);
  const [nameConfirmation, setNameConfirmation] = useState(null);
  const [confirmedName, setConfirmedName] = useState('');
  const searchRequestRef = useRef(0);
  const committingRef = useRef(false);
  useEffect(() => () => { searchRequestRef.current += 1; }, []);

  const commitSelection = async (value) => {
    if (!value) throw new Error('Destination resolution is incomplete.');
    if (typeof onSelect !== 'function') {
      throw new Error('Destination selection handler is unavailable.');
    }
    committingRef.current = true;
    setBusy('commit');
    try {
      await onSelect(value);
    } finally {
      committingRef.current = false;
    }
  };

  const search = async () => {
    if (committingRef.current) return;
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < 2) {
      searchRequestRef.current += 1;
      setResults([]);
      return;
    }
    const requestId = searchRequestRef.current + 1;
    searchRequestRef.current = requestId;
    setBusy('search');
    setError('');
    setResults([]);
    setChoice(null);
    setNameConfirmation(null);
    try {
      const nextResults = await searchDestinationChoices(normalizedQuery, {
        countryId,
        onResults: (available) => {
          if (searchRequestRef.current !== requestId) return;
          setResults(available);
          setBusy('');
        },
      });
      if (searchRequestRef.current === requestId) {
        setResults(Array.isArray(nextResults) ? nextResults : []);
      }
    } catch {
      if (searchRequestRef.current === requestId) {
        setResults([]);
        setError('לא הצלחנו לחפש יעדים כרגע. נסו שוב.');
      }
    } finally {
      if (searchRequestRef.current === requestId) setBusy('');
    }
  };

  const changeQuery = (value) => {
    if (committingRef.current) return;
    searchRequestRef.current += 1;
    setQuery(value);
    setResults([]);
    setChoice(null);
    setNameConfirmation(null);
    setError('');
    setBusy('');
  };

  const resolve = async (selection) => {
    if (committingRef.current) return;
    const requestId = ++searchRequestRef.current;
    setBusy(selection.selectionId || selection.id || 'resolve');
    setError('');
    try {
      if (selection.destinationRef) {
        await commitSelection({ ...selection.destinationRef,
          name: selection.structured_formatting?.main_text,
        });
        return;
      }
      const result = await resolveDestinationForPlacePreview(selection, {
        selectionIntent: 'destination',
      });
      if (requestId !== searchRequestRef.current) return;
      if (result?.status === 'destination_name_confirmation_required') {
        setNameConfirmation({ ...result, selection });
        setConfirmedName(result.nameConfirmation?.suggestedHebrewName || '');
        setChoice(null);
        return;
      }
      if (result?.status === 'destination_choice_required') {
        setChoice({ ...result, selection });
        setNameConfirmation(null);
        return;
      }
      const value = destinationValue(result, selection);
      await commitSelection(value);
    } catch (selectionError) {
      if (requestId === searchRequestRef.current) setError(selectionError?.userMessage || 'לא הצלחנו לאמת את היעד. בחרו שוב או נסו יעד אחר.');
    } finally {
      if (requestId === searchRequestRef.current) setBusy('');
    }
  };

  const finalizeChoice = async (destinationChoiceId) => {
    const requestId = ++searchRequestRef.current;
    setBusy(destinationChoiceId);
    setError('');
    try {
      const result = await finalizeDestinationChoice({
        resolutionId: choice.resolutionId,
        destinationChoiceId,
        incidentId: choice.incidentId,
      });
      if (requestId !== searchRequestRef.current) return;
      const value = destinationValue(result, choice.selection);
      await commitSelection(value);
    } catch (selectionError) {
      if (requestId === searchRequestRef.current) setError(selectionError?.userMessage || 'לא הצלחנו לאמת את היעד. נסו שוב.');
    } finally {
      if (requestId === searchRequestRef.current) setBusy('');
    }
  };

  const confirmName = async () => {
    if (!nameConfirmation?.resolvedPlaceToken || !confirmedName.trim()) return;
    const requestId = ++searchRequestRef.current;
    setBusy('confirm-name');
    setError('');
    try {
      const result = await confirmProvisionalDestinationName({
        resolvedPlaceToken: nameConfirmation.resolvedPlaceToken,
        incidentId: nameConfirmation.incidentId,
        confirmedHebrewName: confirmedName.trim(),
      });
      if (requestId !== searchRequestRef.current) return;
      const value = destinationValue(result, nameConfirmation.selection);
      await commitSelection(value);
    } catch (selectionError) {
      if (requestId === searchRequestRef.current) setError(selectionError?.userMessage || 'השם חייב להיות שם עברי קצר וברור.');
    } finally {
      if (requestId === searchRequestRef.current) setBusy('');
    }
  };

  return (
    <View style={styles.destinationPicker} testID="destination-fallback-picker">
      <View style={styles.searchInputWrap}>
        {busy === 'search'
          ? <ActivityIndicator size="small" color={colors.primary} />
          : <Ionicons name="search" size={19} color={colors.textMuted} />}
        <AppTextInput
          value={query}
          onChangeText={changeQuery}
          onSubmitEditing={search}
          editable={busy !== 'commit'}
          placeholder="למשל: הדולומיטים, איטליה"
          style={styles.searchInput}
          textAlign="right"
          autoCorrect={false}
          testID="destination-fallback-search"
        />
        <TouchableOpacity onPress={search} disabled={busy === 'commit'} accessibilityRole="button" testID="destination-fallback-search-button">
          <AppText style={styles.textAction}>חיפוש</AppText>
        </TouchableOpacity>
      </View>

      {error ? <AppText style={styles.destinationEmpty}>{error}</AppText> : null}

      {nameConfirmation ? (
        <View style={styles.destinationResults} testID="destination-fallback-name-confirmation">
          <AppText style={styles.destinationEmpty}>
            אשרו שם עברי עבור {nameConfirmation.nameConfirmation?.englishName || 'היעד'}
          </AppText>
          <AppTextInput
            value={confirmedName}
            onChangeText={setConfirmedName}
            editable={!busy}
            style={styles.searchInput}
            textAlign="right"
            testID="destination-fallback-hebrew-name"
          />
          <TouchableOpacity
            style={styles.destinationResult}
            onPress={confirmName}
            disabled={Boolean(busy) || !confirmedName.trim()}
            accessibilityRole="button"
            testID="destination-fallback-confirm-name"
          >
            <AppText style={styles.textAction}>אישור היעד</AppText>
          </TouchableOpacity>
        </View>
      ) : null}

      {choice?.alternatives?.map((alternative) => (
        <TouchableOpacity
          key={alternative.destinationChoiceId}
          style={styles.destinationResult}
          onPress={() => finalizeChoice(alternative.destinationChoiceId)}
          disabled={Boolean(busy)}
          accessibilityRole="button"
          testID={`destination-fallback-choice-${alternative.destinationChoiceId}`}
        >
          <AppText style={styles.destinationResultTitle}>{alternative.cityName}</AppText>
          <AppText style={styles.destinationResultSubtitle}>{alternative.countryName}</AppText>
        </TouchableOpacity>
      ))}

      {!choice && !nameConfirmation ? results.map((result, index) => (
        <TouchableOpacity
          key={result.selectionId || result.id}
          style={styles.destinationResult}
          onPress={() => resolve(result)}
          disabled={Boolean(busy)}
          accessibilityRole="button"
          testID={`destination-fallback-result-${index}`}
        >
          <AppText style={styles.destinationResultTitle}>
            {result.structured_formatting?.main_text || result.description}
          </AppText>
          <AppText style={styles.destinationResultSubtitle}>
            {result.structured_formatting?.secondary_text || ''}
          </AppText>
        </TouchableOpacity>
      )) : null}
    </View>
  );
}
