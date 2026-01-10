import React from 'react';
import { View, Text, Image, Pressable, Alert ,TouchableOpacity , Platform} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useUserData } from '../../../hooks/useUserData';
import { useLikes } from '../../community/hooks/useLikes';
import { Avatar } from '../../../components/Avatar';
import { ActionMenu } from '../../../components/ActionMenu';
import { cards } from '../../../styles';
import { auth } from '../../../config/firebase';
import ActionBar from '../../../components/ActionBar';
import { db } from '../../../config/firebase';
import { deleteDoc, doc } from 'firebase/firestore';


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

  const handleCardPress = () => {
    navigation.navigate('RecommendationDetail', { item });
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const handleEdit = () => {
    navigation.navigate('AddRecommendation', {
      mode: 'edit',
      recommendation: item,
      postId: item.id,
    });
  };

  const handleDelete = async () => {
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
      await deleteDoc(doc(db, "recommendations", item.id));
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
          <Avatar photoURL={author.photoURL} displayName={author.displayName} />
          <View>
            <Text style={cards.recUsername}>{author.displayName}</Text>
            {item.createdAt && (
              <Text style={cards.recDate}>{formatDate(item.createdAt)}</Text>
            )}
          </View>
        </View>
        {isOwner ? (
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
          <View style={cards.recLocationRow}>
            <TouchableOpacity
              onPress={() => {
                if (item.cityId && item.countryId) {
                  navigation.navigate('LandingPage', {
                    cityId: item.cityId,
                    countryId: item.countryId,
                  });
                }
              }}
              activeOpacity={0.7}
              style={{ flexDirection: 'row', alignItems: 'center' }}
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

      {/* Footer / Action Bar */}
      {showActionBar && (
        <ActionBar item={item} onCommentPress={onCommentPress} />
      )}

    </Pressable>
  );
};

export default RecommendationCard;