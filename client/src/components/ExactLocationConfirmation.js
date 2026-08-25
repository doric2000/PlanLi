import React from 'react';
import { ActivityIndicator, TouchableOpacity, View } from 'react-native';

import AppText from './AppText';
import ExactLocationMapPreview from './ExactLocationMapPreview';
import { exactLocationPickerStyles as styles } from '../styles';
import { locationCopy } from '../utils/locationCopy';

export default function ExactLocationConfirmation({
  pendingLocation,
  destinationChoice,
  onChooseDestination,
  onConfirm,
  onChooseAnother,
  resolving = false,
  resolvingPreview = null,
  locale = 'he',
}) {
  const copy = locationCopy(locale);
  if (destinationChoice?.alternatives?.length) {
    return (
      <View style={styles.choiceCard} testID="exact-location-destination-choices">
        <AppText style={styles.choiceHeading}>{copy.destinationChoiceHeading}</AppText>
        <AppText style={styles.choiceHelper}>
          {copy.destinationChoiceHelper}
        </AppText>
        {destinationChoice.alternatives.map((alternative) => (
          <TouchableOpacity
            key={alternative.destinationChoiceId}
            style={styles.choiceButton}
            onPress={() => onChooseDestination?.(alternative.destinationChoiceId)}
            accessibilityRole="button"
            testID={`exact-location-destination-${alternative.destinationChoiceId}`}
          >
            <AppText style={styles.choiceTitle}>{alternative.cityName}</AppText>
            <AppText style={styles.choiceMeta}>
              {[alternative.countryName, alternative.destinationType].filter(Boolean).join(' · ')}
            </AppText>
          </TouchableOpacity>
        ))}
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
