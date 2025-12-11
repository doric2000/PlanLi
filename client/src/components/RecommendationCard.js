import React, { useState } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useUserData } from '../hooks/useUserData';
import { useLikes } from '../hooks/useLikes';
import { useCommentsCount } from '../hooks/useCommentsCount';
import { Avatar } from './Avatar';
import LikesModal from './likesList';

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
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.authorInfo}>
          <Avatar photoURL={author.photoURL} displayName={author.displayName} />
          <View>
            <Text style={styles.username}>{author.displayName}</Text>
            {item.createdAt && (
              <Text style={styles.date}>{formatDate(item.createdAt)}</Text>
            )}
          </View>
        </View>
        <TouchableOpacity>
          <Ionicons name="ellipsis-horizontal" size={20} color="#9CA3AF" />
        </TouchableOpacity>
      </View>

      {/* Image */}
      {item.images && item.images.length > 0 && (
        <Image source={{ uri: item.images[0] }} style={styles.mainImage} resizeMode="cover" />
      )}

      {/* Content */}
      <View style={styles.content}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
          {item.category && (
            <View style={styles.categoryChip}>
              <Text style={styles.categoryText}>{item.category}</Text>
            </View>
          )}
        </View>

        {(item.location || item.country) && (
          <TouchableOpacity 
            style={styles.locationRow}
            onPress={() => {
              if (item.cityId && item.countryId) {
                navigation.navigate('TripDashboard', {
                  cityId: item.cityId,
                  countryId: item.countryId
                });
              }
            }}
          >
            <Ionicons name="location-outline" size={14} color="#2EC4B6" />
            <Text style={styles.locationText}>
              {item.location}{item.country ? `, ${item.country}` : ''}
            </Text>
          </TouchableOpacity>
        )}

        <Text style={styles.description} numberOfLines={3}>
          {item.description}
        </Text>
      </View>

      {/* Footer / Action Bar */}
      <View style={styles.footer}>
        <View style={styles.actionGroup}>
          <TouchableOpacity style={styles.actionButton} onPress={toggleLike}>
            <Ionicons
              name={isLiked ? "heart" : "heart-outline"}
              size={24}
              color={isLiked ? "#EF4444" : "#4B5563"}
            />
          </TouchableOpacity>
          
          <TouchableOpacity onPress={() => likeCount > 0 && setShowLikesModal(true)}>
            <Text style={[
              styles.likeCountText, 
              likeCount > 0 && styles.likeCountClickable
            ]}>
              {likeCount > 0 ? `${likeCount} likes` : ''}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={handleCommentPress}>
            <Ionicons name="chatbubble-outline" size={22} color="#4B5563" />
            <Text style={styles.actionText}>
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

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
  },
  authorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
  },
  avatarPlaceholder: {
    backgroundColor: '#E0E7FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    color: '#4F46E5',
    fontWeight: 'bold',
    fontSize: 14,
  },
  username: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F2937',
  },
  date: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  mainImage: {
    width: '100%',
    height: 220,
    backgroundColor: '#F3F4F6',
  },
  content: {
    padding: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    flex: 1,
    marginRight: 8,
    textAlign: 'left',
  },
  categoryChip: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  categoryText: {
    color: '#2563EB',
    fontSize: 10,
    fontWeight: '600',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  locationText: {
    fontSize: 13,
    color: '#2EC4B6',
    marginLeft: 4,
    fontWeight: '500',
  },
  description: {
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 20,
    textAlign: 'left',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#F9FAFB',
  },
  actionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionText: {
    fontSize: 14,
    color: '#4B5563',
    fontWeight: '500',
  },
  likeCountText: {
    fontSize: 14,
    color: '#4B5563',
    fontWeight: '500',
  },
  likeCountClickable: {
    color: '#1F2937',
    fontWeight: '600',
  },
  activeActionText: {
    color: '#EF4444',
  },
});

export default RecommendationCard;