import React, { useEffect, useState } from 'react';
import { ActivityIndicator, TouchableOpacity, View } from 'react-native';

import AppText from './AppText';
import DestinationFallbackPicker from './DestinationFallbackPicker';
import ExactLocationMapPreview from './ExactLocationMapPreview';
import DestinationNameConfirmationModal from './DestinationNameConfirmationModal';
import { exactLocationPickerStyles as styles } from '../styles';
import { locationCopy } from '../utils/locationCopy';

export default function ExactLocationConfirmation({
  pendingLocation,
  destinationChoice,
  onChooseDestination,
  onChooseFallbackDestination,
  onConfirm,
  onChooseAnother,
  onChangeDestination,
  onConfirmDestinationName,
  error = '',
  resolving = false,
  resolvingPreview = null,
  locale = 'he',
}) {
  const copy = locationCopy(locale);
  const [hebrewName, setHebrewName] = useState('');
  useEffect(() => {
    setHebrewName(destinationChoice?.nameConfirmation?.suggestedHebrewName || '');
  }, [destinationChoice?.resolvedPlaceToken, destinationChoice?.nameConfirmation?.suggestedHebrewName]);
  if (destinationChoice?.status === 'destination_name_confirmation_required') {
    return <DestinationNameConfirmationModal visible
      englishName={destinationChoice.nameConfirmation?.englishName} value={hebrewName}
      onChangeText={setHebrewName} onConfirm={() => onConfirmDestinationName?.(hebrewName)}
      onCancel={onChangeDestination || onChooseAnother} busy={resolving} error={error} />;
  }
  if (destinationChoice) {
    const hasAlternatives = Boolean(destinationChoice.alternatives?.length);
    const choicePlace = pendingLocation?.place || destinationChoice.place || null;
    return (
      <View style={styles.choiceCard} testID="exact-location-destination-choices">
        {choicePlace ? (
          <View testID="exact-location-choice-preview">
            <View style={styles.previewCopy}>
              <AppText style={styles.previewTitle} numberOfLines={2}>
                {choicePlace.name || choicePlace.address}
              </AppText>
              {!!choicePlace.address && (
                <AppText style={styles.previewAddress} numberOfLines={2}>
                  {choicePlace.address}
                </AppText>
              )}
            </View>
            <ExactLocationMapPreview place={choicePlace} title={copy.mapPreview} locale={locale} />
          </View>
        ) : null}
        <AppText style={styles.choiceHeading}>
          {hasAlternatives ? copy.destinationChoiceHeading : 'לאיזה יעד לשייך את המקום?'}
        </AppText>
        <AppText style={styles.choiceHelper}>
          {hasAlternatives
            ? copy.destinationChoiceHelper
            : 'המקום המדויק נשמר. בחרו רק את העיר או האזור שבהם מטיילים.'}
        </AppText>
        {(destinationChoice.alternatives || []).map((alternative) => (
          <TouchableOpacity
            key={alternative.destinationChoiceId}
            style={styles.choiceButton}
            onPress={() => onChooseDestination?.(alternative.destinationChoiceId)}
            disabled={resolving}
            accessibilityRole="button"
            testID={`exact-location-destination-${alternative.destinationChoiceId}`}
          >
            <AppText style={styles.choiceTitle}>{alternative.cityName}</AppText>
            <AppText style={styles.choiceMeta}>
              {[alternative.countryName, alternative.destinationType].filter(Boolean).join(' · ')}
            </AppText>
          </TouchableOpacity>
        ))}
        {destinationChoice.allowDestinationSearch ? (
          <View testID="exact-location-destination-search">
            <AppText style={styles.choiceHelper}>לא מצאתם? חפשו עיר או אזור מתאימים.</AppText>
            <DestinationFallbackPicker onSelect={onChooseFallbackDestination}
              countryId={destinationChoice.destinationCountryId || destinationChoice.destinationCountryCode} />
          </View>
        ) : null}
        <TouchableOpacity
          style={styles.chooseAnotherButton}
          onPress={onChooseAnother}
          accessibilityRole="button"
          testID="exact-location-choice-cancel"
        >
          <AppText style={styles.chooseAnotherText}>{copy.chooseAnotherSearchResult}</AppText>
        </TouchableOpacity>
      </View>
    );
  }
  if (!pendingLocation?.place && !resolving) return null;
  const previewPlace = pendingLocation?.place || null;
  const resolvingLabel = resolvingPreview?.description || resolvingPreview?.name || '';
  const destinationLabel = [pendingLocation?.location, pendingLocation?.country]
    .filter(Boolean)
    .join(' · ');
  return (
    <View style={styles.previewCard} testID="exact-location-preview">
      <View style={styles.previewCopy}>
        <AppText style={styles.previewTitle} numberOfLines={2}>
          {previewPlace?.name || previewPlace?.address || resolvingLabel || copy.resolving}
        </AppText>
        {!!previewPlace?.address && (
          <AppText style={styles.previewAddress} numberOfLines={2}>
            {previewPlace.address}
          </AppText>
        )}
        {resolving ? (
          <View style={styles.statusRow} testID="exact-location-resolving-shell">
            <ActivityIndicator size="small" />
            <AppText style={styles.statusText}>{copy.resolving}</AppText>
          </View>
        ) : null}
        {!!destinationLabel && (
          <AppText style={styles.previewDestination}>{destinationLabel}</AppText>
        )}
        {onChangeDestination && previewPlace ? (
          <TouchableOpacity onPress={onChangeDestination} disabled={resolving} style={styles.chooseAnotherButton}
            accessibilityRole="button" testID="exact-location-change-destination">
            <AppText style={styles.chooseAnotherText}>שינוי יעד</AppText>
          </TouchableOpacity>
        ) : null}
      </View>
      <View style={styles.previewActions}>
        <TouchableOpacity
          style={styles.confirmButton}
          onPress={onConfirm}
          disabled={resolving || !previewPlace}
          accessibilityState={{ disabled: resolving || !previewPlace }}
          accessibilityRole="button"
          accessibilityLabel={copy.confirmLocation}
          testID="exact-location-confirm"
        >
          <AppText style={styles.confirmButtonText}>{copy.confirmLocation}</AppText>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.chooseAnotherButton}
          onPress={onChooseAnother}
          accessibilityRole="button"
          accessibilityLabel={copy.chooseAnother}
          testID="exact-location-choose-another"
        >
          <AppText style={styles.chooseAnotherText}>{copy.chooseAnother}</AppText>
        </TouchableOpacity>
      </View>
      {previewPlace ? (
        <ExactLocationMapPreview place={previewPlace} title={copy.mapPreview} locale={locale} />
      ) : (
        <View style={[styles.previewMap, styles.mapSkeleton]} testID="exact-location-map-skeleton">
          <ActivityIndicator />
        </View>
      )}
    </View>
  );
}
