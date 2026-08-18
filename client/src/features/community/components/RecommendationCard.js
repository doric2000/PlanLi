import React from 'react';
import { View, Pressable, Alert, TouchableOpacity, Platform } from 'react-native';
import AppText from "../../../components/AppText";
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useUserData } from '../../../hooks/useUserData';
import { useLikes } from '../../community/hooks/useLikes';
import { Avatar } from '../../../components/Avatar';
import { ActionMenu } from '../../../components/ActionMenu';
import { cards } from '../../../styles';
import ActionBar from '../../../components/ActionBar';
import CachedImage from '../../../components/CachedImage';
import { canManageRecommendation } from '../../../utils/contentPermissions';
import { useAdminClaim } from '../../../hooks/useAdminClaim';
import { formatTimestamp } from '../../../utils/formatTimestamp';
import { getRecommendationImageUrls } from '../../../utils/mediaAssets';
import { deleteContent } from '../../../services/SocialService';
import { useAuthUser } from '../../../hooks/useAuthUser';
import { CAPABILITIES } from '../../../constants/authPolicy';


/**
 * Card component for displaying a recommendation item.
 * Includes user info, image, title, description, like and comment interactions.
 *
 * @param {Object} props
 * @param {Object} props.item - Recommendation data.
 * @param {Function} props.onCommentPress - Callback when comment button is pressed.
 * @param {boolean} [props.showActionBar] - Whether to show the ActionBar (default: true)
 */
const RecommendationCard = ({ item, onCommentPress, onDeleted, showActionBar = true }) => {
  const navigation = useNavigation();
  const { user, isActive, requireCapability } = useAuthUser();
  const imageUrl = getRecommendationImageUrls(item, 'feed')[0];
  
  // Use custom hooks
  const ownerId = item.ownerId;
  const destination = item.destination || {};
  const author = useUserData(ownerId);
  const { isLiked, likeCount, toggleLike } = useLikes(
    'recommendations',
    item.id,
    item.stats?.likeCount || 0
  );

  // Check if current user is the owner
  const { isAdmin } = useAdminClaim();
  const canManage = isActive && canManageRecommendation({
    user,
    ownerId,
    isAdmin,
  });

  const handleCardPress = () => {
    navigation.navigate('RecommendationDetail', { item });
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return '';
    return formatTimestamp(timestamp);
  };

  const handleEdit = () => {
    navigation.navigate('AddRecommendation', {
      mode: 'edit',
      recommendation: item,
      postId: item.id,
    });
  };

  const handleDelete = async () => {
    if (!requireCapability(CAPABILITIES.ACTIVE)) return;

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



  return (
    <Pressable style={cards.recommendation} onPress={handleCardPress}>
      {/* Header */}
      <View style={cards.recHeader}>
        <View style={cards.recAuthorInfo}>
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
        </View>
        {canManage ? (
          <ActionMenu
            onEdit={handleEdit}
            onDelete={handleDelete}
            title="ניהול המלצה"
          />
        ) : null}
      </View>

      {/* Image */}
      {!!imageUrl && (
        <CachedImage
          source={{ uri: imageUrl }}
          style={cards.recImage}
          contentFit="cover"
          priority="low"
        />
      )}

      {/* Content */}
      <View style={cards.recContent}>
        <View style={cards.recTitleRow}>
          <AppText style={cards.recTitle} numberOfLines={1}>{item.title}</AppText>
          {item.category && (
            <View style={cards.recCategoryChip}>
              <AppText style={cards.recCategoryText}>{item.category}</AppText>
            </View>
          )}
        </View>

        {(destination.cityName || destination.countryName) && (
          <View style={cards.recLocationRow}>
            <TouchableOpacity
              onPress={() => {
                if (destination.cityId && destination.countryId) {
                  navigation.navigate('LandingPage', {
                    cityId: destination.cityId,
                    countryId: destination.countryId,
                  });
                }
              }}
              activeOpacity={0.7}
              style={{ flexDirection: 'row', alignItems: 'center' }}
            >
              <Ionicons name="location-outline" size={14} color="#2EC4B6" />
              <AppText style={cards.recLocationText}>
                {destination.cityName}{destination.countryName ? `, ${destination.countryName}` : ''}
              </AppText>
            </TouchableOpacity>
          </View>
        )}

        <AppText style={cards.recDescription} numberOfLines={3}>
          {item.description}
        </AppText>
      </View>

      {/* Footer / Action Bar */}
      {showActionBar && (
        <ActionBar item={item} onCommentPress={onCommentPress} />
      )}

    </Pressable>
  );
};

export default RecommendationCard;
