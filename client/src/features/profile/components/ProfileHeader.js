import React from 'react';
import { Platform, Pressable, View } from 'react-native';
import AppText from "../../../components/AppText";
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Path } from 'react-native-svg';

import CachedImage from '../../../components/CachedImage';
import { colors } from '../../../styles';
import { getMediaPlaceholder, getMediaVariantUrl } from '../../../utils/mediaAssets';
import ProfilePreferencesSignature from './ProfilePreferencesSignature';
import ProfileStatsCard from './ProfileStatsCard';
import { createProfileStyles } from './profileStyles';

function HeroImage({ media, styles }) {
  return (
    <CachedImage
      source={{ uri: media.url }}
      placeholder={getMediaPlaceholder(media.asset)}
      style={[styles.heroImage, Platform.OS === 'web' ? styles.heroImageWeb : null]}
      contentFit="cover"
      priority="high"
    />
  );
}
function HeroFallback({ styles, color, icon }) {
  return (
    <View style={styles.heroFallback}>
      <LinearGradient
        colors={[`${color}EE`, '#1E3A5F']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
      />
      <Svg viewBox="0 0 400 260" style={styles.heroFallbackMap}>
        <Path
          d="M-20 180C50 100 85 230 160 132S270 88 420 138M-40 230C48 168 95 265 190 188S310 150 450 204M60-20C125 64 142 12 208 82S295 150 380 42"
          fill="none"
          stroke="rgba(255,255,255,0.72)"
          strokeWidth="2.2"
          strokeDasharray="7 10"
        />
        <Circle cx="93" cy="112" r="6" fill="rgba(255,255,255,0.82)" />
        <Circle cx="282" cy="154" r="6" fill="rgba(255,255,255,0.82)" />
      </Svg>
      <View style={styles.heroFallbackIcon}>
        <MaterialIcons name={icon || 'explore'} size={38} color={colors.white} />
      </View>
    </View>
  );
}

function renderHeroMedia(media, styles, fallback) {
  if (!media.length) return <HeroFallback styles={styles} {...fallback} />;
  if (media.length === 1) return <HeroImage media={media[0]} styles={styles} />;
  if (media.length === 2) {
    return (
      <View style={styles.heroMediaRow}>
        <HeroImage media={media[0]} styles={styles} />
        <HeroImage media={media[1]} styles={styles} />
      </View>
    );
  }
  return (
    <View style={styles.heroMediaRow}>
      <View style={styles.heroMediaPrimary}>
        <HeroImage media={media[0]} styles={styles} />
      </View>
      <View style={styles.heroMediaColumn}>
        <HeroImage media={media[1]} styles={styles} />
        <HeroImage media={media[2]} styles={styles} />
      </View>
    </View>
  );
}

function StatusPill({ icon, label, color, styles, accessibilityLabel }) {
  return (
    <View
      style={[styles.statusPill, { backgroundColor: `${color}12`, borderColor: `${color}42` }]}
      accessibilityLabel={accessibilityLabel || label}
    >
      <MaterialIcons name={icon} size={16} color={color} />
      <AppText style={[styles.statusPillText, { color }]} numberOfLines={1}>{label}</AppText>
    </View>
  );
}

export default function ProfileHeader({
  userData,
  stats,
  statsLoading,
  heroMedia = [],
  isOwner,
  onPickImage,
  uploading,
  onEditBio,
  onEditSmartProfile,
  styles: providedStyles,
  width = 390,
}) {
  const styles = providedStyles || createProfileStyles({}, width);
  const wide = width >= 900;
  const initial = userData?.displayName?.charAt(0)?.toUpperCase() || 'T';
  const profileImageUrl = getMediaVariantUrl(
    userData?.photoMedia,
    'feed',
    userData?.photoURL
  );
  const bio = typeof userData?.bio === 'string' ? userData.bio.trim() : '';
  const standing = stats?.standing;
  const dominant = stats?.dominantCategory;
  const fallbackColor = dominant?.color || colors.primary;

  return (
    <View style={styles.heroHeader}>
      <View style={[styles.heroShell, wide && styles.heroShellWide]}>
        <View style={[styles.heroMedia, wide && styles.heroMediaWide]}>
          {renderHeroMedia(heroMedia, styles, {
            color: fallbackColor,
            icon: dominant?.icon || 'explore',
          })}
          {heroMedia.length ? <View style={styles.heroShade} pointerEvents="none" /> : null}
        </View>

        <View style={[styles.identityCard, wide && styles.identityCardWide]}>
          <View style={[styles.avatarWrap, wide && styles.avatarWrapWide]}>
            {profileImageUrl ? (
              <CachedImage
                source={{ uri: profileImageUrl }}
                placeholder={getMediaPlaceholder(userData?.photoMedia)}
                style={[styles.avatarImage, Platform.OS === 'web' ? styles.avatarImageWeb : null]}
                contentFit="cover"
                priority="high"
              />
            ) : (
              <View style={[styles.avatarImage, styles.avatarPlaceholder]}>
                <AppText style={styles.avatarInitial}>{initial}</AppText>
              </View>
            )}
            {isOwner && typeof onPickImage === 'function' ? (
              <Pressable
                onPress={onPickImage}
                style={styles.cameraButton}
                disabled={uploading}
                accessibilityRole="button"
                accessibilityLabel="החלפת תמונת פרופיל"
              >
                <MaterialIcons name="photo-camera" size={20} color={colors.white} />
              </Pressable>
            ) : null}
          </View>

          <AppText style={styles.name} numberOfLines={1}>{userData?.displayName || 'Traveler'}</AppText>

          {bio || isOwner ? (
            <View style={styles.bioRow}>
              {bio ? (
                <AppText style={styles.bio} numberOfLines={2}>{bio}</AppText>
              ) : (
                <AppText style={styles.bioPlaceholder} numberOfLines={2}>
                  הוסיפו משפט קטן שיספר לקהילה מי אתם בדרך
                </AppText>
              )}
              {isOwner && typeof onEditBio === 'function' ? (
                <Pressable
                  onPress={onEditBio}
                  style={styles.editIcon}
                  accessibilityRole="button"
                  accessibilityLabel="עריכת משפט הפרופיל"
                >
                  <MaterialIcons name="edit" size={17} color={colors.primary} />
                </Pressable>
              ) : null}
            </View>
          ) : null}

          <View style={styles.statusRow}>
            {!statsLoading && standing ? (
              <StatusPill
                icon={standing.icon}
                label={standing.label}
                color={standing.color}
                styles={styles}
                accessibilityLabel={`דרגת תרומה: ${standing.label}`}
              />
            ) : null}
            {!statsLoading && dominant ? (
              <StatusPill
                icon={dominant.icon}
                label={`הכי בבית ב${dominant.label}`}
                color={dominant.color}
                styles={styles}
                accessibilityLabel={`תחום מוביל: ${dominant.label}`}
              />
            ) : null}
            {userData?.isExpert ? (
              <StatusPill
                icon="verified"
                label="מומחה/ית PlanLi"
                color={colors.secondary}
                styles={styles}
              />
            ) : null}
          </View>

          <ProfileStatsCard stats={stats} loading={statsLoading} styles={styles} />
        </View>
      </View>

      <ProfilePreferencesSignature
        smartProfile={userData?.smartProfile}
        isOwner={isOwner}
        onEdit={onEditSmartProfile}
        styles={styles}
      />
    </View>
  );
}
