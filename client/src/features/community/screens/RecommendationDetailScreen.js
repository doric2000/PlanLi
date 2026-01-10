import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StatusBar,
  FlatList,
  StyleSheet,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { CommentsModal } from '../../../components/CommentsModal';
import { colors, typography, common, tags as tagsStyle } from '../../../styles';
import { getBudgetTheme } from '../../../utils/getBudgetTheme';

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

  const budgetTheme = getBudgetTheme(item?.budget);

  const insets = useSafeAreaInsets();
  
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
  const [commentsModalVisible, setCommentsModalVisible] = useState(false);

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
    <SafeAreaView style={common.container} edges={['left', 'right']}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <View style={{ flex: 1 }}>
        <FlatList
          data={[]}
          keyExtractor={() => 'empty'}
          contentContainerStyle={{ paddingBottom: 110 + (insets.bottom || 0) }}
          ListHeaderComponent={
            <>
              <RecommendationHero item={item} snapshotData={snapshotData} />

              {/* Content Section */}
              <View style={common.detailContent}>
              {(item.category || item.budget) && (
                <View style={styles.topPillsRow}>
                  {!!item.budget && (
                    <View
                      style={[
                        styles.pricePill,
                        {
                          backgroundColor: budgetTheme.backgroundColor,
                          borderColor: budgetTheme.borderColor,
                        },
                      ]}
                    >
                      <Text style={[styles.pricePillText, { color: budgetTheme.textColor }]}>
                        {item.budget}
                      </Text>
                    </View>
                  )}

                  {!!item.category && (
                    <View style={styles.categoryPill}>
                      <Text style={styles.categoryPillText}>{item.category}</Text>
                    </View>
                  )}
                </View>
              )}

              <Text style={[typography.h2, styles.titleRtl]}>{item.title}</Text>

              <View style={styles.sectionCard}>
                <AuthorInfo author={author} item={item} isOwner={isOwner} />
              </View>

              <View style={styles.sectionCard}>
                <View style={styles.sectionHeaderRow}>
                  <Ionicons name="location-outline" size={16} color={colors.textMuted} />
                  <Text style={styles.sectionHeaderText}>מיקום</Text>
                </View>
                <RecommendationMeta item={item} navigation={navigation} />
              </View>

              {!!item.description && (
                <View style={styles.sectionCard}>
                  <View style={styles.sectionHeaderRow}>
                    <Ionicons name="reader-outline" size={16} color={colors.textMuted} />
                    <Text style={styles.sectionHeaderText}>תיאור</Text>
                  </View>
                  <Text style={[typography.body, styles.bodyText]}>{item.description}</Text>
                </View>
              )}

              {/* Tags */}
              {item.tags && item.tags.length > 0 && (
                <View style={styles.sectionCard}>
                  <View style={styles.sectionHeaderRow}>
                    <Ionicons name="pricetag-outline" size={16} color={colors.textMuted} />
                    <Text style={styles.sectionHeaderText}>תגיות</Text>
                  </View>

                  <View style={styles.tagsWrap}>
                    {item.tags.map((tag, index) => (
                      <View key={`${tag}:${index}`} style={styles.tagPill}>
                        <Text style={styles.tagPillText}>{tag}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

            </View>
          </>
        }
        ListFooterComponent={
          <View style={{ height: 1 }} />
        }
        showsVerticalScrollIndicator={false}
        bounces={false}
        />

        {/* Sticky action bar */}
        <View
          style={[
            styles.stickyActionBar,
            { paddingBottom: (insets.bottom || 0) || 12 },
          ]}
        >
          <RecommendationActionBar
            isLiked={isLiked}
            likeCount={likeCount}
            commentsCount={commentsCount}
            onCommentPress={() => setCommentsModalVisible(true)}
            onLikePress={toggleLike}
            onLikesListPress={() => setLikesModalVisible(true)}
            onSharePress={() => alert('שיתוף עדיין לא זמין')}
            style={styles.stickyActionBarInner}
          />
        </View>
      </View>
      <LikesModal
        visible={likesModalVisible}
        onClose={() => setLikesModalVisible(false)}
        likedByUserIds={likedByList}
      />

      <CommentsModal
        visible={commentsModalVisible}
        onClose={() => setCommentsModalVisible(false)}
        postId={item.id}
        collectionName="recommendations"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  topPillsRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  categoryPill: {
    backgroundColor: '#EFF6FF',
    borderColor: '#DBEAFE',
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  categoryPillText: {
    color: '#2563EB',
    fontWeight: '800',
    fontSize: 12,
  },

  pricePill: {
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  pricePillText: {
    fontWeight: '800',
    fontSize: 12,
    textAlign: 'right',
  },

  titleRtl: {
    textAlign: 'right',
    alignSelf: 'stretch',
    writingDirection: 'rtl',
  },

  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E8EEF5',
    padding: 14,
    marginTop: 12,
  },
  sectionHeaderRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionHeaderText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
    marginRight: 8,
    textAlign: 'right',
  },

  bodyText: {
    lineHeight: 24,
    textAlign: 'right',
  },

  tagsWrap: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
  },
  tagPill: {
    backgroundColor: '#EFF6FF',
    borderColor: '#DBEAFE',
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 999,
    marginLeft: 8,
    marginBottom: 8,
  },
  tagPillText: {
    color: '#2563EB',
    fontWeight: '800',
    fontSize: 12,
    textAlign: 'right',
  },

  stickyActionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E8EEF5',
    paddingTop: 6,
    paddingHorizontal: 20,
  },
  stickyActionBarInner: {
    borderBottomWidth: 0,
  },
});
