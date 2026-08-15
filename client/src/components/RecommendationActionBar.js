import { fontFamilies } from "../styles/typography";
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import AppText from "./AppText";
import { Ionicons } from '@expo/vector-icons';

import { colors } from '../styles';
import ReportButton from '../features/moderation/components/ReportButton';

export const RecommendationActionBar = ({
  isLiked,
  likeCount,
  commentsCount,
  onCommentPress,
  onLikePress,
  onLikesListPress,
  onSharePress,
  contentLabel = 'ההמלצה',
  reportTarget,
  ownerId,
  style,
}) => (
  <View style={[styles.bar, style]}>
    <View style={styles.likeGroup}>
      <TouchableOpacity
        style={styles.iconButton}
        onPress={onLikePress}
        accessibilityRole="button"
        accessibilityLabel={isLiked ? 'ביטול לייק' : 'הוספת לייק'}
        accessibilityState={{ selected: isLiked }}
      >
        <Ionicons
          name={isLiked ? 'heart' : 'heart-outline'}
          size={24}
          color={isLiked ? colors.heart : colors.textSecondary}
        />
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.countButton}
        onPress={() => likeCount > 0 && onLikesListPress?.()}
        disabled={likeCount <= 0}
        accessibilityRole="button"
        accessibilityLabel={`${likeCount} לייקים, הצגת הרשימה`}
      >
        <AppText style={[styles.text, isLiked && styles.activeText]}>{likeCount}</AppText>
      </TouchableOpacity>
    </View>

    <TouchableOpacity
      style={styles.action}
      onPress={onCommentPress}
      accessibilityRole="button"
      accessibilityLabel={`${commentsCount} תגובות`}
    >
      <Ionicons name="chatbubble-outline" size={24} color={colors.textSecondary} />
      <AppText style={styles.text}>{commentsCount}</AppText>
    </TouchableOpacity>

    <TouchableOpacity
      style={styles.action}
      onPress={onSharePress}
      accessibilityRole="button"
      accessibilityLabel={`שיתוף ${contentLabel}`}
    >
      <Ionicons name="share-social-outline" size={24} color={colors.textSecondary} />
      <AppText style={styles.text}>שיתוף</AppText>
    </TouchableOpacity>

    <ReportButton target={reportTarget} ownerId={ownerId} />
  </View>
);

const styles = StyleSheet.create({
  bar: {
    minHeight: 64,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  action: {
    minWidth: 72,
    minHeight: 48,
    paddingHorizontal: 10,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  likeGroup: {
    minWidth: 72,
    minHeight: 48,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countButton: {
    minWidth: 32,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: colors.textSecondary,
    fontSize: 13,
    fontFamily: fontFamilies.semiBold,
    writingDirection: 'rtl',
  },
  activeText: {
    color: colors.heart,
  },
});
