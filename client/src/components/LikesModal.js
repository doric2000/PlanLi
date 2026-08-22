import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
} from 'firebase/firestore';

import { db } from '../config/firebase';
import { common, colors, fontFamilies, layout, spacing } from '../styles';
import AppText from './AppText';
import { Avatar } from './Avatar';

const PAGE_SIZE = 30;
const ALLOWED_COLLECTIONS = new Set(['recommendations', 'routes', 'trips']);

function likesQuery(collectionName, itemId, cursor = null) {
  const constraints = [orderBy('createdAt', 'desc')];
  if (cursor) constraints.push(startAfter(cursor));
  constraints.push(limit(PAGE_SIZE));
  return query(collection(db, collectionName, itemId, 'likes'), ...constraints);
}

function normalizedUser(entry) {
  return {
    id: entry.id,
    displayName: entry.data()?.userPreview?.displayName || 'מטייל/ת',
    photoURL: entry.data()?.userPreview?.photoURL || null,
  };
}

function mergeUsers(current, incoming) {
  const byId = new Map(current.map((user) => [user.id, user]));
  incoming.forEach((user) => byId.set(user.id, user));
  return [...byId.values()];
}

function normalizeLikeCount(value) {
  if (value === null || value === undefined || value === '') return null;
  const count = Number(value);
  return Number.isFinite(count) && count >= 0 ? count : null;
}

function likeCountLabel(count) {
  if (count === null) return 'לייקים';
  return count === 1 ? '1 לייק' : `${count} לייקים`;
}

