import React, { useState } from 'react';
import { View, Text, Image, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useUserData } from '../../auth/hooks/useUserData';
import { useLikes } from '../hooks/useLikes';
import { useCommentsCount } from '../hooks/useCommentsCount';
import { Avatar } from '../../../components/Avatar';
import LikesModal from './likesList';
import { cards, colors } from '../../../styles';

/**
 * Card component for displaying a recommendation item.
 * Includes user info, image, title, description, like and comment interactions.
 *
 * @param {Object} props
 * @param {Object} props.item - Recommendation data.
 * @param {Function} props.onCommentPress - Callback when comment button is pressed.
 */
const RecommendationCard = ({ item, onCommentPress }) => {
  const navigation = useNavigation();
  const [showLikesModal, setShowLikesModal] = useState(false);
  
  // Use custom hooks
  const author = useUserData(item.userId);
  const { isLiked, likeCount, likedByList, toggleLike } = useLikes(
    'recommendations', 
    item.id, 
    item.likes, 
    item.likedBy
  );
  const commentsCount = useCommentsCount('recommendations', item.id);

  const handleCommentPress = () => {
    if (onCommentPress) {
      onCommentPress(item.id);
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  return (
    <View style={cards.recommendation}>
      {/* Header */}
      <View style={cards.recHeader}>
        <View style={cards.recAuthorInfo}>
          <Avatar photoURL={author.photoURL} displayName={author.displayName} />
          <View>
            <Text style={cards.recUsername}>{author.displayName}</Text>
            {item.createdAt && (
              <Text style={cards.recDate}>{formatDate(item.createdAt)}</Text>
            )}
          </View>
        </View>
        <TouchableOpacity>
          <Ionicons name="ellipsis-horizontal" size={20} color="#9CA3AF" />
        </TouchableOpacity>
      </View>

      {/* Image */}
      {item.images && item.images.length > 0 && (
        <Image source={{ uri: item.images[0] }} style={cards.recImage} resizeMode="cover" />
      )}

      {/* Content */}
      <View style={cards.recContent}>
        <View style={cards.recTitleRow}>
          <Text style={cards.recTitle} numberOfLines={1}>{item.title}</Text>
          {item.category && (
            <View style={cards.recCategoryChip}>
              <Text style={cards.recCategoryText}>{item.category}</Text>
            </View>
          )}
        </View>

        {(item.location || item.country) && (
          <TouchableOpacity 
            style={cards.recLocationRow}
            onPress={() => {
              if (item.cityId && item.countryId) {
                navigation.navigate('LandingPage', {
                  cityId: item.cityId,
                  countryId: item.countryId
                });
              }
            }}
          >
            <Ionicons name="location-outline" size={14} color="#2EC4B6" />
            <Text style={cards.recLocationText}>
              {item.location}{item.country ? `, ${item.country}` : ''}
            </Text>
          </TouchableOpacity>
        )}

        <Text style={cards.recDescription} numberOfLines={3}>
          {item.description}
        </Text>
      </View>

      {/* Footer / Action Bar */}
      <View style={cards.recFooter}>
        <View style={cards.recActionGroup}>
          <TouchableOpacity style={cards.recActionButton} onPress={toggleLike}>
            <Ionicons
              name={isLiked ? "heart" : "heart-outline"}
              size={24}
              color={isLiked ? colors.heart : colors.textSecondary}
            />
          </TouchableOpacity>
          
          <TouchableOpacity onPress={() => likeCount > 0 && setShowLikesModal(true)}>
            <Text style={[
              cards.recLikeCount, 
              likeCount > 0 && cards.recLikeCountClickable
            ]}>
              {likeCount > 0 ? `${likeCount} likes` : ''}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={cards.recActionButton} onPress={handleCommentPress}>
            <Ionicons name="chatbubble-outline" size={22} color="#4B5563" />
            <Text style={cards.recActionText}>
              Comment {commentsCount > 0 && `(${commentsCount})`}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity>
          <Ionicons name="share-social-outline" size={22} color="#4B5563" />
        </TouchableOpacity>
      </View>

      <LikesModal
        visible={showLikesModal}
        onClose={() => setShowLikesModal(false)}
        likedByUserIds={likedByList}
      />
    </View>
  );
};

export default RecommendationCard;