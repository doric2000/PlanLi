import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useAdminClaim } from '../../../hooks/useAdminClaim';
import { useAuthUser } from '../../../hooks/useAuthUser';
import { useBlockedUsers } from '../../moderation/BlockedUsersContext';
import { safeNotificationError } from '../notificationErrors';
import {
  NOTIFICATION_SCHEMA_VERSION,
  NotificationChannel,
  NotificationFilter,
  NotificationType,
  normalizeNotificationFilter,
  notificationMatchesFilter,
} from '../models/NotificationModel';
import {
  clearNotificationChannel,
  deleteNotificationById,
  getNotificationById,
  getNotificationPage,
  getNotificationState,
  markNotificationChannelRead,
  setNotificationRead,
  subscribeToNotificationPage,
  subscribeToNotificationState,
} from '../services/NotificationService';

const CHANNELS = [NotificationChannel.PERSONAL, NotificationChannel.ADMIN];

const emptyChannelState = () => ({
  items: [],
  loading: false,
  refreshing: false,
  loadingMore: false,
  error: '',
  cursor: null,
  hasMore: true,
  loaded: false,
});

const emptyChannels = () => ({
  [NotificationChannel.PERSONAL]: emptyChannelState(),
  [NotificationChannel.ADMIN]: emptyChannelState(),
});

const emptyActiveFilters = () => ({
  [NotificationChannel.PERSONAL]: NotificationFilter.ALL,
  [NotificationChannel.ADMIN]: NotificationFilter.ALL,
});

const itemTime = (item) => item?.createdAt?.getTime?.() || 0;

function compareNotificationOrder(left, right) {
  const timeDifference = itemTime(right) - itemTime(left);
  if (timeDifference) return timeDifference;
  if (left.id === right.id) return 0;
  return left.id < right.id ? 1 : -1;
}

