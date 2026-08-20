import React from 'react';
import { TouchableOpacity, View } from 'react-native';

import AppText from './AppText';
import ExactLocationMapPreview from './ExactLocationMapPreview';
import { exactLocationPickerStyles as styles } from '../styles';

export default function ExactLocationConfirmation({
  pendingLocation,
  destinationChoice,
  onChooseDestination,
  onConfirm,
  onChooseAnother,
}) {
  if (destinationChoice?.alternatives?.length) {
    return (
      <View style={styles.choiceCard} testID="exact-location-destination-choices">
        <AppText style={styles.choiceHeading}>לאיזה יעד לשייך את המקום?</AppText>
        <AppText style={styles.choiceHelper}>
          מצאנו כמה יעדים מתאימים. הבחירה לא מפעילה חיפוש נוסף.
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
          <AppText style={styles.chooseAnotherText}>בחירת תוצאת חיפוש אחרת</AppText>
        </TouchableOpacity>
      </View>
    );
  }
  if (!pendingLocation?.place) return null;
  const destinationLabel = [pendingLocation.location, pendingLocation.country]
    .filter(Boolean)
    .join(' · ');
  return (
    <View style={styles.previewCard} testID="exact-location-preview">
      <ExactLocationMapPreview place={pendingLocation.place} />
      <View style={styles.previewCopy}>
        <AppText style={styles.previewTitle} numberOfLines={2}>
          {pendingLocation.place.name || pendingLocation.place.address}
        </AppText>
        {!!pendingLocation.place.address && (
          <AppText style={styles.previewAddress} numberOfLines={2}>
            {pendingLocation.place.address}
          </AppText>
        )}
        {!!destinationLabel && (
          <AppText style={styles.previewDestination}>{destinationLabel}</AppText>
        )}
      </View>
      <View style={styles.previewActions}>
        <TouchableOpacity
          style={styles.confirmButton}
          onPress={onConfirm}
          accessibilityRole="button"
          accessibilityLabel="אישור המיקום"
          testID="exact-location-confirm"
        >
          <AppText style={styles.confirmButtonText}>אישור המיקום</AppText>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.chooseAnotherButton}
          onPress={onChooseAnother}
          accessibilityRole="button"
          accessibilityLabel="בחירת תוצאה אחרת"
          testID="exact-location-choose-another"
        >
          <AppText style={styles.chooseAnotherText}>בחירת תוצאה אחרת</AppText>
        </TouchableOpacity>
      </View>
    </View>
  );
}
