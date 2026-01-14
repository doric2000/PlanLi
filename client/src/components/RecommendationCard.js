import React, { useMemo, useRef, useState } from 'react';
import { View, Text, Image, Pressable, Alert, TouchableOpacity, Platform, FlatList, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useUserData } from '../hooks/useUserData';
import { useLikes } from '../features/community/hooks/useLikes';
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
const RecommendationCard = ({ item, onCommentPress, onDeleted, showActionBar = true, style }) => {
  const navigation = useNavigation();

  const { width: windowWidth } = useWindowDimensions();

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
  const { isLiked, likeCount, likedByList, toggleLike } = useLikes(
    'recommendations', 
    item.id, 
    item.likes, 
    item.likedBy
  );

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
          style={{
            width: pageWidth || '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
          }}
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
  return (
    <View style={[cards.recommendation, style]}>
      {/* Header */}
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
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
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
                Alert.alert("DEBUG", "לחצת על מחיקה");
              }}
              title="Manage Recommendation"
            />
          ) : null}
        </View>
      </View>

      {/* Images (swipe like Instagram) */}
      {images.length > 0 && (
        <View
          style={cards.recCarouselContainer}
          onLayout={(e) => setCarouselWidth(e.nativeEvent.layout.width)}
        >
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
              <View style={{ width: carouselWidth || windowWidth || '100%', height: '100%' }}>
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
            <View style={cards.recDotsContainer} pointerEvents="none">
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
        </View>
      )}

      {/* Content */}
      <Pressable onPress={handleCardPress}>
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
          <View style={cards.recLocationRow}>
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center' }}
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

        <Text style={cards.recDescription} numberOfLines={3}>
          {item.description}
        </Text>
        </View>
      </Pressable>

      {/* Footer / Action Bar */}
      {showActionBar && (
        <ActionBar item={item} onCommentPress={onCommentPress} />
      )}

    </View>
  );
};

export default RecommendationCard;