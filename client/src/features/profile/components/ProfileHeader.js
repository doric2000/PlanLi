import React from 'react';
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

export default function ProfileHeader({
  userData,
  stats,
  smartBadges,
  onPickImage,
  uploading,
  onEditSmartProfile,
}) {
  const initial = userData?.displayName?.charAt(0)?.toUpperCase() || 'T';

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

      <View style={styles.badgeRow}>
        <ProfileBadge text={stats?.credibilityLabel || 'Level 1 Traveler'} variant="muted" />
        {userData?.isExpert ? <ProfileBadge text="Verified" variant="verified" /> : null}
      </View>

      {smartBadges?.length ? (
        <View style={styles.badgeRow}>
          {smartBadges.map((badge, idx) => (
            <ProfileBadge key={`${badge}-${idx}`} text={badge} />
          ))}
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
    </View>
  );
}
