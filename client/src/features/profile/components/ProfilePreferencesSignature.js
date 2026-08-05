import React, { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import { colors } from '../../../styles';
import { getPreferencePresentation } from '../../../constants/travelPresentation';

function PreferenceStamp({ preference, featured, styles }) {
  if (featured) {
    return (
      <View
        style={[
          styles.featuredStamp,
          {
            backgroundColor: `${preference.color}12`,
            borderColor: `${preference.color}55`,
          },
        ]}
      >
        <View style={[styles.featuredIcon, { backgroundColor: `${preference.color}25` }]}>
          <MaterialIcons name={preference.icon} size={22} color={preference.color} />
        </View>
        <Text style={styles.featuredLabel} numberOfLines={2}>{preference.label}</Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.compactStamp,
        {
          backgroundColor: `${preference.color}0D`,
          borderColor: `${preference.color}40`,
        },
      ]}
    >
      <MaterialIcons name={preference.icon} size={15} color={preference.color} />
      <Text style={styles.compactLabel} numberOfLines={1}>{preference.label}</Text>
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

  const allPreferences = [...preferences.interests, ...preferences.vibes];
  const featuredPreferences = (preferences.interests.length
    ? preferences.interests
    : preferences.vibes).slice(0, 3);

  if (!allPreferences.length && !isOwner) return null;

  return (
    <View style={styles.preferencesSection}>
      <View style={styles.preferencesTitleRow}>
        <Text style={styles.preferencesTitle}>הטעם שלי בטיולים</Text>
        {isOwner && typeof onEdit === 'function' ? (
          <Pressable
            onPress={onEdit}
            style={styles.preferencesEdit}
            accessibilityRole="button"
            accessibilityLabel="עריכת העדפות הטיול"
          >
            <MaterialIcons name="edit" size={18} color={colors.primary} />
          </Pressable>
        ) : null}
      </View>

      {allPreferences.length ? (
        <>
          <View style={styles.featuredRow}>
            {featuredPreferences.map((preference) => (
              <PreferenceStamp
                key={`featured-${preference.kind}-${preference.id}`}
                preference={preference}
                featured
                styles={styles}
              />
            ))}
          </View>
          {allPreferences.length > featuredPreferences.length ? (
            <View style={styles.compactWrap}>
              {allPreferences.filter((preference) => (
                !featuredPreferences.some((featured) => (
                  featured.kind === preference.kind && featured.id === preference.id
                ))
              )).map((preference) => (
                <PreferenceStamp
                  key={`compact-${preference.kind}-${preference.id}`}
                  preference={preference}
                  styles={styles}
                />
              ))}
            </View>
          ) : null}
        </>
      ) : (
        <View style={styles.preferenceEmpty}>
          <MaterialIcons name="auto-awesome" size={24} color={colors.secondary} />
          <Text style={styles.preferenceEmptyTitle}>הפרופיל שלך עדיין מחכה לחותמת האישית שלך</Text>
          <Text style={styles.preferenceEmptyText}>
            בחרו כמה תחומי עניין ואווירה, ונעזור להציג את הסגנון שלכם בצורה שמרגישה כמו טיול.
          </Text>
          <Pressable
            onPress={onEdit}
            style={styles.preferenceEmptyButton}
            accessibilityRole="button"
            accessibilityLabel="הגדרת העדפות הטיול"
          >
            <MaterialIcons name="tune" size={17} color={colors.white} />
            <Text style={styles.preferenceEmptyButtonText}>להגדרת העדפות</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
