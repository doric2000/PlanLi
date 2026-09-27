import React from 'react';
import { TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import AppText from './AppText';
import CachedImage from './CachedImage';
import { colors, routeMapStyles as styles } from '../styles';

export default function MapStopDetails({
  title, number, dayLabel, imageUrl, address, meta, description, onClose,
  actionLabel, actionIcon = 'list-outline', onAction, style,
}) {
  return (
    <View style={[styles.sheet, style]} testID="map-stop-details">
      <View style={styles.sheetHeader}>
        <TouchableOpacity onPress={onClose} style={styles.sheetCloseButton} accessibilityRole="button" accessibilityLabel="סגירת פרטי העצירה">
          <Ionicons name="close" size={18} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.sheetTitleWrap}>
          <AppText style={styles.sheetKicker}>{[dayLabel, `עצירה ${number}`].filter(Boolean).join(' · ')}</AppText>
          <AppText style={styles.sheetTitle} numberOfLines={2}>{title}</AppText>
        </View>
        {imageUrl ? <CachedImage source={{ uri: imageUrl }} style={styles.sheetImage} contentFit="cover" priority="high" />
          : <View style={styles.sheetImageFallback}><AppText style={styles.sheetImageFallbackText}>{number}</AppText></View>}
      </View>
      {!!meta && <AppText style={styles.sheetMeta}>{meta}</AppText>}
      {!!address && <AppText style={styles.sheetAddress} numberOfLines={2}>{address}</AppText>}
      {!!description && <AppText style={styles.sheetDescription} numberOfLines={3}>{description}</AppText>}
      <TouchableOpacity style={styles.primaryButton} onPress={onAction} accessibilityRole="button" accessibilityLabel={actionLabel}>
        <Ionicons name={actionIcon} size={18} color={colors.white} />
        <AppText style={styles.primaryButtonText}>{actionLabel}</AppText>
      </TouchableOpacity>
    </View>
  );
}
