import React, { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import AppText from "../../../components/AppText";
import { MaterialIcons } from '@expo/vector-icons';

import { colors } from '../../../styles';
import { getPreferencePresentation } from '../../../constants/travelPresentation';

function PreferenceChip({ preference, styles }) {
  return (
    <View
      style={styles.preferenceChip}
      testID={`profile-preference-${preference.kind}-${preference.id}`}
    >
      <MaterialIcons name={preference.icon} size={17} color={colors.primary} />
      <AppText style={styles.preferenceChipLabel} numberOfLines={1}>
        {preference.label}
      </AppText>
    </View>
  );
}

function PreferenceGroup({ title, icon, preferences, styles, testID }) {
  if (!preferences.length) return null;

  return (
    <View style={styles.preferenceGroup} testID={testID}>
      <View style={styles.preferenceGroupTitleRow}>
        <MaterialIcons name={icon} size={17} color={colors.textLight} />
        <AppText style={styles.preferenceGroupTitle}>{title}</AppText>
      </View>
      <View style={styles.preferenceChipsWrap}>
        {preferences.map((preference) => (
          <PreferenceChip
            key={`${preference.kind}-${preference.id}`}
            preference={preference}
            styles={styles}
          />
        ))}
      </View>
    </View>
  );
}

export default function ProfilePreferencesSignature({
  smartProfile,
  isOwner,
  onEdit,
  styles,
}) {
  const preferences = useMemo(() => {
    const interests = Array.isArray(smartProfile?.interests)
      ? smartProfile.interests.map((value) => getPreferencePresentation('interest', value))
      : [];
    const vibes = Array.isArray(smartProfile?.vibe)
      ? smartProfile.vibe.map((value) => getPreferencePresentation('vibe', value))
      : [];
    return { interests, vibes };
  }, [smartProfile?.interests, smartProfile?.vibe]);

  const hasPreferences = preferences.interests.length > 0 || preferences.vibes.length > 0;
  const canEdit = isOwner && typeof onEdit === 'function';

  if (!hasPreferences && !isOwner) return null;

  return (
    <View style={styles.preferencesSection} testID="profile-preferences-signature">
      <View style={styles.preferencesHeader}>
        <View style={styles.preferencesHeadingWrap}>
          <View style={styles.preferencesHeaderIcon}>
            <MaterialIcons name="explore" size={21} color={colors.primary} />
          </View>
          <View style={styles.preferencesHeadingText}>
            <AppText style={styles.preferencesTitle}>הטעם שלי בטיולים</AppText>
          </View>
        </View>

        {canEdit ? (
          <Pressable
            onPress={onEdit}
            style={({ pressed }) => [styles.preferencesEdit, pressed && styles.preferencesEditPressed]}
            accessibilityRole="button"
            accessibilityLabel="עריכת העדפות הטיול"
          >
            <MaterialIcons name="edit" size={16} color={colors.primary} />
            <AppText style={styles.preferencesEditText}>עריכה</AppText>
          </Pressable>
        ) : null}
      </View>

      {hasPreferences ? (
        <View style={styles.preferenceGroups}>
          <PreferenceGroup
            title="תחומי עניין"
            icon="interests"
            preferences={preferences.interests}
            styles={styles}
            testID="profile-preference-interests"
          />
          <PreferenceGroup
            title="סגנון"
            icon="favorite-border"
            preferences={preferences.vibes}
            styles={styles}
            testID="profile-preference-vibes"
          />
        </View>
      ) : (
        <View style={styles.preferenceEmpty}>
          <View style={styles.preferenceEmptyTextWrap}>
            <AppText style={styles.preferenceEmptyTitle}>עוד לא הגדרת את הטעם שלך בטיולים</AppText>
          </View>
          <Pressable
            onPress={onEdit}
            style={({ pressed }) => [
              styles.preferenceEmptyButton,
              pressed && styles.preferenceEmptyButtonPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="הגדרת העדפות הטיול"
          >
            <AppText style={styles.preferenceEmptyButtonText}>להגדרת העדפות</AppText>
            <MaterialIcons name="arrow-back" size={17} color={colors.white} />
          </Pressable>
        </View>
      )}
    </View>
  );
}
