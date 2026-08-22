import React, {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  startAfter,
  where,
} from 'firebase/firestore';

import AppText from './AppText';
import AppTextInput from './AppTextInput';
import { Avatar } from './Avatar';
import ReportButton from '../features/moderation/components/ReportButton';
import { db } from '../config/firebase';
import { colors, commentStyles as styles } from '../styles';
import { formatTimestamp } from '../utils/formatTimestamp';
import { deleteComment, saveComment } from '../services/SocialService';
import { useAuth } from '../features/auth/AuthContext';
import { AUTH_STATES, CAPABILITIES } from '../constants/authPolicy';
import { useBlockedUsers } from '../features/moderation/BlockedUsersContext';

const PAGE_SIZE = 20;

function targetType(collectionName) {
  if (collectionName === 'routes') return 'route';
  if (collectionName === 'trips') return 'trip';
  return 'recommendation';
}

function timestampMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  if (value instanceof Date) return value.getTime();
  return Number(value) || 0;
}

export function mergeUniqueComments(...groups) {
  const byId = new Map();
  groups.flat().filter(Boolean).forEach((item) => byId.set(item.id, item));
  return Array.from(byId.values());
}

export function sortRepliesAscending(items) {
  return [...items].sort((left, right) => timestampMillis(left.createdAt) - timestampMillis(right.createdAt));
}

export function commentWasEdited(item) {
  return timestampMillis(item?.updatedAt) > timestampMillis(item?.createdAt) + 1000;
}

function CommentItem({
  item,
  collectionName,
  postId,
  currentUid,
  isReply = false,
  highlighted = false,
  replyTargetName = '',
  onReply,
  onEdit,
  onDelete,
  deleting = false,
}) {
  const name = item.authorPreview?.displayName || 'Traveler';
  const own = Boolean(currentUid && item.authorId === currentUid);
  const openOwnActions = () => {
    Alert.alert('אפשרויות תגובה', '', [
      { text: 'עריכה', onPress: () => onEdit(item) },
      { text: 'מחיקה', style: 'destructive', onPress: () => onDelete(item) },
      { text: 'ביטול', style: 'cancel' },
    ]);
  };

  return (
    <View
      style={[
        styles.commentRow,
        isReply && styles.replyRow,
        highlighted && styles.highlighted,
      ]}
      accessibilityLabel={highlighted ? 'התגובה שנפתחה מההתראה' : undefined}
      testID={highlighted ? `highlighted-comment-${item.id}` : `comment-${item.id}`}
    >
      <Avatar
        photoURL={item.authorPreview?.photoURL || null}
        displayName={name}
        size={isReply ? 32 : 40}
      />
      <View style={styles.commentBody}>
        <View style={styles.metaRow}>
          <AppText style={styles.author}>{name}</AppText>
          <AppText style={styles.time}>{formatTimestamp(item.createdAt)}</AppText>
          {commentWasEdited(item) ? <AppText style={styles.edited}>נערכה</AppText> : null}
        </View>
        {isReply && replyTargetName ? (
          <AppText style={styles.replyingTo}>בתגובה ל{replyTargetName}</AppText>
        ) : null}
        <AppText style={styles.commentText}>{item.text}</AppText>
        <View style={styles.actions}>
          <Pressable
            style={styles.actionButton}
            onPress={() => onReply(item)}
            accessibilityRole="button"
            accessibilityLabel={`השב/י ל${name}`}
            testID={`reply-comment-${item.id}`}
          >
            <AppText style={styles.actionText}>השב/י</AppText>
          </Pressable>
          {own ? (
            <Pressable
              style={styles.actionButton}
              onPress={openOwnActions}
              disabled={deleting}
              accessibilityRole="button"
              accessibilityLabel="אפשרויות לתגובה שלך"
              testID={`comment-actions-${item.id}`}
            >
              {deleting
                ? <ActivityIndicator size="small" color={colors.textSecondary} />
                : <Ionicons name="ellipsis-horizontal" size={20} color={colors.textSecondary} />}
            </Pressable>
          ) : (
            <ReportButton
              target={{
                type: 'comment',
                parentType: targetType(collectionName),
                parentId: postId,
                id: item.id,
              }}
              ownerId={item.authorId}
              compact
            />
          )}
        </View>
      </View>
    </View>
  );
}

