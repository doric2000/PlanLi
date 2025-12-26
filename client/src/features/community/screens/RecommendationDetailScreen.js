import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  Alert,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  onSnapshot, 
  serverTimestamp,
  getDoc,
  doc,
  updateDoc,
  arrayUnion,
  arrayRemove
} from 'firebase/firestore';
import { db, auth } from '../../../config/firebase';
import { useUserData } from '../../../hooks/useUserData';
import { useLikes } from '../../community/hooks/useLikes';
import { useCommentsCount } from '../../community/hooks/useCommentsCount';

import { Avatar } from '../../../components/Avatar';
import { BackButton } from '../../../components/BackButton';
import FavoriteButton from '../../../components/FavoriteButton';
import LikesModal from '../../../components/LikesModal';
import { CommentsSection } from '../../../components/CommentSection';
import { colors, typography, common, buttons, cards, tags as tagsStyle } from '../../../styles';
import { formatTimestamp } from '../../../utils/formatTimestamp';


// CommentItem is now handled by CommentsSection, which uses useUserData and Avatar internally.

/**
 * RecommendationDetailScreen - Full view of a recommendation
 * 
 * Shows all details of a recommendation including:
 * - Full image with gradient overlay
 * - Author info with avatar
 * - Title, description, category
 * - Location (clickable to navigate to city)
 * - Budget indicator
 * - Tags
 * - Like and comment interactions
 * 
 * @param {Object} route - Route object containing recommendation data
 * @param {Object} navigation - Navigation object
 */
export default function RecommendationDetailScreen({ route, navigation }) {
  const { item } = route.params;
  const author = useUserData(item.userId);
  const { isLiked, likeCount, likedByList, toggleLike } = useLikes(
    'recommendations',
    item.id,
    item.likes,
    item.likedBy
  );
  const commentsCount = useCommentsCount('recommendations', item.id);
  const user = auth.currentUser;
  const isOwner = user?.uid === item.userId;
  const [likesModalVisible, setLikesModalVisible] = useState(false);

  const formatDate = (timestamp) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString(undefined, { 
      year: 'numeric',
      month: 'long', 
      day: 'numeric' 
    });
  };

  const hasImage = item.images && item.images.length > 0;

  return (
    <SafeAreaView style={common.container} edges={['left', 'right', 'bottom']}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <FlatList
        data={[]}
        keyExtractor={() => 'empty'}
        ListHeaderComponent={
          <>
            {/* Hero Image Section */}
            {hasImage ? (
              <View style={common.heroContainer}>
                <Image 
                  source={{ uri: item.images[0] }} 
                  style={common.heroImage}
                  resizeMode="cover"
                />
                <LinearGradient
                  colors={['rgba(0,0,0,0.3)', 'transparent', 'transparent']}
                  style={common.heroGradient}
                >
                  <View style={common.rowBetween}>
                    <BackButton />
                    <FavoriteButton type="recommendations" id={item.id} variant="light" />
                  </View>
                </LinearGradient>
              </View>
            ) : (
              <View style={common.noImageHeader}>
                <View style={common.rowBetween}>
                  <BackButton color="dark" variant="solid" />
                  <FavoriteButton type="recommendations" id={item.id} variant="dark" />
                </View>
              </View>
            )}

            {/* Content Section */}
            <View style={common.detailContent}>
              {/* Category */}
              {item.category && (
                <Text style={[typography.caption, { color: colors.primary, marginBottom: 8 }]}> 
                  {item.category}
                </Text>
              )}

              {/* Title */}
              <Text style={typography.h2}>{item.title}</Text>

              {/* Author Card */}
              <View style={[cards.userContainer, { marginTop: 16, marginBottom: 16 }]}> 
                <Avatar photoURL={author.photoURL} displayName={author.displayName} size={48} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <View style={common.rowBetween}>
                    <Text style={typography.label}>{author.displayName}</Text>
                    {item.createdAt && (
                      <Text style={[typography.caption, { color: '#9CA3AF', fontSize: 11 }]}> {formatTimestamp(item.createdAt)} </Text>
                    )}
                  </View>
                </View>
                {!isOwner && (
                  <TouchableOpacity style={buttons.primarySmall}>
                    <Text style={buttons.primarySmallText}>Follow</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Location, Rating & Budget Row */}
              <View style={[common.row, { flexWrap: 'wrap', gap: 12, marginBottom: 16 }]}> 
                {(item.location || item.country) && (
                  <TouchableOpacity 
                    style={common.row}
                    onPress={() => {
                      if (item.cityId && item.countryId) {
                        navigation.navigate('LandingPage', {
                          cityId: item.cityId,
                          countryId: item.countryId
                        });
                      }
                    }}
                  >
                    <Ionicons name="location" size={16} color={colors.primary} />
                    <Text style={[typography.body, { color: colors.textSecondary, marginLeft: 4 }]}> 
                      {item.location}{item.country ? `, ${item.country}` : ''}
                    </Text>
                  </TouchableOpacity>
                )}
                
                {item.rating && (
                  <View style={common.ratingContainer}>
                    <Text style={common.ratingStar}>★</Text>
                    <Text style={common.ratingText}>{item.rating}</Text>
                  </View>
                )}

                {item.budget && (
                  <View style={[tagsStyle.chip, { backgroundColor: colors.secondaryLight, borderColor: colors.secondary }]}> 
                    <Text style={[tagsStyle.chipText, { color: colors.secondary }]}>{item.budget}</Text>
                  </View>
                )}
              </View>

              {/* Description */}
              <Text style={[typography.body, { lineHeight: 24, marginBottom: 20 }]}> 
                {item.description}
              </Text>

              {/* Tags */}
              {item.tags && item.tags.length > 0 && (
                <View style={{ marginBottom: 20 }}>
                  <View style={[common.row, { marginBottom: 12 }]}> 
                    <Ionicons name="pricetag-outline" size={16} color={colors.textMuted} />
                    <Text style={[typography.caption, { marginLeft: 6 }]}>Tags</Text>
                  </View>
                  <View style={[common.row, { flexWrap: 'wrap', gap: 8 }]}> 
                    {item.tags.map((tag, index) => (
                      <TouchableOpacity key={index} style={tagsStyle.chip}>
                        <Text style={tagsStyle.chipText}>{tag}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {/* Action Bar */}
              <View style={common.actionBar}>
                <TouchableOpacity style={common.actionBarItem} onPress={toggleLike}>
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
                  onPress={() => likeCount > 0 && setLikesModalVisible(true)}
                >
                  <Ionicons name="people-outline" size={24} color={colors.textSecondary} />
                  <Text style={common.actionBarText}>Likes</Text>
                </TouchableOpacity>

                <TouchableOpacity style={common.actionBarItem}>
                  <Ionicons name="share-social-outline" size={24} color={colors.textSecondary} />
                  <Text style={common.actionBarText}>Share</Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        }
        ListFooterComponent={
          <View style={{ paddingVertical: 20, paddingBottom: 100 }}>
            <CommentsSection collectionName="recommendations" postId={item.id} />
          </View>
        }
        showsVerticalScrollIndicator={false}
        bounces={false}
      />
      <LikesModal
        visible={likesModalVisible}
        onClose={() => setLikesModalVisible(false)}
        likedByUserIds={likedByList}
      />
    </SafeAreaView>
  );
}
