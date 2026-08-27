import { fontFamilies } from "../styles/typography";
import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import AppText from "./AppText";
import { MaterialIcons } from '@expo/vector-icons';

import CachedImage from './CachedImage';
import { colors } from '../styles';

export function getContentGridColumns(width) {
  if (width >= 900) return 5;
  if (width >= 600) return 4;
  return 3;
}

export default function ContentTile({ image, title, subtitle, icon = 'photo-library', fallbackColor = colors.brand, onPress, style, disabled = false }) {
  const [revealed, setRevealed] = useState(false);
  const showOverlay = Platform.OS === 'web' && revealed;
  return (
    <Pressable
      style={[styles.tile, style]}
      onPress={onPress}
      disabled={disabled || typeof onPress !== 'function'}
      onHoverIn={() => setRevealed(true)}
      onHoverOut={() => setRevealed(false)}
      onFocus={() => setRevealed(true)}
      onBlur={() => setRevealed(false)}
      accessibilityRole={disabled || typeof onPress !== 'function' ? 'image' : 'button'}
      accessibilityLabel={`${title || 'תוכן'}${subtitle ? `, ${subtitle}` : ''}`}
    >
      {image ? (
        <CachedImage source={{ uri: image }} style={styles.image} contentFit="cover" priority="low" />
      ) : (
        <View style={[styles.fallback, { backgroundColor: fallbackColor }]}>
          <MaterialIcons name={icon} size={32} color={colors.white} />
        </View>
      )}
      <View pointerEvents="none" style={styles.shade} />
      <View pointerEvents="none" style={styles.badge}>
        <MaterialIcons name={icon} size={15} color={colors.white} />
      </View>
      {showOverlay ? (
        <View pointerEvents="none" style={styles.overlay}>
          <AppText style={styles.overlayTitle} numberOfLines={1}>{title}</AppText>
          {subtitle ? <AppText style={styles.overlaySubtitle} numberOfLines={1}>{subtitle}</AppText> : null}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: { aspectRatio: 1, overflow: 'hidden', position: 'relative', backgroundColor: colors.brand },
  image: { width: '100%', height: '100%' },
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  shade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '42%', backgroundColor: 'rgba(15,23,42,0.18)' },
  badge: {
    position: 'absolute', top: 7, right: 7, width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15,23,42,0.62)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.45)',
  },
  overlay: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 9, paddingVertical: 8, backgroundColor: 'rgba(15,23,42,0.76)' },
  overlayTitle: { color: colors.white, fontSize: 13, fontFamily: fontFamilies.semiBold, textAlign: 'right', writingDirection: 'rtl' },
  overlaySubtitle: { marginTop: 2, color: 'rgba(255,255,255,0.78)', fontSize: 11, textAlign: 'right', writingDirection: 'rtl' },
});
