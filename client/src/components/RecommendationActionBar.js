import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '../styles';

export const RecommendationActionBar = ({
  isLiked,
  likeCount,
  commentsCount,
  onCommentPress,
  onLikePress,
  onLikesListPress,
  onSharePress,
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
        <Text style={[styles.text, isLiked && styles.activeText]}>{likeCount}</Text>
      </TouchableOpacity>
    </View>

    <TouchableOpacity
      style={styles.action}
      onPress={onCommentPress}
      accessibilityRole="button"
      accessibilityLabel={`${commentsCount} תגובות`}
    >
      <Ionicons name="chatbubble-outline" size={24} color={colors.textSecondary} />
      <Text style={styles.text}>{commentsCount}</Text>
    </TouchableOpacity>

    <TouchableOpacity
      style={styles.action}
      onPress={onSharePress}
      accessibilityRole="button"
      accessibilityLabel="שיתוף ההמלצה"
    >
      <Ionicons name="share-social-outline" size={24} color={colors.textSecondary} />
      <Text style={styles.text}>שיתוף</Text>
    </TouchableOpacity>
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
    fontWeight: '600',
    writingDirection: 'rtl',
  },
  activeText: {
    color: colors.heart,
  },
});
