import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import AppText from "./AppText";
import { Ionicons } from '@expo/vector-icons';

import { fontFamilies } from "../styles/typography";
import { colors } from '../styles';
import ReportButton from '../features/moderation/components/ReportButton';

export const RecommendationActionBar = ({
  isLiked = false,
  likeCount = 0,
  commentsCount = 0,
  onCommentPress,
  onLikePress,
  onLikesListPress,
  onSharePress,
  contentLabel = 'ההמלצה',
  reportTarget,
  ownerId,
  style,
}) => {
  const normalizedLikeCount = Math.max(0, Number(likeCount) || 0);
  const normalizedCommentsCount = Math.max(0, Number(commentsCount) || 0);
  const likesListDisabled = normalizedLikeCount <= 0 || !onLikesListPress;

  return (
    <View style={[styles.bar, style]} testID="recommendation-action-bar">
    <View style={styles.likeGroup}>
      <TouchableOpacity
        style={styles.iconButton}
        onPress={onLikePress}
        accessibilityRole="button"
        accessibilityLabel={isLiked ? 'ביטול לייק' : 'הוספת לייק'}
        accessibilityState={{ selected: isLiked }}
        testID="recommendation-action-like"
      >
        <Ionicons
          name={isLiked ? 'heart' : 'heart-outline'}
          size={24}
          color={colors.primary}
        />
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.countButton}
        onPress={onLikesListPress}
        disabled={likesListDisabled}
        accessibilityRole="button"
        accessibilityLabel={`${normalizedLikeCount} לייקים, הצגת הרשימה`}
        accessibilityState={{ disabled: likesListDisabled }}
        testID="recommendation-action-likes"
      >
        <AppText style={[styles.text, isLiked && styles.activeText]}>{normalizedLikeCount}</AppText>
      </TouchableOpacity>
    </View>

    <TouchableOpacity
      style={styles.actionButton}
      onPress={onCommentPress}
      accessibilityRole="button"
      accessibilityLabel={`${normalizedCommentsCount} תגובות`}
      testID="recommendation-action-comments"
    >
      <Ionicons name="chatbubble-outline" size={24} color={colors.primary} />
      <AppText style={styles.text}>{normalizedCommentsCount}</AppText>
    </TouchableOpacity>

    {onSharePress ? (
      <TouchableOpacity
        style={styles.actionButton}
        onPress={onSharePress}
        accessibilityRole="button"
        accessibilityLabel={`שיתוף ${contentLabel}`}
        testID="recommendation-action-share"
      >
        <Ionicons name="share-social-outline" size={24} color={colors.primary} />
        <AppText style={styles.text}>שיתוף</AppText>
      </TouchableOpacity>
    ) : null}

    <ReportButton
      target={reportTarget}
      ownerId={ownerId}
      compact
      color={colors.primary}
      subjectLabel={contentLabel}
    />
    </View>
  );
};

const styles = StyleSheet.create({
  bar: {
    height: 52,
    minHeight: 52,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  actionButton: {
    minWidth: 44,
    minHeight: 44,
    paddingHorizontal: 6,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  likeGroup: {
    minHeight: 44,
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
    minWidth: 44,
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
    color: colors.primary,
  },
});