function ThreadReplies({
  root,
  collectionName,
  postId,
  currentUid,
  isBlocked,
  focusedReply,
  onReply,
  onEdit,
  onDelete,
  deletingIds,
}) {
  const [liveReplies, setLiveReplies] = useState([]);
  const [olderReplies, setOlderReplies] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const loadedOlderRef = useRef(false);

  const subscribe = useCallback(() => {
    setLoading(true);
    setError(false);
    const repliesQuery = query(
      collection(db, collectionName, postId, 'comments'),
      where('status', '==', 'active'),
      where('threadType', '==', 'reply'),
      where('threadRootId', '==', root.id),
      orderBy('createdAt', 'asc'),
      limit(PAGE_SIZE)
    );
    return onSnapshot(
      repliesQuery,
      (snapshot) => {
        const items = snapshot.docs
          .map((entry) => ({ id: entry.id, ...entry.data() }))
          .filter((entry) => !isBlocked(entry.authorId));
        setLiveReplies(items);
        if (!loadedOlderRef.current) setCursor(snapshot.docs[snapshot.docs.length - 1] || null);
        setHasMore(snapshot.size === PAGE_SIZE);
        setLoading(false);
      },
      () => {
        setError(true);
        setLoading(false);
      }
    );
  }, [collectionName, isBlocked, postId, root.id]);

  useEffect(() => {
    const unsubscribe = subscribe();
    return unsubscribe;
  }, [subscribe]);

  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await getDocs(query(
        collection(db, collectionName, postId, 'comments'),
        where('status', '==', 'active'),
        where('threadType', '==', 'reply'),
        where('threadRootId', '==', root.id),
        orderBy('createdAt', 'asc'),
        startAfter(cursor),
        limit(PAGE_SIZE)
      ));
      loadedOlderRef.current = true;
      setOlderReplies((current) => mergeUniqueComments(current, page.docs
        .map((entry) => ({ id: entry.id, ...entry.data() }))
        .filter((entry) => !isBlocked(entry.authorId))));
      setCursor(page.docs[page.docs.length - 1] || cursor);
      setHasMore(page.size === PAGE_SIZE);
    } catch (_error) {
      setError(true);
    } finally {
      setLoadingMore(false);
    }
  };

  const replies = useMemo(() => sortRepliesAscending(mergeUniqueComments(
    liveReplies,
    olderReplies,
    focusedReply && focusedReply.threadRootId === root.id ? [focusedReply] : []
  )), [focusedReply, liveReplies, olderReplies, root.id]);
  const names = useMemo(() => new Map([
    [root.id, root.authorPreview?.displayName || 'Traveler'],
    ...replies.map((entry) => [entry.id, entry.authorPreview?.displayName || 'Traveler']),
  ]), [replies, root]);

  if (loading) {
    return <ActivityIndicator style={{ marginVertical: 12 }} color={colors.primary} />;
  }
  return (
    <View testID={`replies-${root.id}`}>
      {error ? <AppText style={styles.replyError}>לא הצלחנו לטעון את כל התשובות.</AppText> : null}
      {replies.map((reply) => (
        <CommentItem
          key={reply.id}
          item={reply}
          collectionName={collectionName}
          postId={postId}
          currentUid={currentUid}
          isReply
          highlighted={reply.id === focusedReply?.id}
          replyTargetName={names.get(reply.replyToCommentId) || ''}
          onReply={onReply}
          onEdit={onEdit}
          onDelete={onDelete}
          deleting={deletingIds.has(reply.id)}
        />
      ))}
      {hasMore ? (
        <Pressable style={styles.loadMore} onPress={loadMore} disabled={loadingMore}>
          {loadingMore
            ? <ActivityIndicator size="small" color={colors.primary} />
            : <AppText style={styles.loadMoreText}>הצג/י תשובות נוספות</AppText>}
        </Pressable>
      ) : null}
    </View>
  );
}

