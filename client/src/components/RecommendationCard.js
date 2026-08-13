import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Pressable, Alert, TouchableOpacity, Platform } from 'react-native';
import AppText from "./AppText";
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useUserData } from '../hooks/useUserData';
import { useBoundedImageWindow } from '../hooks/useBoundedImageWindow';
import { useStableCarouselLayout } from '../hooks/useStableCarouselLayout';
import { Avatar } from './Avatar';
import { ActionMenu } from './ActionMenu';
import CachedImage, { prefetchImage } from './CachedImage';
import RtlPagedFlatList from './RtlPagedFlatList';
import { cards, colors, recommendationCardStyles as styles } from '../styles';
import { auth } from '../config/firebase';
import ActionBar from './ActionBar';
import FavoriteButton from './FavoriteButton';
import PreferenceContextLine from './PreferenceContextLine';
import { getUserTier } from '../utils/userTier';
import { canManageRecommendation } from '../utils/contentPermissions';
import { useAdminClaim } from '../hooks/useAdminClaim';
import { formatTimestamp } from '../utils/formatTimestamp';
import {
  getMediaPlaceholder,
  getMediaSrcSet,
  getRecommendationImageUrls,
} from '../utils/mediaAssets';
import { deleteContent } from '../services/SocialService';


/**
 * Card component for displaying a recommendation item.
 * Includes user info, image, title, description, like and comment interactions.
 *
 * @param {Object} props
 * @param {Object} props.item - Recommendation data.
 * @param {Function} props.onCommentPress - Callback when comment button is pressed.
 * @param {boolean} [props.showActionBar] - Whether to show the ActionBar (default: true)
 */
