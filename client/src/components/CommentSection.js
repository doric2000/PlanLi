import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  where,
  doc,
  getDoc,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { colors, common } from '../styles';
import { Avatar } from './Avatar';
import { formatTimestamp } from '../utils/formatTimestamp';
import { saveComment } from '../services/SocialService';
import { useAuth } from '../features/auth/AuthContext';
import { AUTH_STATES, CAPABILITIES } from '../constants/authPolicy';
import ReportButton from '../features/moderation/components/ReportButton';
import { useBlockedUsers } from '../features/moderation/BlockedUsersContext';

/**
 * CommentItem - Displays a single comment with user info.
 * 
 * Shows the commenter's avatar, name, and comment text.
 * Automatically fetches user data from Firebase based on userId.
 * 
 * @param {Object} item - Comment object containing userId and text
 */
const CommentItem = ({ item, collectionName, postId, highlighted = false }) => {
  const userData = {
    name: item.authorPreview?.displayName || 'Traveler',
    photo: item.authorPreview?.photoURL || null,
  };

  return (
    <View
      style={[
        common.commentItem,
        highlighted && {
          backgroundColor: '#FFF7ED',
          borderColor: colors.accentAction,
          borderWidth: 1,
          borderRadius: 12,
        },
      ]}
      accessibilityLabel={highlighted ? 'התגובה שנפתחה מההתראה' : undefined}
      testID={highlighted ? `highlighted-comment-${item.id}` : undefined}
    >
      <Avatar photoURL={userData.photo} displayName={userData.name} size={40} />
      <View style={common.commentContent}>
        <View style={{ alignItems: 'flex-end', marginBottom: 2 }}>
          <AppText style={common.commentUserName}>{userData.name}</AppText>
          <AppText style={[common.commentText, { color: '#9CA3AF', fontSize: 11 }]}>{formatTimestamp(item.createdAt)}</AppText>
        </View>
        <AppText style={common.commentText}>{item.text}</AppText>
      </View>
      <ReportButton
        target={{
          type: 'comment',
          parentType: collectionName === 'routes' ? 'route' : collectionName === 'trips' ? 'trip' : 'recommendation',
          parentId: postId,
          id: item.id,
        }}
        ownerId={item.authorId}
        compact
      />
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
export const CommentsSection = ({ collectionName, postId, initialCommentId = null }) => {
  const { isBlocked } = useBlockedUsers();
  const {
    user: authUser,
    status,
    isActive,
    ensureCapability,
    handleCallableAuthError,
  } = useAuth();
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [isNewestFirst, setIsNewestFirst] = useState(true);
  const [focusedComment, setFocusedComment] = useState(null);
  const [targetMissing, setTargetMissing] = useState(false);
  const listRef = useRef(null);
  const focusScrollRef = useRef({ key: '', failedOnce: false, timer: null });

  const canComment = isActive;

  useEffect(() => () => {
    if (focusScrollRef.current.timer) clearTimeout(focusScrollRef.current.timer);
  }, []);

  useEffect(() => {
    if (!postId || !collectionName) return;

    const commentsRef = collection(db, collectionName, postId, 'comments');
    const q = query(
      commentsRef,
      where('status', '==', 'active'),
      orderBy('createdAt', 'desc'),
      limit(30)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedComments = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setComments(fetchedComments.filter((item) => !isBlocked(item.authorId)));
    });

    return () => unsubscribe(); 
  }, [postId, collectionName, isBlocked]);

  useEffect(() => {
    let active = true;
    setFocusedComment(null);
    setTargetMissing(false);
    if (!postId || !collectionName || !initialCommentId) return () => { active = false; };

    getDoc(doc(db, collectionName, postId, 'comments', initialCommentId))
      .then((snapshot) => {
        if (!active) return;
        const data = snapshot.exists() ? snapshot.data() : null;
        if (!data || data.status !== 'active' || isBlocked(data.authorId)) {
          setTargetMissing(true);
          return;
        }
        setFocusedComment({ id: snapshot.id, ...data });
      })
      .catch(() => {
        if (active) setTargetMissing(true);
      });

    return () => { active = false; };
  }, [collectionName, initialCommentId, isBlocked, postId]);

  const sortedComments = useMemo(() => {
    const merged = focusedComment && !comments.some((item) => item.id === focusedComment.id)
      ? [...comments, focusedComment]
      : comments;
    return [...merged].sort((a, b) => {
        const dateA = a.createdAt?.seconds || 0;
        const dateB = b.createdAt?.seconds || 0;

        if (isNewestFirst) {
            return dateB - dateA;
        } else {
            return dateA - dateB;
        }
    });
  }, [comments, focusedComment, isNewestFirst]);

  useEffect(() => {
    if (!initialCommentId) return undefined;
    const index = sortedComments.findIndex((item) => item.id === initialCommentId);
    if (index < 0) return undefined;
    const key = `${collectionName}:${postId}:${initialCommentId}:${isNewestFirst}`;
    if (focusScrollRef.current.key === key) return undefined;
    if (focusScrollRef.current.timer) clearTimeout(focusScrollRef.current.timer);
    focusScrollRef.current = { key, failedOnce: false, timer: null };
    focusScrollRef.current.timer = setTimeout(() => {
      listRef.current?.scrollToIndex?.({ index, animated: true, viewPosition: 0.5 });
    }, 80);
    return undefined;
  }, [collectionName, initialCommentId, isNewestFirst, postId, sortedComments]);

  const handleAddComment = async () => {
    if (newComment.trim() === '') return;
    if (!await ensureCapability(CAPABILITIES.ACTIVE)) return;

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
      if (!handleCallableAuthError(error)) Alert.alert("Error", "Could not send comment");
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

      {targetMissing ? (
        <View
          style={{ paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#FFF7ED' }}
          accessibilityRole="alert"
          testID="comment-target-missing"
        >
          <AppText style={{ color: colors.textSecondary, textAlign: 'right' }}>
            התגובה שאליה הפנתה ההתראה כבר אינה זמינה.
          </AppText>
        </View>
      ) : null}

      <FlatList
        ref={listRef}
        data={sortedComments}
        renderItem={({ item }) => (
          <CommentItem
            item={item}
            collectionName={collectionName}
            postId={postId}
            highlighted={item.id === initialCommentId}
          />
        )}
        keyExtractor={item => item.id}
        style={common.commentList}
        nestedScrollEnabled={true}
        removeClippedSubviews={true}
        windowSize={5}
        onScrollToIndexFailed={({ index, highestMeasuredFrameIndex, averageItemLength }) => {
          if (focusScrollRef.current.failedOnce) return;
          focusScrollRef.current.failedOnce = true;
          const measuredIndex = Math.max(0, Math.min(index, highestMeasuredFrameIndex + 1));
          listRef.current?.scrollToOffset?.({
            offset: Math.max(0, Number(averageItemLength || 0) * measuredIndex),
            animated: false,
          });
          if (focusScrollRef.current.timer) clearTimeout(focusScrollRef.current.timer);
          focusScrollRef.current.timer = setTimeout(() => {
            listRef.current?.scrollToIndex?.({ index, animated: false, viewPosition: 0.5 });
          }, 100);
        }}
      />

      <View style={common.commentInputContainer}>
        <Avatar 
          photoURL={authUser?.photoURL}
          displayName={authUser?.displayName}
          size={32} 
        />
        <AppTextInput
          style={common.commentInput}
          placeholder={
            status === AUTH_STATES.GUEST
              ? 'התחבר/י כדי להגיב...'
              : !canComment
                ? 'השלימו את החשבון כדי להגיב...'
                : 'כתוב תגובה...'
          }
          value={newComment}
          onChangeText={setNewComment}
          multiline
          editable
        />
        <TouchableOpacity 
          style={[common.commentSendButton, (!newComment.trim() || submitting || !canComment) && common.commentSendDisabled]} 
          onPress={handleAddComment}
          disabled={!newComment.trim() || submitting}
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