const LikesModal = ({ visible, onClose, collectionName, itemId, likeCount = null }) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [currentCount, setCurrentCount] = useState(normalizeLikeCount(likeCount));
  const [retryVersion, setRetryVersion] = useState(0);
  const requestRef = useRef(0);

  const validTarget = visible
    && ALLOWED_COLLECTIONS.has(collectionName)
    && typeof itemId === 'string'
    && itemId.length > 0
    && itemId.length <= 180
    && !itemId.includes('/');

  useEffect(() => {
    const requestId = ++requestRef.current;
    if (!visible) {
      setUsers([]);
      setLoading(false);
      setLoadingMore(false);
      setError('');
      setCursor(null);
      setHasMore(false);
      setCurrentCount(normalizeLikeCount(likeCount));
      return undefined;
    }
    if (!validTarget) {
      setUsers([]);
      setLoading(false);
      setLoadingMore(false);
      setError('לא ניתן לטעון את רשימת הלייקים.');
      setCursor(null);
      setHasMore(false);
      setCurrentCount(normalizeLikeCount(likeCount));
      return undefined;
    }

    setUsers([]);
    setLoading(true);
    setLoadingMore(false);
    setError('');
    setCursor(null);
    setHasMore(false);
    setCurrentCount(normalizeLikeCount(likeCount));

    Promise.all([
      getDocs(likesQuery(collectionName, itemId)),
      getDoc(doc(db, collectionName, itemId)),
    ]).then(([snapshot, contentSnapshot]) => {
      if (requestRef.current !== requestId) return;
      const page = snapshot.docs.map(normalizedUser);
      const authoritativeCount = normalizeLikeCount(contentSnapshot.data()?.stats?.likeCount);
      setUsers(page);
      setCursor(snapshot.docs[snapshot.docs.length - 1] || null);
      setHasMore(snapshot.docs.length === PAGE_SIZE);
      if (authoritativeCount !== null) {
        setCurrentCount(authoritativeCount);
      }
    }).catch(() => {
      if (requestRef.current !== requestId) return;
      setError('לא הצלחנו לטעון את רשימת הלייקים. נסו שוב.');
    }).finally(() => {
      if (requestRef.current === requestId) setLoading(false);
    });

    return () => {
      if (requestRef.current === requestId) requestRef.current += 1;
    };
  }, [collectionName, itemId, likeCount, retryVersion, validTarget, visible]);

  const loadMore = useCallback(() => {
    if (!validTarget || loading || loadingMore || !hasMore || !cursor) return;
    const requestId = requestRef.current;
    setLoadingMore(true);
    getDocs(likesQuery(collectionName, itemId, cursor)).then((snapshot) => {
      if (requestRef.current !== requestId) return;
      const page = snapshot.docs.map(normalizedUser);
      setUsers((current) => mergeUsers(current, page));
      setCursor(snapshot.docs[snapshot.docs.length - 1] || null);
      setHasMore(snapshot.docs.length === PAGE_SIZE);
    }).catch(() => {
      if (requestRef.current !== requestId) return;
      setError('לא הצלחנו לטעון לייקים נוספים. נסו שוב.');
      setHasMore(false);
    }).finally(() => {
      if (requestRef.current === requestId) setLoadingMore(false);
    });
  }, [collectionName, cursor, hasMore, itemId, loading, loadingMore, validTarget]);

  const renderUser = ({ item }) => (
    <View style={common.userItem} testID={`likes-user-${item.id}`}>
      <Avatar photoURL={item.photoURL} displayName={item.displayName} size={44} />
      <AppText style={common.userNameText}>{item.displayName}</AppText>
      <Ionicons name="heart" size={16} color={colors.heart} />
    </View>
  );

  const retry = () => {
    setError('');
    setRetryVersion((value) => value + 1);
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={common.modalOverlay}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="סגירת רשימת הלייקים"
          style={common.overlayTouchable}
          onPress={onClose}
        />
        <View style={common.likesModalContainer}>
          <View style={common.handleBar} />
          <View style={common.likesHeader}>
            <AppText style={common.likesTitle}>{likeCountLabel(currentCount)}</AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="סגירת רשימת הלייקים"
              onPress={onClose}
              style={modalStyles.closeButton}
              testID="likes-modal-close"
            >
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </Pressable>
          </View>
          <View style={common.likesContent}>
            {loading ? (
              <View style={common.loadingContainer} testID="likes-modal-loading">
                <ActivityIndicator size="large" color={colors.brand} />
              </View>
            ) : error && !users.length ? (
              <View style={modalStyles.state} testID="likes-modal-error">
                <AppText style={modalStyles.stateText}>{error}</AppText>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="ניסיון נוסף לטעינת הלייקים"
                  onPress={retry}
                  style={modalStyles.retryButton}
                  testID="likes-modal-retry"
                >
                  <AppText style={modalStyles.retryText}>ניסיון נוסף</AppText>
                </Pressable>
              </View>
            ) : (
              <FlatList
                data={users}
                renderItem={renderUser}
                keyExtractor={(item) => item.id}
                ListEmptyComponent={<AppText style={common.emptyText}>אין עדיין לייקים</AppText>}
                ListFooterComponent={loadingMore ? (
                  <View style={modalStyles.footer} testID="likes-modal-loading-more">
                    <ActivityIndicator size="small" color={colors.brand} />
                  </View>
                ) : error ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="ניסיון נוסף לטעינת לייקים נוספים"
                    onPress={retry}
                    style={modalStyles.inlineRetry}
                    testID="likes-modal-more-retry"
                  >
                    <AppText style={modalStyles.stateText}>{error}</AppText>
                  </Pressable>
                ) : null}
                onEndReached={loadMore}
                onEndReachedThreshold={0.4}
                showsVerticalScrollIndicator={false}
                testID="likes-modal-list"
              />
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const modalStyles = StyleSheet.create({
  closeButton: {
    position: 'absolute',
    left: spacing.md,
    width: layout.touchTarget,
    height: layout.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: layout.touchTarget / 2,
  },
  state: {
    flex: 1,
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  stateText: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.medium,
    fontSize: 14,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  retryButton: {
    minHeight: layout.touchTarget,
    marginTop: spacing.md,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: colors.brand,
  },
  retryText: {
    color: colors.white,
    fontFamily: fontFamilies.semiBold,
    fontSize: 14,
  },
  footer: {
    minHeight: layout.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineRetry: {
    minHeight: layout.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default LikesModal;