const RecommendationCard = ({
  item,
  onCommentPress,
  onDeleted,
  showActionBar = true,
  style,
  variant = 'default',
  topContentInset = 0,
}) => {
  const navigation = useNavigation();

  const isFeed = variant === 'feed';
  const feedTopInset = isFeed ? Math.max(0, Number(topContentInset) || 0) : 0;
  const carouselAspectRatio = isFeed ? 1.1 : 1;
  const {
    pageWidth,
    frameHeight,
    onLayout: onCarouselLayout,
  } = useStableCarouselLayout({
    aspectRatio: carouselAspectRatio,
    extraHeight: feedTopInset,
  });

  const images = useMemo(
    () => getRecommendationImageUrls(item, 'feed'),
    [item]
  );
  const thumbnailUrl = useMemo(
    () => getRecommendationImageUrls(item, 'thumb')[0] || null,
    [item]
  );
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const carouselRef = useRef(null);
  const imageWindow = useBoundedImageWindow(activeImageIndex, images.length);
  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 60 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    const first = viewableItems?.[0]?.index;
    if (typeof first === 'number') setActiveImageIndex(first);
  }).current;
  const imageIdentity = `${item?.id || ''}:${images.join('|')}`;

  useEffect(() => {
    setActiveImageIndex(0);
    carouselRef.current?.scrollToOffset?.({ offset: 0, animated: false });
  }, [imageIdentity]);

  useEffect(() => {
    const neighbors = imageWindow.indices
      .filter((index) => index !== imageWindow.currentIndex)
      .map((index) => images[index])
      .filter(Boolean);
    prefetchImage(neighbors).catch(() => {});
  }, [imageWindow.currentIndex, imageWindow.indices, images]);

  // Use custom hooks
  const ownerId = item.ownerId;
  const destination = item.destination || {};
  const author = useUserData(ownerId);
  // Check if current user is the owner
  const { isAdmin } = useAdminClaim();
  const canManage = canManageRecommendation({
    user: auth.currentUser,
    ownerId,
    isAdmin,
  });

  // Create snapshot data for favorites
  const snapshotData = {
    name: item.title,
    thumbnail_url: thumbnailUrl,
    sub_text: item.description ? item.description.substring(0, 100) + (item.description.length > 100 ? '...' : '') : ''
  };

  const handleCardPress = () => {
    if (item.isFavoritePreview) {
      navigation.navigate('RecommendationDetail', { postId: item.id });
      return;
    }
    navigation.navigate('RecommendationDetail', { item });
  };

  const renderCarouselImage = (uri, index) => {
    if (index !== imageWindow.currentIndex) {
      return (
        <View
          style={[
            cards.recCarouselImage,
            { width: pageWidth, height: frameHeight },
          ]}
        />
      );
    }

    return (
      <CachedImage
        source={{ uri }}
        placeholder={getMediaPlaceholder(item?.media?.[index])}
        srcSet={getMediaSrcSet(item?.media?.[index])}
        sizes="100vw"
        style={[
          Platform.OS === 'web' ? cards.recWebImage : cards.recCarouselImage,
          { width: pageWidth, height: frameHeight },
        ]}
        contentFit="cover"
        priority={index === imageWindow.currentIndex ? 'normal' : 'low'}
      />
    );
  };
  const personalizationReasonCode = item?.personalization?.reasonCodes?.[0];

  const scrollToImageIndex = (nextIndex) => {
    if (!images.length) return;
    const clamped = Math.max(0, Math.min(nextIndex, images.length - 1));
    try {
      carouselRef.current?.scrollToIndex?.({ index: clamped, animated: true });
      setActiveImageIndex(clamped);
    } catch {
      // ignore
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return '';
    return formatTimestamp(timestamp);
  };

  const handleEdit = () => {
    navigation.navigate('AddRecommendation', {
      mode: 'edit',
      item,
      postId: item.id,
    });
  };


  const handleDelete = async () => {
    if (getUserTier(auth.currentUser) !== 'verified') {
      Alert.alert('נדרש אימות', 'כדי למחוק המלצה צריך לאמת את האימייל.');
      return;
    }

    const ok =
      Platform.OS === 'web'
        ? window.confirm("בטוח שברצונך למחוק את ההמלצה?")
        : await new Promise((resolve) => {
            Alert.alert(
              "מחיקת המלצה",
              "בטוח שברצונך למחוק את ההמלצה?",
              [
                { text: "ביטול", style: "cancel", onPress: () => resolve(false) },
                { text: "מחק", style: "destructive", onPress: () => resolve(true) },
              ]
            );
          });

    if (!ok) return;

    try {
      await deleteContent({ type: 'recommendation', id: item.id });
      onDeleted?.(item.id); // חשוב: לעדכן את הרשימה
    } catch (error) {
      console.error("Delete error:", error);
      Alert.alert("שגיאה", "לא הצלחנו למחוק את ההמלצה.");
    }
  };
  const renderHeader = (overlay = false) => (
    <View
      style={[
        overlay ? styles.feedHeaderOverlay : cards.recHeader,
        overlay && feedTopInset > 0 && { top: 12 + feedTopInset },
      ]}
    >
      <TouchableOpacity
        style={[cards.recAuthorInfo, overlay && styles.feedAuthorInfo]}
        activeOpacity={0.75}
        onPress={() => ownerId && navigation.navigate("UserProfile", { uid: ownerId })}
      >
        <View style={overlay ? styles.feedAvatarRing : null}>
          <Avatar
            photoURL={author.photoURL}
            photoMedia={author.photoMedia}
            displayName={author.displayName}
            size={overlay ? 40 : 36}
            insideRing={overlay}
          />
        </View>
        <View style={overlay ? styles.feedAuthorTextWrap : null}>
          <AppText style={[cards.recUsername, overlay && styles.feedUsername]} numberOfLines={1}>
            {author.displayName}
          </AppText>
          {item.createdAt && (
            <AppText style={[cards.recDate, overlay && styles.feedMetaText]} numberOfLines={1}>
              {formatDate(item.createdAt)}
            </AppText>
          )}
          {overlay && (destination.cityName || destination.countryName) ? (
            <AppText style={styles.feedMetaText} numberOfLines={1}>
              {destination.cityName}{destination.countryName ? `, ${destination.countryName}` : ''}
            </AppText>
          ) : null}
        </View>
      </TouchableOpacity>
      <View style={[cards.recHeaderActionsRow, overlay && styles.feedHeaderActions]}>
        <FavoriteButton
          type="recommendations"
          id={item.id}
          variant={overlay ? "overlay" : "light"}
          snapshotData={snapshotData}
        />
        {canManage ? (
          <ActionMenu
            iconColor={overlay ? "#FFFFFF" : undefined}
            onEdit={() => {
              handleEdit();
            }}
            onDelete={() => {
              handleDelete();
              console.log("DELETE CLICKED", item.id);
            }}
            title="ניהול המלצה"
          />
        ) : null}
      </View>
    </View>
  );

  return (
    <View style={[isFeed ? styles.feedCard : cards.recommendation, style]}>
      {/* Header */}
      {!isFeed && (
      <View style={cards.recHeader}>
        <TouchableOpacity
          style={cards.recAuthorInfo}
          activeOpacity={0.75}
          onPress={() => ownerId && navigation.navigate("UserProfile", { uid: ownerId })}
        >
          <Avatar
            photoURL={author.photoURL}
            photoMedia={author.photoMedia}
            displayName={author.displayName}
          />
          <View>
            <AppText style={cards.recUsername}>{author.displayName}</AppText>
            {item.createdAt && (
              <AppText style={cards.recDate}>{formatDate(item.createdAt)}</AppText>
            )}
          </View>
        </TouchableOpacity>
        <View style={cards.recHeaderActionsRow}>
          <FavoriteButton
            type="recommendations"
            id={item.id}
            variant="light"
            snapshotData={snapshotData}
          />
          {canManage ? (
            <ActionMenu
                onEdit={() => {
                handleEdit();
              }}
              onDelete={() => {
                handleDelete();
                console.log("DELETE CLICKED", item.id);
              }}
              title="ניהול המלצה"
            />
          ) : null}
        </View>
      </View>
      )}

      {/* Images (swipe like Instagram) */}
      {images.length > 0 && (
        <View
          style={[
            cards.recCarouselContainer,
            isFeed && styles.feedCarouselContainer,
            { aspectRatio: undefined, height: frameHeight },
          ]}
          onLayout={onCarouselLayout}
        >
          {isFeed && (
            <LinearGradient
              pointerEvents="none"
              colors={["rgba(0,0,0,0.72)", "rgba(0,0,0,0.18)", "transparent"]}
              style={[styles.feedTopGradient, feedTopInset > 0 && { height: 118 + feedTopInset }]}
            />
          )}
          {isFeed && renderHeader(true)}
          <RtlPagedFlatList
            ref={carouselRef}
            data={images}
            extraData={imageWindow.currentIndex}
            style={[cards.recCarouselList, { width: pageWidth, height: frameHeight }]}
            keyExtractor={(uri, index) => `${item.id || 'rec'}:${index}:${uri}`}
            scrollEnabled={images.length > 1}
            nestedScrollEnabled
            initialNumToRender={1}
            maxToRenderPerBatch={1}
            windowSize={3}
            renderItem={({ item: uri, index }) => (
              <View style={[cards.recCarouselItem, { width: pageWidth, height: frameHeight }]}>
                {renderCarouselImage(uri, index)}
              </View>
            )}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            getItemLayout={(_, index) => {
              return { length: pageWidth, offset: pageWidth * index, index };
            }}
          />

          {Platform.OS === 'web' && images.length > 1 && (
            <View style={cards.recNavOverlay} pointerEvents="box-none">
              <Pressable
                style={cards.recNavZoneLeft}
                onPress={() => scrollToImageIndex(activeImageIndex + 1)}
              >
                {activeImageIndex < images.length - 1 && (
                  <View style={cards.recNavButton}>
                    <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
                  </View>
                )}
              </Pressable>
              <Pressable
                style={cards.recNavZoneRight}
                onPress={() => scrollToImageIndex(activeImageIndex - 1)}
              >
                {activeImageIndex > 0 && (
                  <View style={cards.recNavButton}>
                    <Ionicons name="chevron-forward" size={22} color="#FFFFFF" />
                  </View>
                )}
              </Pressable>
            </View>
          )}

          {images.length > 1 && (
            <View style={[cards.recDotsContainer, isFeed && styles.feedDotsContainer]} pointerEvents="none">
              {images.map((_, index) => (
                <View
                  key={`${item.id || 'rec'}:dot:${index}`}
                  style={[
                    cards.recDot,
                    index === activeImageIndex && cards.recDotActive,
                  ]}
                />
              ))}
            </View>
          )}
          {isFeed && (
            <>
              <LinearGradient
                pointerEvents="none"
                colors={["transparent", "rgba(0,0,0,0.36)", "rgba(0,0,0,0.74)"]}
                style={styles.feedBottomGradient}
              />
              {showActionBar && (
                <View style={styles.feedActionOverlay}>
                  <ActionBar item={item} onCommentPress={onCommentPress} variant="overlay" />
                </View>
              )}
            </>
          )}
        </View>
      )}
      {isFeed && images.length === 0 && (
        <View
          style={[
            cards.recCarouselContainer,
            styles.feedCarouselContainer,
            { aspectRatio: undefined, height: frameHeight },
          ]}
          onLayout={onCarouselLayout}
        >
          <View style={styles.feedImagePlaceholder}>
            <Ionicons name="image-outline" size={48} color="rgba(255,255,255,0.62)" />
          </View>
          <LinearGradient
            pointerEvents="none"
            colors={["rgba(0,0,0,0.72)", "rgba(0,0,0,0.18)", "transparent"]}
            style={[styles.feedTopGradient, feedTopInset > 0 && { height: 118 + feedTopInset }]}
          />
          {renderHeader(true)}
          <LinearGradient
            pointerEvents="none"
            colors={["transparent", "rgba(0,0,0,0.36)", "rgba(0,0,0,0.74)"]}
            style={styles.feedBottomGradient}
          />
          {showActionBar && (
            <View style={styles.feedActionOverlay}>
              <ActionBar item={item} onCommentPress={onCommentPress} variant="overlay" />
            </View>
          )}
        </View>
      )}

      {/* Content */}
      <Pressable onPress={handleCardPress}>
        <View style={[cards.recContent, isFeed && styles.feedContent]}>
        <PreferenceContextLine
          reasonCode={personalizationReasonCode}
          style={cards.recLocationRow}
          textStyle={cards.recLocationText}
        />
        <View style={cards.recTitleRow}>
          <AppText style={[cards.recTitle, isFeed && styles.feedTitle]} numberOfLines={1}>{item.title}</AppText>
          {item.category && (
            <View style={cards.recCategoryChip}>
              <AppText style={cards.recCategoryText}>{item.category}</AppText>
            </View>
          )}
        </View>

        {(destination.cityName || destination.countryName) && (
          <View style={cards.recLocationRow}>
            <TouchableOpacity
              style={cards.recLocationPressableRow}
              activeOpacity={0.7}
              onPress={() => {
                if (destination.cityId && destination.countryId) {
                  navigation.navigate('LandingPage', {
                    cityId: destination.cityId,
                    countryId: destination.countryId,
                  });
                }
              }}
            >
              <Ionicons name="location-outline" size={14} color="#2EC4B6" />
              <AppText style={cards.recLocationText}>
                {destination.cityName}{destination.countryName ? `, ${destination.countryName}` : ''}
              </AppText>
            </TouchableOpacity>
          </View>
        )}

        {Number.isFinite(Number(item?.distanceKm)) && (
          <View style={cards.recLocationRow}>
            <View style={cards.recLocationPressableRow}>
              <Ionicons name="navigate-outline" size={14} color="#2EC4B6" />
              <AppText style={cards.recLocationText}>
                {`${Number(item.distanceKm).toFixed(1).replace(/\.0$/, '')} ק\"מ ממך`}
              </AppText>
            </View>
          </View>
        )}

        <AppText style={[cards.recDescription, isFeed && styles.feedDescription]} numberOfLines={isFeed ? 2 : 3}>
          {item.description}
        </AppText>
        </View>
      </Pressable>

      {/* Footer / Action Bar */}
      {showActionBar && !isFeed && (
        <ActionBar item={item} onCommentPress={onCommentPress} />
      )}

    </View>
  );
};

export default RecommendationCard;
