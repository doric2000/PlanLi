import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { common, colors } from '../styles';

export const RecommendationActionBar = ({ isLiked, likeCount, commentsCount, onLikePress, onLikesListPress, onSharePress }) => {
  return (
    <View style={common.actionBar}>
      <TouchableOpacity style={common.actionBarItem} onPress={onLikePress}>
        <Ionicons
          name={isLiked ? "heart" : "heart-outline"}
          size={24}
          color={isLiked ? colors.heart : colors.textSecondary}
        />
        <Text style={[common.actionBarText, isLiked && { color: colors.heart }]}> 
          {likeCount}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={common.actionBarItem}>
        <Ionicons name="chatbubble-outline" size={24} color={colors.textSecondary} />
        <Text style={common.actionBarText}>{commentsCount.length}</Text>
      </TouchableOpacity>

      <TouchableOpacity 
        style={common.actionBarItem}
        onPress={() => likeCount > 0 && onLikesListPress()}
      >
        <Ionicons name="people-outline" size={24} color={colors.textSecondary} />
        <Text style={common.actionBarText}>Likes</Text>
      </TouchableOpacity>

      <TouchableOpacity style={common.actionBarItem} onPress={onSharePress}>
        <Ionicons name="share-social-outline" size={24} color={colors.textSecondary} />
        <Text style={common.actionBarText}>Share</Text>
      </TouchableOpacity>
    </View>
  );
};
