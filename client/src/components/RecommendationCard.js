import React, { useMemo, useRef, useState } from 'react';
import { View, Text, Image, Pressable, Alert, TouchableOpacity, Platform, FlatList, useWindowDimensions, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useUserData } from '../hooks/useUserData';
import { Avatar } from './Avatar';
import { ActionMenu } from './ActionMenu';
import { cards } from '../styles';
import { auth } from '../config/firebase';
import ActionBar from './ActionBar';
import { db } from '../config/firebase';
import { deleteDoc, doc } from 'firebase/firestore';
import { getStorage, ref as storageRef, deleteObject } from 'firebase/storage';
import FavoriteButton from './FavoriteButton';
import { getUserTier } from '../utils/userTier';
import { useAdminClaim } from '../hooks/useAdminClaim';
import { formatTimestamp } from '../utils/formatTimestamp';


/**
 * Card component for displaying a recommendation item.
 * Includes user info, image, title, description, like and comment interactions.
 *
 * @param {Object} props
 * @param {Object} props.item - Recommendation data.
 * @param {Function} props.onCommentPress - Callback when comment button is pressed.
 * @param {boolean} [props.showActionBar] - Whether to show the ActionBar (default: true)
 */
const RecommendationCard = ({ item, onCommentPress, onDeleted, showActionBar = true, style, variant = 'default' }) => {
  const navigation = useNavigation();

  const { width: windowWidth } = useWindowDimensions();
  const isFeed = variant === 'feed';

  const images = useMemo(() => (Array.isArray(item.images) ? item.images.filter(Boolean) : []), [item.images]);
  const [carouselWidth, setCarouselWidth] = useState(null);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const carouselRef = useRef(null);
  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 60 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    const first = viewableItems?.[0]?.index;
    if (typeof first === 'number') setActiveImageIndex(first);
  }).current;
  
  // Use custom hooks
  const author = useUserData(item.userId);
  // Check if current user is the owner
  const isOwner = auth.currentUser?.uid === item.userId;
  const tier = getUserTier(auth.currentUser);
  const { isAdmin } = useAdminClaim();
  const canManage = tier === 'verified' && (isOwner || isAdmin);

  // Create snapshot data for favorites
  const snapshotData = {
    name: item.title,
    thumbnail_url: item.images && item.images.length > 0 ? item.images[0] : null,
    sub_text: item.description ? item.description.substring(0, 100) + (item.description.length > 100 ? '...' : '') : '',
    rating: item.rating
  };

  const handleCardPress = () => {
    navigation.navigate('RecommendationDetail', { item });
  };

  const renderCarouselImage = (uri) => {
    const pageWidth = carouselWidth || windowWidth || 0;

    if (Platform.OS === 'web') {
      // Using <img> on web avoids RN-web's XHR image loader CORS restrictions.
      return (
        <img
          src={uri}
          alt=""
          width={typeof pageWidth === 'number' && pageWidth > 0 ? pageWidth : undefined}
          style={cards.recWebImage}
        />
      );
    }

    return (
      <Image
        source={{ uri }}
        style={[cards.recCarouselImage, { width: pageWidth || '100%' }]}
        resizeMode="cover"
      />
    );
  };

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
      // Delete image from storage if exists
      if (item.images && item.images[0]) {
        try {
          const storage = getStorage();
          const imageUrl = item.images[0];
          const match = decodeURIComponent(imageUrl).match(/\/o\/(.+)\?/);
          if (match && match[1]) {
            const oldPath = match[1];
            const oldRef = storageRef(storage, oldPath);
            await deleteObject(oldRef);
          }
        } catch (err) {
          console.warn('Failed to delete recommendation image from storage:', err);
        }
      }
      await deleteDoc(doc(db, "recommendations", item.id));
      onDeleted?.(item.id); // חשוב: לעדכן את הרשימה
    } catch (error) {
      console.error("Delete error:", error);
      Alert.alert("שגיאה", "לא הצלחנו למחוק את ההמלצה.");
    }
  };
  const renderHeader = (overlay = false) => (
    <View style={overlay ? styles.feedHeaderOverlay : cards.recHeader}>
      <TouchableOpacity
        style={[cards.recAuthorInfo, overlay && styles.feedAuthorInfo]}
        activeOpacity={0.75}
        onPress={() => navigation.navigate("UserProfile", { uid: item.userId })}
      >
        <View style={overlay ? styles.feedAvatarRing : null}>
          <Avatar photoURL={author.photoURL} displayName={author.displayName} size={overlay ? 40 : 36} />
        </View>
        <View style={overlay ? styles.feedAuthorTextWrap : null}>
          <Text style={[cards.recUsername, overlay && styles.feedUsername]} numberOfLines={1}>
            {author.displayName}
          </Text>
          {item.createdAt && (
            <Text style={[cards.recDate, overlay && styles.feedMetaText]} numberOfLines={1}>
              {formatDate(item.createdAt)}
            </Text>
          )}
          {overlay && (item.location || item.country) ? (
            <Text style={styles.feedMetaText} numberOfLines={1}>
              {item.location}{item.country ? `, ${item.country}` : ''}
            </Text>
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
          onPress={() => navigation.navigate("UserProfile", { uid: item.userId })}
        >
          <Avatar photoURL={author.photoURL} displayName={author.displayName} />
          <View>
            <Text style={cards.recUsername}>{author.displayName}</Text>
            {item.createdAt && (
              <Text style={cards.recDate}>{formatDate(item.createdAt)}</Text>
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
          ]}
          onLayout={(e) => setCarouselWidth(e.nativeEvent.layout.width)}
        >
          {isFeed && (
            <LinearGradient
              pointerEvents="none"
              colors={["rgba(0,0,0,0.72)", "rgba(0,0,0,0.18)", "transparent"]}
              style={styles.feedTopGradient}
            />
          )}
          {isFeed && renderHeader(true)}
          <FlatList
            ref={carouselRef}
            data={images}
            keyExtractor={(uri, index) => `${item.id || 'rec'}:${index}:${uri}`}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            scrollEnabled={images.length > 1}
            nestedScrollEnabled
            renderItem={({ item: uri }) => (
              <View style={[cards.recCarouselItem, { width: carouselWidth || windowWidth || '100%' }]}>
                {renderCarouselImage(uri)}
              </View>
            )}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            getItemLayout={(_, index) => {
              const pageWidth = carouselWidth || windowWidth || 0;
              return { length: pageWidth, offset: pageWidth * index, index };
            }}
          />

          {Platform.OS === 'web' && images.length > 1 && (
            <View style={cards.recNavOverlay} pointerEvents="box-none">
              <Pressable
                style={cards.recNavZoneLeft}
                onPress={() => scrollToImageIndex(activeImageIndex - 1)}
              >
                {activeImageIndex > 0 && (
                  <View style={cards.recNavButton}>
                    <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
                  </View>
                )}
              </Pressable>
              <Pressable
                style={cards.recNavZoneRight}
                onPress={() => scrollToImageIndex(activeImageIndex + 1)}
              >
                {activeImageIndex < images.length - 1 && (
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
        <View style={[cards.recCarouselContainer, styles.feedCarouselContainer]}>
          <View style={styles.feedImagePlaceholder}>
            <Ionicons name="image-outline" size={48} color="rgba(255,255,255,0.62)" />
          </View>
          <LinearGradient
            pointerEvents="none"
            colors={["rgba(0,0,0,0.72)", "rgba(0,0,0,0.18)", "transparent"]}
            style={styles.feedTopGradient}
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
        <View style={cards.recTitleRow}>
          <Text style={[cards.recTitle, isFeed && styles.feedTitle]} numberOfLines={1}>{item.title}</Text>
          {item.category && (
            <View style={cards.recCategoryChip}>
              <Text style={cards.recCategoryText}>{item.category}</Text>
            </View>
          )}
        </View>

        {(item.location || item.country) && (
          <View style={cards.recLocationRow}>
            <TouchableOpacity
              style={cards.recLocationPressableRow}
              activeOpacity={0.7}
              onPress={() => {
                if (item.cityId && item.countryId) {
                  navigation.navigate('LandingPage', {
                    cityId: item.cityId,
                    countryId: item.countryId,
                  });
                }
              }}
            >
              <Ionicons name="location-outline" size={14} color="#2EC4B6" />
              <Text style={cards.recLocationText}>
                {item.location}{item.country ? `, ${item.country}` : ''}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {Number.isFinite(Number(item?.distanceKm)) && (
          <View style={cards.recLocationRow}>
            <View style={cards.recLocationPressableRow}>
              <Ionicons name="navigate-outline" size={14} color="#2EC4B6" />
              <Text style={cards.recLocationText}>
                {`${Number(item.distanceKm).toFixed(1).replace(/\.0$/, '')} ק\"מ ממך`}
              </Text>
            </View>
          </View>
        )}

        <Text style={[cards.recDescription, isFeed && styles.feedDescription]} numberOfLines={isFeed ? 2 : 3}>
          {item.description}
        </Text>
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

const styles = StyleSheet.create({
  feedCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    marginBottom: 18,
    overflow: 'hidden',
  },
  feedCarouselContainer: {
    aspectRatio: 0.78,
    borderRadius: 0,
    overflow: 'hidden',
  },
  feedImagePlaceholder: {
    flex: 1,
    backgroundColor: '#1F2937',
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedTopGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 150,
    zIndex: 3,
  },
  feedBottomGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 160,
    zIndex: 3,
  },
  feedHeaderOverlay: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    zIndex: 6,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  feedAuthorInfo: {
    flex: 1,
    minWidth: 0,
  },
  feedAvatarRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.78)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  feedAuthorTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  feedUsername: {
    color: '#FFFFFF',
    fontSize: 16,
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  feedMetaText: {
    color: 'rgba(255,255,255,0.86)',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
    writingDirection: 'rtl',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  feedHeaderActions: {
    backgroundColor: 'rgba(15,23,42,0.22)',
    borderRadius: 22,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  feedDotsContainer: {
    bottom: 72,
    zIndex: 6,
  },
  feedActionOverlay: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 16,
    zIndex: 7,
  },
  feedContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
  },
  feedTitle: {
    fontSize: 17,
  },
  feedDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
});
