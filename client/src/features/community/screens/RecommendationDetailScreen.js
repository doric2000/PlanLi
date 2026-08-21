import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Share, StatusBar, View } from 'react-native';
import AppText from "../../../components/AppText";
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { CommentsModal } from '../../../components/CommentsModal';
import LikesModal from '../../../components/LikesModal';
import MediaGalleryModal from '../../../components/MediaGalleryModal';
import { RecommendationActionBar } from '../../../components/RecommendationActionBar';
import { RecommendationHero } from '../../../components/RecommendationHero';
import { auth } from '../../../config/firebase';
import { useAdminClaim } from '../../../hooks/useAdminClaim';
import { useAuthUser } from '../../../hooks/useAuthUser';
import { useRecommendationById } from '../../../hooks/useRecommendationById';
import { useUserData } from '../../../hooks/useUserData';
import { recordRecommendationOpen } from '../../../services/PersonalizationService';
import { colors } from '../../../styles';
import { canManageRecommendation } from '../../../utils/contentPermissions';
import { findMediaAssetByUrl, getRecommendationImageUrls } from '../../../utils/mediaAssets';
import RecommendationDetailContent from '../components/RecommendationDetailContent';
import { recommendationDetailStyles as styles } from '../components/recommendationDetailStyles';
import { useCommentsCount } from '../hooks/useCommentsCount';
import { useLikes } from '../hooks/useLikes';

export default function RecommendationDetailScreen({ route, navigation }) {
  const initialItem = route?.params?.item || route?.params?.recommendation || null;
  const postId = route?.params?.postId || initialItem?.postId || initialItem?.id || '';
  const initialCommentsOpen = route?.params?.openComments === true;
  const initialCommentId = route?.params?.commentId || null;
  const { data: canonicalItem, loading, refresh } = useRecommendationById(postId);
  const item = useMemo(() => canonicalItem || initialItem, [canonicalItem, initialItem]);
  const hasFocusedOnce = useRef(false);

  useFocusEffect(useCallback(() => {
    if (hasFocusedOnce.current) refresh();
    else hasFocusedOnce.current = true;
  }, [refresh]));

  if (!item) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'left', 'right', 'bottom']}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.loading}>
          {loading ? <ActivityIndicator size="large" color={colors.primary} /> : null}
          <AppText style={styles.loadingText}>
            {loading ? 'טוענים את ההמלצה…' : 'לא הצלחנו לטעון את ההמלצה.'}
          </AppText>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <RecommendationDetailLoaded
      item={item}
      postId={postId || item.id}
      navigation={navigation}
      initialCommentsOpen={initialCommentsOpen}
      initialCommentId={initialCommentId}
    />
  );
}

function RecommendationDetailLoaded({ item, postId, navigation, initialCommentsOpen, initialCommentId }) {
  const insets = useSafeAreaInsets();
  const author = useUserData(item.ownerId);
  const { isAdmin } = useAdminClaim();
  const { isActive } = useAuthUser();
  const { isLiked, likeCount, toggleLike } = useLikes(
    'recommendations',
    postId,
    item.stats?.likeCount || 0
  );
  const commentsCount = useCommentsCount('recommendations', postId);
  const [likesModalVisible, setLikesModalVisible] = useState(false);
  const [commentsModalVisible, setCommentsModalVisible] = useState(initialCommentsOpen);
  const [gallery, setGallery] = useState({ visible: false, index: 0 });
  const canEdit = isActive && canManageRecommendation({
    user: auth.currentUser,
    ownerId: item.ownerId,
    isAdmin,
  });
  const hasImage = getRecommendationImageUrls(item, 'large').length > 0;
  const galleryItems = useMemo(() => getRecommendationImageUrls(item, 'large').map((url, index) => ({
    id: `${postId}:gallery:${index}`,
    url,
    media: findMediaAssetByUrl(item.media, url),
    caption: item.title,
  })), [item, postId]);

  useEffect(() => {
    if (!isActive || !postId) return;
    recordRecommendationOpen(postId).catch(() => {});
  }, [isActive, postId]);

  useEffect(() => {
    if (initialCommentsOpen) setCommentsModalVisible(true);
  }, [initialCommentsOpen, initialCommentId]);

  const snapshotData = useMemo(() => ({
    name: item.title,
    thumbnail_url: getRecommendationImageUrls(item, 'thumb')[0] || null,
    sub_text: item.description
      ? `${item.description.slice(0, 100)}${item.description.length > 100 ? '…' : ''}`
      : '',
  }), [item]);

  const handleEdit = () => {
    navigation.navigate('AddRecommendation', {
      mode: 'edit',
      item,
      recommendation: item,
      postId,
    });
  };

  const handleShare = async () => {
    const placeLink = item?.place?.url || '';
    const message = [item.title, item.description, placeLink].filter(Boolean).join('\n\n');
    try {
      await Share.share({ title: item.title, message });
    } catch {
      Alert.alert('השיתוף לא זמין', 'לא הצלחנו לפתוח את אפשרויות השיתוף כרגע.');
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['left', 'right']}>
      <StatusBar
        barStyle={hasImage ? 'light-content' : 'dark-content'}
        translucent
        backgroundColor="transparent"
      />
      <View style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={[
            styles.contentContainer,
            { paddingBottom: 116 + (insets.bottom || 0) },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <RecommendationHero
            item={{ ...item, id: postId }}
            snapshotData={snapshotData}
            onImagePress={(index) => setGallery({ visible: true, index })}
          />
          <RecommendationDetailContent
            item={{ ...item, id: postId }}
            author={author}
            canEdit={canEdit}
            navigation={navigation}
            onEdit={handleEdit}
          />
        </ScrollView>

        <View style={[styles.stickyBar, { paddingBottom: Math.max(insets.bottom || 0, 10) }]}>
          <RecommendationActionBar
            isLiked={isLiked}
            likeCount={likeCount}
            commentsCount={commentsCount}
            reportTarget={{ type: 'recommendation', id: postId }}
            ownerId={item?.ownerId}
            onCommentPress={() => setCommentsModalVisible(true)}
            onLikePress={toggleLike}
            onLikesListPress={() => setLikesModalVisible(true)}
            onSharePress={handleShare}
          />
        </View>
      </View>

      <LikesModal
        visible={likesModalVisible}
        onClose={() => setLikesModalVisible(false)}
        collectionName="recommendations"
        itemId={postId}
        likeCount={likeCount}
      />
      <CommentsModal
        visible={commentsModalVisible}
        onClose={() => setCommentsModalVisible(false)}
        postId={postId}
        collectionName="recommendations"
        initialCommentId={initialCommentId}
      />
      <MediaGalleryModal
        visible={gallery.visible}
        items={galleryItems}
        initialIndex={gallery.index}
        onClose={() => setGallery((current) => ({ ...current, visible: false }))}
      />
    </SafeAreaView>
  );
}