export const CommentsSection = ({ collectionName, postId, initialCommentId = null, bottomInset = 0 }) => {
  const { isBlocked } = useBlockedUsers();
  const {
    user: authUser,
    status,
    isActive,
    ensureCapability,
    handleCallableAuthError,
  } = useAuth();
  const [liveRoots, setLiveRoots] = useState([]);
  const [olderRoots, setOlderRoots] = useState([]);
  const [rootCursor, setRootCursor] = useState(null);
  const [hasMoreRoots, setHasMoreRoots] = useState(false);
  const [rootsLoading, setRootsLoading] = useState(true);
  const [rootsLoadingMore, setRootsLoadingMore] = useState(false);
  const [rootsError, setRootsError] = useState(false);
  const [rootsRetryToken, setRootsRetryToken] = useState(0);
  const [focused, setFocused] = useState({ root: null, target: null });
  const [targetMissing, setTargetMissing] = useState(false);
  const [expandedRoots, setExpandedRoots] = useState(() => new Set());
  const [draft, setDraft] = useState('');
  const [composerMode, setComposerMode] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingIds, setDeletingIds] = useState(() => new Set());
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const loadedOlderRootsRef = useRef(false);

  const target = useMemo(() => ({ type: targetType(collectionName), id: postId }), [collectionName, postId]);

  const subscribeRoots = useCallback(() => {
    setRootsLoading(true);
    setRootsError(false);
    const rootsQuery = query(
      collection(db, collectionName, postId, 'comments'),
      where('status', '==', 'active'),
      where('threadType', '==', 'root'),
      orderBy('createdAt', 'desc'),
      limit(PAGE_SIZE)
    );
    return onSnapshot(
      rootsQuery,
      (snapshot) => {
        setLiveRoots(snapshot.docs
          .map((entry) => ({ id: entry.id, ...entry.data() }))
          .filter((entry) => !isBlocked(entry.authorId)));
        if (!loadedOlderRootsRef.current) setRootCursor(snapshot.docs[snapshot.docs.length - 1] || null);
        setHasMoreRoots(snapshot.size === PAGE_SIZE);
        setRootsLoading(false);
      },
      () => {
        setRootsError(true);
        setRootsLoading(false);
      }
    );
  }, [collectionName, isBlocked, postId]);

  useEffect(() => {
    const unsubscribe = subscribeRoots();
    return unsubscribe;
  }, [rootsRetryToken, subscribeRoots]);

  useEffect(() => {
    let active = true;
    setFocused({ root: null, target: null });
    setTargetMissing(false);
    if (!initialCommentId) return () => { active = false; };
    (async () => {
      try {
        const selectedSnapshot = await getDoc(doc(db, collectionName, postId, 'comments', initialCommentId));
        if (!active) return;
        const selected = selectedSnapshot.exists ? { id: selectedSnapshot.id, ...selectedSnapshot.data() } : null;
        if (!selected || selected.status !== 'active' || isBlocked(selected.authorId)) {
          setTargetMissing(true);
          return;
        }
        const rootId = selected.threadType === 'reply' ? selected.threadRootId : selected.id;
        const rootSnapshot = rootId === selected.id
          ? selectedSnapshot
          : await getDoc(doc(db, collectionName, postId, 'comments', rootId));
        if (!active) return;
        const root = rootSnapshot.exists ? { id: rootSnapshot.id, ...rootSnapshot.data() } : null;
        if (!root || root.status !== 'active' || isBlocked(root.authorId)) {
          setTargetMissing(true);
          return;
        }
        setFocused({ root, target: selected });
        if (selected.threadType === 'reply') {
          setExpandedRoots((current) => new Set(current).add(root.id));
        }
      } catch (_error) {
        if (active) setTargetMissing(true);
      }
    })();
    return () => { active = false; };
  }, [collectionName, initialCommentId, isBlocked, postId]);

  const roots = useMemo(() => mergeUniqueComments(
    liveRoots,
    olderRoots,
    focused.root ? [focused.root] : []
  ).sort((left, right) => timestampMillis(right.createdAt) - timestampMillis(left.createdAt)), [focused.root, liveRoots, olderRoots]);

  useEffect(() => {
    if (!focused.root) return undefined;
    const index = roots.findIndex((entry) => entry.id === focused.root.id);
    if (index < 0) return undefined;
    const timer = setTimeout(() => {
      listRef.current?.scrollToIndex?.({ index, animated: true, viewPosition: 0.35 });
    }, 100);
    return () => clearTimeout(timer);
  }, [focused.root, roots]);

  const loadMoreRoots = async () => {
    if (!rootCursor || rootsLoadingMore) return;
    setRootsLoadingMore(true);
    try {
      const page = await getDocs(query(
        collection(db, collectionName, postId, 'comments'),
        where('status', '==', 'active'),
        where('threadType', '==', 'root'),
        orderBy('createdAt', 'desc'),
        startAfter(rootCursor),
        limit(PAGE_SIZE)
      ));
      loadedOlderRootsRef.current = true;
      setOlderRoots((current) => mergeUniqueComments(current, page.docs
        .map((entry) => ({ id: entry.id, ...entry.data() }))
        .filter((entry) => !isBlocked(entry.authorId))));
      setRootCursor(page.docs[page.docs.length - 1] || rootCursor);
      setHasMoreRoots(page.size === PAGE_SIZE);
    } catch (_error) {
      setRootsError(true);
    } finally {
      setRootsLoadingMore(false);
    }
  };

  const beginReply = async (item) => {
    if (!await ensureCapability(CAPABILITIES.ACTIVE)) return;
    setComposerMode({ type: 'reply', item });
    setDraft('');
    setTimeout(() => inputRef.current?.focus?.(), 0);
  };
  const beginEdit = async (item) => {
    if (!await ensureCapability(CAPABILITIES.ACTIVE)) return;
    setComposerMode({ type: 'edit', item });
    setDraft(item.text || '');
    setTimeout(() => inputRef.current?.focus?.(), 0);
  };
  const cancelComposerMode = () => {
    setComposerMode(null);
    setDraft('');
  };

  const submit = async () => {
    const text = draft.trim();
    if (!text || submitting) return;
    if (!await ensureCapability(CAPABILITIES.ACTIVE)) return;
    setSubmitting(true);
    try {
      await saveComment(target, text, composerMode?.type === 'edit'
        ? { commentId: composerMode.item.id }
        : composerMode?.type === 'reply'
          ? { replyToCommentId: composerMode.item.id }
          : {});
      setDraft('');
      setComposerMode(null);
    } catch (error) {
      if (!handleCallableAuthError(error)) {
        Alert.alert('התגובה לא נשלחה', 'אפשר לנסות שוב בעוד כמה רגעים.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (item) => {
    if (!await ensureCapability(CAPABILITIES.ACTIVE)) return;
    const root = item.threadType !== 'reply';
    Alert.alert(
      root ? 'מחיקת שרשור' : 'מחיקת תגובה',
      root
        ? 'התגובה וכל התשובות שמתחתיה יימחקו לצמיתות.'
        : 'התגובה תימחק לצמיתות.',
      [
        { text: 'ביטול', style: 'cancel' },
        {
          text: 'מחיקה',
          style: 'destructive',
          onPress: async () => {
            setDeletingIds((current) => new Set(current).add(item.id));
            try {
              await deleteComment(target, item.id);
              if (composerMode?.item?.id === item.id) cancelComposerMode();
            } catch (error) {
              if (!handleCallableAuthError(error)) {
                Alert.alert('התגובה לא נמחקה', 'אפשר לנסות שוב בעוד כמה רגעים.');
              }
            } finally {
              setDeletingIds((current) => {
                const next = new Set(current);
                next.delete(item.id);
                return next;
              });
            }
          },
        },
      ]
    );
  };

  const toggleRoot = (rootId) => setExpandedRoots((current) => {
    const next = new Set(current);
    if (next.has(rootId)) next.delete(rootId);
    else next.add(rootId);
    return next;
  });

  const renderRoot = ({ item }) => {
    const expanded = expandedRoots.has(item.id);
    const replyCount = Math.max(0, Math.trunc(Number(item.replyCount) || 0));
    return (
      <Fragment>
        <CommentItem
          item={item}
          collectionName={collectionName}
          postId={postId}
          currentUid={authUser?.uid}
          highlighted={item.id === focused.target?.id}
          onReply={beginReply}
          onEdit={beginEdit}
          onDelete={remove}
          deleting={deletingIds.has(item.id)}
        />
        {replyCount > 0 ? (
          <Pressable
            style={styles.threadToggle}
            onPress={() => toggleRoot(item.id)}
            accessibilityRole="button"
            accessibilityLabel={expanded ? 'הסתרת תשובות' : `הצגת ${replyCount} תשובות`}
            testID={`toggle-replies-${item.id}`}
          >
            <View style={styles.threadLine} />
            <AppText style={styles.threadToggleText}>
              {expanded ? 'הסתרת תשובות' : `הצגת ${replyCount} תשובות`}
            </AppText>
          </Pressable>
        ) : null}
        {expanded ? (
          <ThreadReplies
            root={item}
            collectionName={collectionName}
            postId={postId}
            currentUid={authUser?.uid}
            isBlocked={isBlocked}
            focusedReply={focused.target?.threadType === 'reply' ? focused.target : null}
            onReply={beginReply}
            onEdit={beginEdit}
            onDelete={remove}
            deletingIds={deletingIds}
          />
        ) : null}
      </Fragment>
    );
  };

  const contextName = composerMode?.item?.authorPreview?.displayName || 'Traveler';
  const placeholder = status === AUTH_STATES.GUEST
    ? 'התחבר/י כדי להגיב…'
    : !isActive
      ? 'השלימו את החשבון כדי להגיב…'
      : composerMode?.type === 'reply'
        ? `תגובה ל${contextName}…`
        : composerMode?.type === 'edit'
          ? 'עריכת התגובה…'
          : 'כתיבת תגובה…';

  return (
    <View style={styles.section} testID="comments-section">
      {targetMissing ? (
        <View style={styles.notice} accessibilityRole="alert" testID="comment-target-missing">
          <AppText style={styles.noticeText}>התגובה שאליה הפנתה ההתראה כבר אינה זמינה.</AppText>
        </View>
      ) : null}
      {rootsLoading ? (
        <View style={styles.centerState} testID="comments-loading">
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : rootsError && !roots.length ? (
        <View style={styles.centerState} testID="comments-error">
          <Ionicons name="cloud-offline-outline" size={30} color={colors.textSecondary} />
          <AppText style={styles.stateTitle}>לא הצלחנו לטעון תגובות</AppText>
          <Pressable style={styles.retry} onPress={() => setRootsRetryToken((value) => value + 1)}>
            <AppText style={styles.retryText}>ניסיון נוסף</AppText>
          </Pressable>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={roots}
          renderItem={renderRoot}
          keyExtractor={(item) => item.id}
          style={styles.list}
          contentContainerStyle={[styles.listContent, !roots.length && styles.listContentEmpty]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          removeClippedSubviews={Platform.OS !== 'web'}
          windowSize={7}
          ListEmptyComponent={(
            <View style={styles.centerState} testID="comments-empty">
              <Ionicons name="chatbubbles-outline" size={34} color={colors.textMuted} />
              <AppText style={styles.stateTitle}>עדיין אין תגובות</AppText>
              <AppText style={styles.stateText}>אפשר להתחיל את השיחה כאן.</AppText>
            </View>
          )}
          ListFooterComponent={hasMoreRoots ? (
            <Pressable style={styles.loadMore} onPress={loadMoreRoots} disabled={rootsLoadingMore}>
              {rootsLoadingMore
                ? <ActivityIndicator size="small" color={colors.primary} />
                : <AppText style={styles.loadMoreText}>טעינת תגובות קודמות</AppText>}
            </Pressable>
          ) : null}
          onScrollToIndexFailed={({ averageItemLength, index }) => {
            listRef.current?.scrollToOffset?.({
              offset: Math.max(0, Number(averageItemLength || 0) * index),
              animated: false,
            });
          }}
        />
      )}

      <View style={[styles.composerShell, { paddingBottom: Math.max(8, bottomInset) }]} testID="comment-composer">
        {composerMode ? (
          <View style={styles.composerContext} testID="comment-composer-context">
            <AppText style={styles.composerContextText}>
              {composerMode.type === 'edit' ? 'עריכת התגובה שלך' : `משיבים ל${contextName}`}
            </AppText>
            <Pressable
              style={styles.headerSide}
              onPress={cancelComposerMode}
              accessibilityRole="button"
              accessibilityLabel="ביטול מצב תגובה"
            >
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </Pressable>
          </View>
        ) : null}
        <View style={styles.composerRow}>
          <Avatar
            photoURL={authUser?.photoURL}
            displayName={authUser?.displayName}
            size={36}
          />
          <View style={styles.inputWrap}>
            <AppTextInput
              ref={inputRef}
              style={styles.input}
              placeholder={placeholder}
              placeholderTextColor={colors.placeholder}
              value={draft}
              onChangeText={setDraft}
              multiline
              maxLength={2000}
              editable={!submitting}
              accessibilityLabel="כתיבת תגובה"
              testID="comment-input"
            />
          </View>
          <Pressable
            style={[styles.send, (!draft.trim() || submitting || !isActive) && styles.sendDisabled]}
            onPress={submit}
            disabled={!draft.trim() || submitting}
            accessibilityRole="button"
            accessibilityLabel="שליחת תגובה"
            testID="comment-send"
          >
            {submitting
              ? <ActivityIndicator size="small" color={colors.white} />
              : <Ionicons name="arrow-up" size={21} color={colors.white} />}
          </Pressable>
        </View>
      </View>
    </View>
  );
};

export default CommentsSection;
