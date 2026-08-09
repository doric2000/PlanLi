import React, { useState, useEffect } from 'react';
import {
	View,
	TouchableOpacity,
	FlatList,
	ActivityIndicator,
	Alert,
} from 'react-native';
import AppText from "./AppText";
import AppTextInput from "./AppTextInput";
import { Ionicons } from '@expo/vector-icons';
import { 
  collection,
  query,
  orderBy,
  onSnapshot,
  limit,
} from 'firebase/firestore';
import { db, auth } from '../config/firebase';
import { common } from '../styles';
import { Avatar } from './Avatar';
import { formatTimestamp } from '../utils/formatTimestamp';
import { getUserTier } from '../utils/userTier';
import { saveComment } from '../services/SocialService';

/**
 * CommentItem - Displays a single comment with user info.
 * 
 * Shows the commenter's avatar, name, and comment text.
 * Automatically fetches user data from Firebase based on userId.
 * 
 * @param {Object} item - Comment object containing userId and text
 */
const CommentItem = ({ item }) => {
  const userData = {
    name: item.authorPreview?.displayName || 'Traveler',
    photo: item.authorPreview?.photoURL || null,
  };

  return (
    <View style={common.commentItem}>
      <Avatar photoURL={userData.photo} displayName={userData.name} size={40} />
      <View style={common.commentContent}>
        <View style={{ alignItems: 'flex-end', marginBottom: 2 }}>
          <AppText style={common.commentUserName}>{userData.name}</AppText>
          <AppText style={[common.commentText, { color: '#9CA3AF', fontSize: 11 }]}>{formatTimestamp(item.createdAt)}</AppText>
        </View>
        <AppText style={common.commentText}>{item.text}</AppText>
      </View>
    </View>
  );
};

/**
 * CommentsSection - The main comments interface component.
 * 
 * This component provides the full comments experience:
 * - Displays a list of all comments for a post
 * - Allows sorting comments (newest/oldest first)
 * - Provides an input field to add new comments
 * - Shows real-time updates when new comments are added
 * 
 * NOTE: This component is typically used inside CommentsModal.
 * For most cases, use CommentsModal instead of this directly.
 * 
 * @param {string} collectionName - Firebase collection (e.g., 'recommendations', 'routes')
 * @param {string} postId - The ID of the post to show comments for
 */
export const CommentsSection = ({ collectionName, postId }) => {
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [isNewestFirst, setIsNewestFirst] = useState(true);

  const authUser = auth.currentUser;
  const tier = getUserTier(authUser);
  const canComment = tier === 'verified';

  useEffect(() => {
    if (!postId || !collectionName) return;

    const commentsRef = collection(db, collectionName, postId, 'comments');
    const q = query(commentsRef, orderBy('createdAt', 'desc'), limit(30));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedComments = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setComments(fetchedComments);
    });

    return () => unsubscribe(); 
  }, [postId, collectionName]);

  const getSortedComments = () => {
    return [...comments].sort((a, b) => {
        const dateA = a.createdAt?.seconds || 0;
        const dateB = b.createdAt?.seconds || 0;

        if (isNewestFirst) {
            return dateB - dateA;
        } else {
            return dateA - dateB;
        }
    });
  };

  const handleAddComment = async () => {
    if (newComment.trim() === '') return;
    if (!auth.currentUser) {
      Alert.alert('שגיאה', 'יש להתחבר כדי להגיב.');
      return;
    }
    if (!canComment) {
      Alert.alert('נדרש אימות', 'כדי להגיב צריך לאמת את האימייל.');
      return;
    }

    setSubmitting(true);
    try {
      await saveComment(
        {
          type: collectionName === 'routes' ? 'route' :
            collectionName === 'trips' ? 'trip' : 'recommendation',
          id: postId,
        },
        newComment
      );

      setNewComment('');
    } catch (error) {
      console.error("Error adding comment:", error);
      Alert.alert("Error", "Could not send comment");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={common.commentSection}>
      <View style={common.commentHeaderContainer}>
          <AppText style={common.commentHeaderTitle}>תגובות ({comments.length})</AppText>
          <TouchableOpacity onPress={() => setIsNewestFirst(!isNewestFirst)}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center' }}>
              <Ionicons
                name={isNewestFirst ? 'arrow-down' : 'arrow-up'}
                size={14}
                color="#1E3A5F"
                style={{ marginLeft: 6 }}
              />
              <AppText style={common.commentSortText}>
                {isNewestFirst ? 'מיין: חדש קודם' : 'מיין: ישן קודם'}
              </AppText>
            </View>
          </TouchableOpacity>
      </View>

      <FlatList
        data={getSortedComments()} 
        renderItem={({ item }) => <CommentItem item={item} />}
        keyExtractor={item => item.id}
        style={common.commentList}
        nestedScrollEnabled={true}
        removeClippedSubviews={true}
        windowSize={5}
      />

      <View style={common.commentInputContainer}>
        <Avatar 
          photoURL={auth.currentUser?.photoURL} 
          displayName={auth.currentUser?.displayName} 
          size={32} 
        />
        <AppTextInput
          style={common.commentInput}
          placeholder={
            tier === 'guest'
              ? 'התחבר/י כדי להגיב...'
              : tier === 'unverified'
                ? 'אמת/י אימייל כדי להגיב...'
                : 'כתוב תגובה...'
          }
          value={newComment}
          onChangeText={setNewComment}
          multiline
          editable={canComment}
        />
        <TouchableOpacity 
          style={[common.commentSendButton, (!newComment.trim() || submitting || !canComment) && common.commentSendDisabled]} 
          onPress={handleAddComment}
          disabled={!newComment.trim() || submitting || !canComment}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="send" size={20} color="#fff" style={common.commentSendIcon} />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default CommentsSection;
