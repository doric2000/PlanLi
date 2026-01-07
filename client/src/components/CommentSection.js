import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { 
  collection, 
  addDoc, 
  query,
  getDoc,
  doc,
  orderBy, 
  onSnapshot, 
  serverTimestamp 
} from 'firebase/firestore';
import { db, auth } from '../config/firebase';
import { common } from '../styles';
import { Avatar } from './Avatar';
import { formatTimestamp } from '../utils/formatTimestamp';
import { notifyCommentEvent } from '../features/notifications/services/NotificationObserver';
import { PostType } from '../features/notifications/models/NotificationModel';

/**
 * CommentItem - Displays a single comment with user info.
 * 
 * Shows the commenter's avatar, name, and comment text.
 * Automatically fetches user data from Firebase based on userId.
 * 
 * @param {Object} item - Comment object containing userId and text
 */
const CommentItem = ({ item }) => {
  const [userData, setUserData] = useState({ name: 'Loading...', photo: null });

  useEffect(() => {
    const fetchUser = async () => {
      if (!item.userId) return;
      const snap = await getDoc(doc(db, 'users', item.userId));
      if (snap.exists()) setUserData({ 
        name: snap.data().displayName, 
        photo: snap.data().photoURL 
      });
    };
    fetchUser();
  }, [item.userId]);

  return (
    <View style={common.commentItem}>
      <Avatar photoURL={userData.photo} displayName={userData.name} size={40} />
      <View style={common.commentContent}>
        <View style={{ alignItems: 'flex-end', marginBottom: 2 }}>
          <Text style={common.commentUserName}>{userData.name}</Text>
          <Text style={[common.commentText, { color: '#9CA3AF', fontSize: 11 }]}>{formatTimestamp(item.createdAt)}</Text>
        </View>
        <Text style={common.commentText}>{item.text}</Text>
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

  useEffect(() => {
    if (!postId || !collectionName) return;

    const commentsRef = collection(db, collectionName, postId, 'comments');
    const q = query(commentsRef, orderBy('createdAt', 'desc')); 

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
        Alert.alert("Error", "You must be logged in to comment");
        return;
    }

    setSubmitting(true);
    try {
      const commentsRef = collection(db, collectionName, postId, 'comments');
      
      await addDoc(commentsRef, {
        text: newComment,
        userId: auth.currentUser.uid,
        createdAt: serverTimestamp(),
      });

      setNewComment('');

      // Trigger notification after successful comment
      try {
        // Fetch post data to get owner and title
        const postRef = doc(db, collectionName, postId);
        const postSnap = await getDoc(postRef);
        if (postSnap.exists()) {
          const postData = postSnap.data();
          const currentUserDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
          const currentUserData = currentUserDoc.exists() ? currentUserDoc.data() : {};

          // Get current comment count (after adding)
          const currentCommentCount = comments.length + 1;

          // Trigger notification observer
          await notifyCommentEvent({
            postId: postId,
            postTitle: postData.name || postData.title || 'Untitled Post',
            postType: collectionName === 'routes' ? PostType.ROUTE : PostType.RECOMMENDATION,
            postOwnerId: postData.userId,
            actorId: auth.currentUser.uid,
            actorName: currentUserData.displayName || 'Anonymous',
            actorAvatar: currentUserData.photoURL || null,
            currentCommentCount: currentCommentCount,
          });
        }
      } catch (notificationError) {
        console.error('Error sending comment notification:', notificationError);
        // Don't fail the comment operation if notification fails
      }
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
          <Text style={common.commentHeaderTitle}>תגובות ({comments.length})</Text>
          <TouchableOpacity onPress={() => setIsNewestFirst(!isNewestFirst)}>
            <Text style={common.commentSortText}>
                {isNewestFirst ? 'מיין: חדש קודם ⬇' : 'מיין: ישן קודם ⬆'}
            </Text>
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
        <TextInput
          style={common.commentInput}
          placeholder="כתוב תגובה..."
          value={newComment}
          onChangeText={setNewComment}
          multiline
        />
        <TouchableOpacity 
          style={[common.commentSendButton, (!newComment.trim() || submitting) && common.commentSendDisabled]} 
          onPress={handleAddComment}
          disabled={!newComment.trim() || submitting}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="send" size={20} color="#fff" />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default CommentsSection;
