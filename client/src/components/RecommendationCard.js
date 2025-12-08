import React, { useState, useEffect } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc, updateDoc, increment, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db, auth } from '../config/firebase';
import LikesModal from './likesList';

const RecommendationCard = ({ item }) => {
  const currentUserId = auth.currentUser?.uid;
  const [isLiked, setIsLiked] = useState(item.likedBy?.includes(currentUserId) || false);
  const [likeCount, setLikeCount] = useState(item.likes || 0);
  const [likedByList, setLikedByList] = useState(item.likedBy || []);
  const [showLikesModal, setShowLikesModal] = useState(false);
  
  //Always start with default and selecting from firebase
  const [author, setAuthor] = useState({ 
    displayName: 'Traveler', 
    photoURL:  null 
  });
  const [loadingAuthor, setLoadingAuthor] = useState(true);

  useEffect(() => {
    const fetchAuthor = async () => {
      if (!item.userId) {
        setLoadingAuthor(false);
        return;
      }

        try {      
          //case 2 - other user recommendation 
          const userDocRef = doc(db, 'users', item.userId);
          const userDoc = await getDoc(userDocRef);
          if (userDoc.exists()) {
            const userData = userDoc.data();
            setAuthor({
              displayName: userData.displayName || 'Traveler',
              photoURL: userData.photoURL || null
            });
          }
          else {
            //if doc does not exists , try using authentication.
            if (item.userId === currentUserId && auth.currentUser) {
              setAuthor({
                displayName: auth.currentUser.displayName || 'Traveler',
                photoURL: auth.currentUser.photoURL || null
              });
            }
          }
        } catch (error) {
          console.log("Error fetching author:", error);
        } finally {
          setLoadingAuthor(false);
        }
    };

    fetchAuthor();
  }, [item.userId, currentUserId]);

  const handleToggleLike = async () => {
    if (!currentUserId) return;

    const newIsLiked = !isLiked;
    const newLikeCount = newIsLiked ? likeCount + 1 : likeCount - 1;
    
    // עדכון גם את רשימת הלייקים
    const newLikedByList = newIsLiked 
      ? [...likedByList, currentUserId]
      : likedByList.filter(id => id !== currentUserId);

    setIsLiked(newIsLiked);
    setLikeCount(newLikeCount);
    setLikedByList(newLikedByList);

    try {
      const recRef = doc(db, 'recommendations', item.id);

      if (newIsLiked) {
        await updateDoc(recRef, {
          likes: increment(1),
          likedBy: arrayUnion(currentUserId)
        });
      } else {
        await updateDoc(recRef, {
          likes: increment(-1),
          likedBy: arrayRemove(currentUserId)
        });
      }
    } catch (error) {
      console.error("Error updating like:", error);
      setIsLiked(!newIsLiked);
      setLikeCount(likeCount);
      setLikedByList(likedByList);
    }
  };

  // פונקציה חדשה לפתיחת ה-Modal
  const handleShowLikes = () => {
    if (likeCount > 0) {
      setShowLikesModal(true);
    }
  };

  const handleCommentPress = () => {
    console.log("Open comments for:", item.id);
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
          {author.photoURL ? (
            <Image source={{ uri: author.photoURL }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Text style={styles.avatarInitial}>
                {author.displayName.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
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

        {/* Location - Country & City */}
        {(item.location || item.country) && (
          <View style={styles.locationRow}>
            <Ionicons name="location-outline" size={14} color="#6B7280" />
            <Text style={styles.locationText}>
              {item.location}{item.country ? `, ${item.country}` : ''}
            </Text>
          </View>
        )}

        <Text style={styles.description} numberOfLines={3}>
          {item.description}
        </Text>
      </View>

      {/* Footer / Action Bar */}
      <View style={styles.footer}>
        <View style={styles.actionGroup}>
            {/* Like Button */}
            <TouchableOpacity style={styles.actionButton} onPress={handleToggleLike}>
              <Ionicons
                  name={isLiked ? "heart" : "heart-outline"}
                  size={24}
                  color={isLiked ? "#EF4444" : "#4B5563"}
              />
            </TouchableOpacity>
            
            {/* Like Count - לחיץ לפתיחת Modal */}
            <TouchableOpacity onPress={handleShowLikes}>
              <Text style={[
                styles.likeCountText, 
                likeCount > 0 && styles.likeCountClickable
              ]}>
                {likeCount > 0 ? `${likeCount} likes` : ''}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionButton} onPress={handleCommentPress}>
              <Ionicons name="chatbubble-outline" size={22} color="#4B5563" />
              <Text style={styles.actionText}>Comment</Text>
            </TouchableOpacity>
        </View>

        <TouchableOpacity>
            <Ionicons name="share-social-outline" size={22} color="#4B5563" />
        </TouchableOpacity>
      </View>

      {/* Likes Modal */}
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
    color: '#6B7280',
    marginLeft: 4,
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