import React from 'react';
import { Platform, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import AppText from './AppText';
import { colors } from '../styles/colors';
import { recommendationActionBarStyles as styles } from '../styles/recommendationActionBar';

export const RecommendationActionBar = ({
  isLiked = false,
  likeCount = 0,
  commentsCount = 0,
  onCommentPress,
  onLikePress,
  onLikesListPress,
  onSharePress,
  onReadMore,
  contentLabel = 'ההמלצה',
  style,
}) => {
  const normalizedLikeCount = Math.max(0, Number(likeCount) || 0);
  const normalizedCommentsCount = Math.max(0, Number(commentsCount) || 0);
  const likesListDisabled = normalizedLikeCount <= 0 || !onLikesListPress;
  const press = (callback) => (event) => {
    event?.stopPropagation?.();
    callback?.();
  };

  return (
    <View {...(Platform.OS === 'web' ? { dir: 'ltr' } : {})} style={[styles.bar, style]} testID="recommendation-action-bar">
      <View style={[styles.actions, onReadMore && styles.compactActions]} testID="recommendation-action-row">
        <View style={styles.group}>
          <TouchableOpacity
            style={styles.iconSlot}
            onPress={press(onLikePress)}
            accessibilityRole="button"
            accessibilityLabel={isLiked ? 'ביטול לייק' : 'הוספת לייק'}
            accessibilityState={{ selected: isLiked }}
            testID="recommendation-action-like"
          >
            <Ionicons name={isLiked ? 'heart' : 'heart-outline'} size={22} color={colors.primary} style={styles.icon} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.countSlot}
            onPress={press(onLikesListPress)}
            disabled={likesListDisabled}
            accessibilityRole="button"
            accessibilityLabel={`${normalizedLikeCount} לייקים, הצגת הרשימה`}
            accessibilityState={{ disabled: likesListDisabled }}
            testID="recommendation-action-likes"
          >
            <AppText style={styles.count} numberOfLines={1} adjustsFontSizeToFit>{normalizedLikeCount}</AppText>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.group}
          onPress={press(onCommentPress)}
          accessibilityRole="button"
          accessibilityLabel={`${normalizedCommentsCount} תגובות`}
          testID="recommendation-action-comments"
        >
          <View style={styles.iconSlot}>
            <Ionicons name="chatbubble-outline" size={22} color={colors.primary} style={styles.icon} />
          </View>
          <View style={styles.countSlot}>
            <AppText style={styles.count} numberOfLines={1} adjustsFontSizeToFit>{normalizedCommentsCount}</AppText>
          </View>
        </TouchableOpacity>

        {onSharePress ? (
          <TouchableOpacity
            style={styles.share}
            onPress={press(onSharePress)}
            accessibilityRole="button"
            accessibilityLabel={`שיתוף ${contentLabel}`}
            testID="recommendation-action-share"
          >
            <Ionicons name="share-social-outline" size={22} color={colors.primary} style={styles.icon} />
            <AppText style={styles.shareText}>שיתוף</AppText>
          </TouchableOpacity>
        ) : null}
        {onReadMore && <TouchableOpacity style={styles.readMore} onPress={press(onReadMore)} accessibilityRole="button"
          accessibilityLabel={`קריאת ${contentLabel} במלואה`} testID="community-card-read-more">
          <AppText style={styles.readMoreText}>קרא עוד ←</AppText>
        </TouchableOpacity>}
      </View>
      {!onReadMore && <View style={styles.divider} pointerEvents="none" testID="recommendation-action-divider" />}
    </View>
  );
};
