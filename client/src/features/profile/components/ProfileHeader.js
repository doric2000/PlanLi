import React, { useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, common, typography, buttons } from '../../../styles';
import ProfileBadge from './ProfileBadge';
import { TRAVEL_STYLES, TRIP_TYPES } from '../constants/smartProfileOptions';

const styles = StyleSheet.create({
  badgeRow: {
    flexDirection: 'row',
    marginTop: 10,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  smartProfileCta: {
    marginTop: 10,
  },
  smartProfileCtaText: {
    color: colors.accent,
    fontWeight: '600',
  },
});

const labelFromOptions = (options, value) =>
  options?.find((o) => o.value === value)?.label || value;

export default function ProfileHeader({
  userData,
  stats,
  smartBadges,
  onPickImage,
  uploading,
  onEditSmartProfile,
}) {
  const initial = userData?.displayName?.charAt(0)?.toUpperCase() || 'T';

  const smartProfile = userData?.smartProfile || null;

  // support multiple possible field names (because data might be saved differently)
  const travelStyleValue =
    smartProfile?.travelStyle ??
    smartProfile?.budget ??
    smartProfile?.budgetTag ??
    smartProfile?.travelStyleTag ??
    null;

  const tripTypeValue =
    smartProfile?.tripType ??
    smartProfile?.travelerType ??
    smartProfile?.tripGroup ??
    smartProfile?.groupType ??
    null;

  const travelStyleLabel = useMemo(() => {
    if (!travelStyleValue) return null;
    // if value is already a human label (Hebrew), just show it
    const fromOptions = labelFromOptions(TRAVEL_STYLES, travelStyleValue);
    return fromOptions || String(travelStyleValue);
  }, [travelStyleValue]);

  const tripTypeLabel = useMemo(() => {
    if (!tripTypeValue) return null;
    const fromOptions = labelFromOptions(TRIP_TYPES, tripTypeValue);
    return fromOptions || String(tripTypeValue);
  }, [tripTypeValue]);


  const hasSmartProfileMain = Boolean(travelStyleLabel || tripTypeLabel);

  return (
    <View style={common.profileHeader}>
      <View style={common.profileAvatarContainer}>
        {userData?.photoURL ? (
          <Image source={{ uri: userData.photoURL }} style={common.profileAvatar} />
        ) : (
          <View style={[common.profileAvatar, common.profileAvatarPlaceholder]}>
            <Text style={common.profileAvatarText}>{initial}</Text>
          </View>
        )}

        <TouchableOpacity
          onPress={onPickImage}
          style={buttons.editAvatarBadge}
          disabled={uploading}
          activeOpacity={0.85}
        >
          {uploading ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Ionicons name="camera" size={14} color={colors.white} />
          )}
        </TouchableOpacity>
      </View>

      <Text style={typography.profileName}>{userData?.displayName}</Text>
      <Text style={typography.profileEmail}>{userData?.email}</Text>

      {/* Level + Verified */}
      <View style={styles.badgeRow}>
        <ProfileBadge text={stats?.credibilityLabel || 'Level 1 Traveler'} variant="muted" />
        {userData?.isExpert ? <ProfileBadge text="Verified" variant="verified" /> : null}
      </View>

      {/* ✅ Smart Profile main fields: Budget + Traveler type */}
      {hasSmartProfileMain ? (
        <View style={styles.badgeRow}>
          {travelStyleLabel ? <ProfileBadge text={travelStyleLabel} variant="muted" /> : null}
          {tripTypeLabel ? <ProfileBadge text={tripTypeLabel} variant="muted" /> : null}
        </View>
      ) : (
        <TouchableOpacity
          onPress={onEditSmartProfile}
          style={styles.smartProfileCta}
          activeOpacity={0.85}
        >
          <Text style={styles.smartProfileCtaText}>Set your Smart Profile →</Text>
        </TouchableOpacity>
      )}

      {/* Existing smart badges row (interests/constraints badges etc.) */}
      {smartBadges?.length ? (
        <View style={styles.badgeRow}>
          {smartBadges.map((badge, idx) => (
            <ProfileBadge key={`${badge}-${idx}`} text={badge} />
          ))}
        </View>
      ) : null}
    </View>
  );
}
