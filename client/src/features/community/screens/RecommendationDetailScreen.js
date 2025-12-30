import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StatusBar,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { auth } from '../../../config/firebase';
import { useUserData } from '../../../hooks/useUserData';
import { useLikes } from '../../community/hooks/useLikes';
import { useCommentsCount } from '../../community/hooks/useCommentsCount';

// New Modular Components
import { RecommendationHero } from '../../../components/RecommendationHero';
import { AuthorInfo } from '../../../components/AuthorInfo';
import { RecommendationMeta } from '../../../components/RecommendationMeta';
import { RecommendationActionBar } from '../../../components/RecommendationActionBar';

// Existing Components
import LikesModal from '../../../components/LikesModal';
import { CommentsSection } from '../../../components/CommentSection';
import { colors, typography, common, tags as tagsStyle } from '../../../styles';

/**
 * RecommendationDetailScreen - Full view of a recommendation
 * 
 * Shows all details of a recommendation by composing modular components.
 * It's responsible for fetching data and passing it down to the child components.
 * 
 * @param {Object} route - Route object containing recommendation data
 * @param {Object} navigation - Navigation object
 */
export default function RecommendationDetailScreen({ route, navigation }) {
  const { item } = route.params;
  
  // --- Hooks ---
  const author = useUserData(item.userId);
  const { isLiked, likeCount, likedByList, toggleLike } = useLikes(
    'recommendations',
    item.id,
    item.likes,
    item.likedBy
  );
  const commentsCount = useCommentsCount('recommendations', item.id);
  const user = auth.currentUser;
  
  // --- State ---
  const [likesModalVisible, setLikesModalVisible] = useState(false);

  // --- Computed Values ---
  const isOwner = user?.uid === item.userId;
  const snapshotData = {
    name: item.title,
    thumbnail_url: item.images && item.images.length > 0 ? item.images[0] : null,
    sub_text: item.description ? item.description.substring(0, 100) + (item.description.length > 100 ? '...' : '') : '',
    rating: item.rating
  };

  // --- Render ---
  return (
    <SafeAreaView style={common.container} edges={['left', 'right', 'bottom']}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <FlatList
        data={[]}
        keyExtractor={() => 'empty'}
        ListHeaderComponent={
          <>
            <RecommendationHero item={item} snapshotData={snapshotData} />

            {/* Content Section */}
            <View style={common.detailContent}>
              {item.category && (
                <Text style={[typography.caption, { color: colors.primary, marginBottom: 8 }]}> 
                  {item.category}
                </Text>
              )}

              <Text style={typography.h2}>{item.title}</Text>

              <AuthorInfo author={author} item={item} isOwner={isOwner} />

              <RecommendationMeta item={item} navigation={navigation} />

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

              <RecommendationActionBar
                isLiked={isLiked}
                likeCount={likeCount}
                commentsCount={commentsCount}
                onLikePress={toggleLike}
                onLikesListPress={() => setLikesModalVisible(true)}
                onSharePress={() => alert('Share functionality to be implemented')}
              />
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