function dedupeAndSort(items) {
  const seen = new Set();
  return items
    .filter((item) => {
      if (!item?.id || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .sort(compareNotificationOrder);
}

export function notificationAfterBlockFilter(notification, isBlocked) {
  if (!notification || typeof isBlocked !== 'function') return notification || null;
  const directActorId = notification.actorId || notification.actorPreview?.id;
  if (notification.type === NotificationType.COMMENT && isBlocked(directActorId)) return null;
  if (notification.type !== NotificationType.LIKE) {
    return isBlocked(directActorId) ? null : notification;
  }
  const actors = (notification.actorPreviews || []).filter((actor) => !isBlocked(actor?.id));
  const removedActors = Math.max(0, (notification.actorPreviews || []).length - actors.length);
  if (!removedActors && !isBlocked(directActorId)) return notification;
  const count = Math.max(0, Number(notification.count || 1) - removedActors);
  if (!count || (!actors.length && directActorId && isBlocked(directActorId))) return null;
  return {
    ...notification,
    count,
    actorId: actors[0]?.id || '',
    actorPreview: actors[0] || null,
    actorPreviews: actors,
  };
}

export const NotificationCenterContext = createContext(null);

export function NotificationCenterProvider({ children }) {
  const { user } = useAuthUser();
  const { isBlocked } = useBlockedUsers();
  const { isAdmin, loading: adminLoading } = useAdminClaim();
  const uid = user?.uid || null;
  const [channels, setChannels] = useState(emptyChannels);
  const [activeFilters, setActiveFilters] = useState(emptyActiveFilters);
  const [unreadCounts, setUnreadCounts] = useState({ personal: 0, admin: 0 });
  const [pendingActions, setPendingActions] = useState({});
  const [mutationError, setMutationError] = useState('');
  const [retryEpochs, setRetryEpochs] = useState({ personal: 0, admin: 0 });
  const channelsRef = useRef(channels);
  const activeFiltersRef = useRef(activeFilters);
  const activeUidRef = useRef(uid);
  const sessionRef = useRef(0);
  const headIdsRef = useRef({ personal: new Set(), admin: new Set() });
  const refreshRequestRef = useRef({ personal: 0, admin: 0 });
  const pageRequestRef = useRef({ personal: 0, admin: 0 });
  const pendingPromisesRef = useRef({});
  const optimisticReadRef = useRef(0);
  const notificationStateRevisionRef = useRef(0);
  const stateResyncRequestRef = useRef(0);
  const isAdminRef = useRef(isAdmin);
  isAdminRef.current = isAdmin;

  const filterBlockedPage = useCallback((page) => ({
    ...page,
    items: (page?.items || [])
      .map((item) => notificationAfterBlockFilter(item, isBlocked))
      .filter(Boolean),
  }), [isBlocked]);

  const setChannelState = useCallback((channel, updater) => {
    setChannels((current) => {
      const previous = current[channel] || emptyChannelState();
      const nextChannel = typeof updater === 'function' ? updater(previous) : { ...previous, ...updater };
      const next = { ...current, [channel]: nextChannel };
      channelsRef.current = next;
      return next;
    });
  }, []);

  useEffect(() => {
    sessionRef.current += 1;
    activeUidRef.current = uid;
    headIdsRef.current = { personal: new Set(), admin: new Set() };
    refreshRequestRef.current = {
      personal: refreshRequestRef.current.personal + 1,
      admin: refreshRequestRef.current.admin + 1,
    };
    pageRequestRef.current = {
      personal: pageRequestRef.current.personal + 1,
      admin: pageRequestRef.current.admin + 1,
    };
    pendingPromisesRef.current = {};
    notificationStateRevisionRef.current += 1;
    stateResyncRequestRef.current += 1;
    const nextFilters = emptyActiveFilters();
    activeFiltersRef.current = nextFilters;
    setActiveFilters(nextFilters);
    const next = emptyChannels();
    channelsRef.current = next;
    setChannels(next);
    setUnreadCounts({ personal: 0, admin: 0 });
    setPendingActions({});
    setMutationError('');
  }, [uid]);

  const applyHeadPage = useCallback((channel, filter, page) => {
    const nextHeadIds = new Set(page.items.map((item) => item.id));
    const previousHeadIds = headIdsRef.current[channel];
    const boundaryItem = page.items[page.items.length - 1];
    setChannelState(channel, (current) => {
      const currentItems = current.items
        .map((item) => notificationAfterBlockFilter(item, isBlocked))
        .filter(Boolean);
      const tail = page.hasMore ? currentItems.filter((item) => {
        if (nextHeadIds.has(item.id)) return false;
        if (!previousHeadIds.has(item.id)) return true;
        // A full query can push its oldest rows beyond the realtime window.
        // Rows missing from the middle/newer side of the prior head vanished
        // from the query and must not be retained as an artificial tail.
        return page.hasMore
          && boundaryItem
          && compareNotificationOrder(item, boundaryItem) >= 0;
      }) : [];
      const hasOlderPage = tail.length > 0;
      return {
        ...current,
        items: dedupeAndSort([...page.items, ...tail]),
        cursor: hasOlderPage ? current.cursor : page.cursor,
        hasMore: hasOlderPage ? current.hasMore : page.hasMore,
        loading: false,
        refreshing: false,
        error: '',
        loaded: true,
      };
    });
    headIdsRef.current[channel] = nextHeadIds;
  }, [isBlocked, setChannelState]);

  const startChannelSubscription = useCallback((channel, filter) => {
    if (!uid) return undefined;
    const session = sessionRef.current;
    setChannelState(channel, (current) => ({
      ...current,
      loading: !current.loaded,
      error: '',
    }));
    return subscribeToNotificationPage(
      uid,
      channel,
      (page) => {
        if (
          activeUidRef.current !== uid
          || sessionRef.current !== session
          || activeFiltersRef.current[channel] !== filter
        ) return;
        applyHeadPage(channel, filter, filterBlockedPage(page));
      },
      (error) => {
        if (
          activeUidRef.current !== uid
          || sessionRef.current !== session
          || activeFiltersRef.current[channel] !== filter
        ) return;
        setChannelState(channel, (current) => ({
          ...current,
          loading: false,
          refreshing: false,
          error: safeNotificationError(error, 'לא הצלחנו לטעון את ההתראות. נסו שוב.'),
          loaded: true,
        }));
      },
      { filter }
    );
  }, [applyHeadPage, filterBlockedPage, setChannelState, uid]);

  useEffect(() => startChannelSubscription(
    NotificationChannel.PERSONAL,
    activeFilters[NotificationChannel.PERSONAL]
  ), [
    activeFilters.personal,
    retryEpochs.personal,
    startChannelSubscription,
  ]);

  useEffect(() => {
    if (!isAdmin) {
      const empty = emptyChannelState();
      headIdsRef.current.admin = new Set();
      setChannelState(NotificationChannel.ADMIN, empty);
      return undefined;
    }
    return startChannelSubscription(
      NotificationChannel.ADMIN,
      activeFilters[NotificationChannel.ADMIN]
    );
  }, [
    activeFilters.admin,
    isAdmin,
    retryEpochs.admin,
    setChannelState,
    startChannelSubscription,
  ]);

  useEffect(() => {
    if (!uid) return undefined;
    const session = sessionRef.current;
    return subscribeToNotificationState(uid, (state) => {
      if (activeUidRef.current !== uid || sessionRef.current !== session) return;
      notificationStateRevisionRef.current += 1;
      setUnreadCounts({
        personal: state.personalUnread,
        admin: isAdmin ? state.adminUnread : 0,
      });
    }, () => {
      // The list remains usable if only the denormalized badge document fails.
    });
  }, [isAdmin, uid]);

  const resyncUnreadCounts = useCallback(async (expectedUid, expectedSession) => {
    const requestId = ++stateResyncRequestRef.current;
    const startingRevision = notificationStateRevisionRef.current;
    try {
      const state = await getNotificationState(expectedUid);
      if (
        activeUidRef.current !== expectedUid
        || sessionRef.current !== expectedSession
        || stateResyncRequestRef.current !== requestId
        || notificationStateRevisionRef.current !== startingRevision
      ) return false;
      setUnreadCounts({
        personal: state.personalUnread,
        admin: isAdminRef.current ? state.adminUnread : 0,
      });
      return true;
    } catch {
      return false;
    }
  }, []);

  const setActiveFilter = useCallback((channel, requestedFilter) => {
    if (!CHANNELS.includes(channel)) return false;
    const filter = normalizeNotificationFilter(channel, requestedFilter);
    if (activeFiltersRef.current[channel] === filter) return false;
    activeFiltersRef.current = { ...activeFiltersRef.current, [channel]: filter };
    headIdsRef.current[channel] = new Set();
    refreshRequestRef.current[channel] += 1;
    pageRequestRef.current[channel] += 1;
    setChannelState(channel, { ...emptyChannelState(), loading: true });
    setActiveFilters((current) => ({ ...current, [channel]: filter }));
    return true;
  }, [setChannelState]);

  const retry = useCallback((channel) => {
    if (channel === NotificationChannel.ADMIN && !isAdmin) return;
    setRetryEpochs((current) => ({ ...current, [channel]: current[channel] + 1 }));
  }, [isAdmin]);

  const refresh = useCallback(async (channel) => {
    if (!uid || (channel === NotificationChannel.ADMIN && !isAdmin)) return false;
    const filter = activeFiltersRef.current[channel];
    const session = sessionRef.current;
    const requestId = ++refreshRequestRef.current[channel];
    ++pageRequestRef.current[channel];
    setChannelState(channel, (current) => ({
      ...current,
      refreshing: true,
      loadingMore: false,
      error: '',
    }));
    try {
      const page = filterBlockedPage(await getNotificationPage(uid, channel, { filter }));
      if (
        activeUidRef.current !== uid
        || sessionRef.current !== session
        || activeFiltersRef.current[channel] !== filter
        || refreshRequestRef.current[channel] !== requestId
      ) return false;
      headIdsRef.current[channel] = new Set(page.items.map((item) => item.id));
      setChannelState(channel, (current) => ({
        ...current,
        items: page.items,
        cursor: page.cursor,
        hasMore: page.hasMore,
        loading: false,
        refreshing: false,
        loadingMore: false,
        error: '',
        loaded: true,
      }));
      return true;
    } catch (error) {
      if (
        activeUidRef.current === uid
        && sessionRef.current === session
        && activeFiltersRef.current[channel] === filter
        && refreshRequestRef.current[channel] === requestId
      ) {
        setChannelState(channel, (current) => ({
          ...current,
          refreshing: false,
          error: safeNotificationError(error, 'לא הצלחנו לרענן את ההתראות. נסו שוב.'),
        }));
      }
      return false;
    }
  }, [filterBlockedPage, isAdmin, setChannelState, uid]);

  const loadMore = useCallback(async (channel) => {
    const current = channelsRef.current[channel];
    const filter = activeFiltersRef.current[channel];
    if (
      !uid
      || current.loadingMore
      || !current.hasMore
      || !current.cursor
      || (channel === NotificationChannel.ADMIN && !isAdmin)
    ) return false;
    const session = sessionRef.current;
    const requestId = ++pageRequestRef.current[channel];
    const refreshId = refreshRequestRef.current[channel];
    setChannelState(channel, { loadingMore: true, error: '' });
    try {
      const page = filterBlockedPage(
        await getNotificationPage(uid, channel, { cursor: current.cursor, filter })
      );
      if (
        activeUidRef.current !== uid
        || sessionRef.current !== session
        || activeFiltersRef.current[channel] !== filter
        || pageRequestRef.current[channel] !== requestId
        || refreshRequestRef.current[channel] !== refreshId
      ) return false;
      setChannelState(channel, (latest) => ({
        ...latest,
        items: dedupeAndSort([...latest.items, ...page.items]),
        cursor: page.cursor || latest.cursor,
        hasMore: page.hasMore,
        loadingMore: false,
      }));
      return true;
    } catch (error) {
      if (
        activeUidRef.current === uid
        && sessionRef.current === session
        && activeFiltersRef.current[channel] === filter
        && pageRequestRef.current[channel] === requestId
      ) {
        setChannelState(channel, (latest) => ({
          ...latest,
          loadingMore: false,
          error: safeNotificationError(error, 'לא הצלחנו לטעון התראות נוספות.'),
        }));
      }
      return false;
    }
  }, [filterBlockedPage, isAdmin, setChannelState, uid]);

  const patchItem = useCallback((channel, notificationId, updater) => {
    setChannelState(channel, (current) => ({
      ...current,
      items: current.items.map((item) => (
        item.id === notificationId ? updater(item) : item
      )),
    }));
  }, [setChannelState]);

  const runPending = useCallback((key, operation) => {
    if (pendingPromisesRef.current[key]) return pendingPromisesRef.current[key];
    const session = sessionRef.current;
    setPendingActions((current) => ({ ...current, [key]: true }));
    const promise = Promise.resolve()
      .then(operation)
      .finally(() => {
        if (sessionRef.current === session) {
          setPendingActions((current) => ({ ...current, [key]: false }));
        }
        if (pendingPromisesRef.current[key] === promise) delete pendingPromisesRef.current[key];
      });
    pendingPromisesRef.current[key] = promise;
    return promise;
  }, []);

  const setRead = useCallback((notification, read = true) => {
    if (!notification?.id || !uid || notification.isRead === read) return Promise.resolve(false);
    const { channel, id } = notification;
    if (
      pendingPromisesRef.current[`channel:${channel}:read`]
      || pendingPromisesRef.current[`channel:${channel}:delete`]
    ) return Promise.resolve(false);
    const key = `item:${id}`;
    return runPending(key, async () => {
      const session = sessionRef.current;
      const delta = read ? -1 : 1;
      const mutationToken = `${session}:${++optimisticReadRef.current}`;
      setMutationError('');
      patchItem(channel, id, (item) => ({
        ...item,
        isRead: read,
        _notificationMutationToken: mutationToken,
      }));
      setUnreadCounts((current) => ({
        ...current,
        [channel]: Math.max(0, current[channel] + delta),
      }));
      try {
        await setNotificationRead(id, read);
        if (sessionRef.current === session && activeUidRef.current === uid) {
          patchItem(channel, id, (item) => {
            if (item._notificationMutationToken !== mutationToken) return item;
            const { _notificationMutationToken, ...settled } = item;
            return settled;
          });
        }
        return true;
      } catch (error) {
        if (sessionRef.current === session && activeUidRef.current === uid) {
          patchItem(channel, id, (item) => {
            if (item._notificationMutationToken !== mutationToken) return item;
            const { _notificationMutationToken, ...settled } = item;
            return { ...settled, isRead: !read };
          });
          setMutationError(safeNotificationError(error));
          await resyncUnreadCounts(uid, session);
        }
        throw error;
      }
    });
  }, [patchItem, resyncUnreadCounts, runPending, uid]);

  const deleteOne = useCallback((notification) => {
    if (!notification?.id || !uid) return Promise.resolve(false);
    const { channel, id } = notification;
    if (
      pendingPromisesRef.current[`channel:${channel}:read`]
      || pendingPromisesRef.current[`channel:${channel}:delete`]
    ) return Promise.resolve(false);
    return runPending(`item:${id}`, async () => {
      const session = sessionRef.current;
      setMutationError('');
      try {
        await deleteNotificationById(id);
        if (sessionRef.current !== session || activeUidRef.current !== uid) return false;
        setChannelState(channel, (current) => ({
          ...current,
          items: current.items.filter((item) => item.id !== id),
        }));
        return true;
      } catch (error) {
        if (sessionRef.current === session && activeUidRef.current === uid) {
          setMutationError(safeNotificationError(error));
        }
        throw error;
      }
    });
  }, [runPending, setChannelState, uid]);

  const markChannelRead = useCallback((channel) => {
    if (!uid || (channel === NotificationChannel.ADMIN && !isAdmin)) return Promise.resolve(false);
    if (pendingPromisesRef.current[`channel:${channel}:delete`]) return Promise.resolve(false);
    const itemIds = new Set(channelsRef.current[channel].items.map((item) => item.id));
    return runPending(`channel:${channel}:read`, async () => {
      const session = sessionRef.current;
      setMutationError('');
      try {
        await markNotificationChannelRead(channel);
        if (sessionRef.current !== session || activeUidRef.current !== uid) return false;
        setChannelState(channel, (current) => ({
          ...current,
          items: current.items.map((item) => (
            itemIds.has(item.id) ? { ...item, isRead: true } : item
          )),
        }));
        return true;
      } catch (error) {
        if (sessionRef.current === session && activeUidRef.current === uid) {
          setMutationError(safeNotificationError(error));
        }
        throw error;
      }
    });
  }, [isAdmin, runPending, setChannelState, uid]);

  const clearChannel = useCallback((channel) => {
    if (!uid || (channel === NotificationChannel.ADMIN && !isAdmin)) return Promise.resolve(false);
    if (pendingPromisesRef.current[`channel:${channel}:read`]) return Promise.resolve(false);
    const itemIds = new Set(channelsRef.current[channel].items.map((item) => item.id));
    return runPending(`channel:${channel}:delete`, async () => {
      const session = sessionRef.current;
      setMutationError('');
      try {
        await clearNotificationChannel(channel);
        if (sessionRef.current !== session || activeUidRef.current !== uid) return false;
        headIdsRef.current[channel] = new Set(
          [...headIdsRef.current[channel]].filter((id) => !itemIds.has(id))
        );
        setChannelState(channel, (current) => ({
          ...current,
          items: current.items.filter((item) => !itemIds.has(item.id)),
          cursor: null,
          hasMore: false,
        }));
        return true;
      } catch (error) {
        if (sessionRef.current === session && activeUidRef.current === uid) {
          setMutationError(safeNotificationError(error));
        }
        throw error;
      }
    });
  }, [isAdmin, runPending, setChannelState, uid]);

  const resolveNotification = useCallback(async (notificationId, expectedChannel) => {
    if (!uid || !notificationId) return null;
    const existing = CHANNELS
      .flatMap((channel) => channelsRef.current[channel].items)
      .find((item) => item.id === notificationId);
    if (existing) {
      const visible = notificationAfterBlockFilter(existing, isBlocked);
      return visible && (!expectedChannel || visible.channel === expectedChannel) ? visible : null;
    }
    if (expectedChannel === NotificationChannel.ADMIN && !isAdmin) return null;
    const session = sessionRef.current;
    const item = notificationAfterBlockFilter(
      await getNotificationById(uid, notificationId),
      isBlocked
    );
    if (
      !item
      || item.schemaVersion !== NOTIFICATION_SCHEMA_VERSION
      || sessionRef.current !== session
      || activeUidRef.current !== uid
      || (expectedChannel && item.channel !== expectedChannel)
      || (item.channel === NotificationChannel.ADMIN && !isAdmin)
    ) return null;
    const activeFilter = activeFiltersRef.current[item.channel];
    if (notificationMatchesFilter(item, activeFilter)) {
      setChannelState(item.channel, (current) => ({
        ...current,
        items: dedupeAndSort([item, ...current.items]),
      }));
    }
    return item;
  }, [isAdmin, isBlocked, setChannelState, uid]);

  const value = useMemo(() => ({
    channels,
    activeFilters,
    unreadCounts,
    totalUnread: unreadCounts.personal + (isAdmin ? unreadCounts.admin : 0),
    isAdmin,
    adminLoading,
    pendingActions,
    mutationError,
    clearMutationError: () => setMutationError(''),
    setActiveFilter,
    retry,
    refresh,
    loadMore,
    setRead,
    deleteOne,
    markChannelRead,
    clearChannel,
    resolveNotification,
  }), [
    adminLoading,
    activeFilters,
    channels,
    clearChannel,
    deleteOne,
    isAdmin,
    loadMore,
    markChannelRead,
    mutationError,
    pendingActions,
    refresh,
    resolveNotification,
    retry,
    setRead,
    setActiveFilter,
    unreadCounts,
  ]);

  return (
    <NotificationCenterContext.Provider value={value}>
      {children}
    </NotificationCenterContext.Provider>
  );
}

export function useNotificationCenter() {
  const context = useContext(NotificationCenterContext);
  if (!context) throw new Error('useNotificationCenter must be used inside NotificationCenterProvider.');
  return context;
}

export function useNotificationChannel(channel = NotificationChannel.PERSONAL) {
  const center = useNotificationCenter();
  return {
    ...center.channels[channel],
    filter: center.activeFilters[channel],
    unreadCount: center.unreadCounts[channel] || 0,
    refresh: () => center.refresh(channel),
    retry: () => center.retry(channel),
    loadMore: () => center.loadMore(channel),
    markAllRead: () => center.markChannelRead(channel),
    clearAll: () => center.clearChannel(channel),
  };
}
