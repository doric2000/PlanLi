import React, {
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
  RefreshControl,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppText from '../../../components/AppText';
import { Avatar } from '../../../components/Avatar';
import LikesModal from '../../../components/LikesModal';
import SegmentedTabs from '../../../components/SegmentedTabs';
import { useAuthUser } from '../../../hooks/useAuthUser';
import { colors } from '../../../styles';
import {
  NotificationCard,
  NotificationChannelMenu,
  NotificationFilterChips,
  NotificationOverflowMenu,
  NotificationStatusSheet,
} from '../components';
import { useNotificationCenter } from '../context/NotificationCenterContext';
import {
  buildNotificationRouteAction,
  buildNotificationLikesTarget,
  buildStatusActionForError,
  getNotificationFilterOptions,
  notificationRequiresAvailabilityCheck,
  NotificationChannel,
  NotificationFilter,
} from '../models/NotificationModel';
import { resolveNotificationTargetAvailability } from '../services/NotificationService';
import { notificationCenterStyles as styles } from '../styles/notificationCenterStyles';

const CHANNEL_COPY = {
  [NotificationChannel.PERSONAL]: 'ההתראות שלי',
  [NotificationChannel.ADMIN]: 'התראות מנהלים',
};

const safeRouteId = (value) => (
  typeof value === 'string' && value.length > 0 && value.length <= 180 && !value.includes('/')
    ? value
    : ''
);

function confirmDestructive(title, message, confirmLabel, onConfirm) {
  if (
    Platform.OS === 'web'
    && typeof window !== 'undefined'
    && typeof window.confirm === 'function'
  ) {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'ביטול', style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
}

function CenterState({ icon, title, message, actionLabel, onAction, loading = false, testID }) {
  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole={loading ? 'progressbar' : 'summary'}
      style={styles.centeredState}
      testID={testID}
    >
      {loading ? (
        <ActivityIndicator size="large" color={colors.brand} />
      ) : (
        <Ionicons name={icon} size={56} color={colors.textMuted} />
      )}
      <AppText style={styles.stateTitle}>{title}</AppText>
      {message ? <AppText style={styles.stateMessage}>{message}</AppText> : null}
      {actionLabel ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          onPress={onAction}
          style={({ pressed }) => [styles.primaryButton, pressed && styles.rowPressed]}
          testID="notifications-retry"
        >
          <AppText style={styles.primaryButtonText}>{actionLabel}</AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

function ErrorBanner({ message, onDismiss, onRetry, testID }) {
  if (!message) return null;
  return (
    <View accessibilityLiveRegion="assertive" style={styles.inlineBanner} testID={testID}>
      <Ionicons name="alert-circle-outline" size={20} color={colors.error} />
      <AppText style={styles.inlineBannerText} numberOfLines={3}>{message}</AppText>
      {onRetry ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="ניסיון נוסף"
          onPress={onRetry}
          style={styles.iconButton}
        >
          <Ionicons name="refresh" size={20} color={colors.brand} />
        </Pressable>
      ) : null}
      {onDismiss ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="סגירת הודעת השגיאה"
          onPress={onDismiss}
          style={styles.iconButton}
        >
          <Ionicons name="close" size={20} color={colors.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

export default function NotificationScreen({
  navigation: navigationProp,
  route,
  onOpenAction,
  onProfilePress,
  resolveTargetAvailability = resolveNotificationTargetAvailability,
  initialChannel = NotificationChannel.PERSONAL,
}) {
  const navigationHook = useNavigation();
  const navigation = navigationProp || navigationHook;
  const { user } = useAuthUser();
  const center = useNotificationCenter();
  const { resolveNotification, setRead } = center;
  const [channel, setChannel] = useState(
    initialChannel === NotificationChannel.ADMIN
      ? NotificationChannel.ADMIN
      : NotificationChannel.PERSONAL
  );
  const [notificationMenuTarget, setNotificationMenuTarget] = useState(null);
  const [channelMenuVisible, setChannelMenuVisible] = useState(false);
  const [statusAction, setStatusAction] = useState(null);
  const [likesTarget, setLikesTarget] = useState(null);
  const [resolvingPush, setResolvingPush] = useState(false);
  const mountedRef = useRef(true);
  const openingRef = useRef(new Set());
  const handledPushRef = useRef(new Set());
  const pushRequestRef = useRef(0);

  const channelState = center.channels[channel];
  const unreadCount = center.unreadCounts[channel] || 0;
  const channelMutationBusy = Boolean(
    center.pendingActions[`channel:${channel}:read`]
    || center.pendingActions[`channel:${channel}:delete`]
  );
  const activeFilter = center.activeFilters?.[channel] || NotificationFilter.ALL;
  const filterOptions = useMemo(
    () => getNotificationFilterOptions(channel, unreadCount),
    [channel, unreadCount]
  );
  const visibleNotifications = channelState.items;
  const selectedNotification = useMemo(() => {
    if (!notificationMenuTarget) return null;
    return center.channels[notificationMenuTarget.channel]?.items.find(
      (item) => item.id === notificationMenuTarget.id
    ) || null;
  }, [center.channels, notificationMenuTarget]);

  useEffect(() => () => {
    mountedRef.current = false;
    pushRequestRef.current += 1;
  }, []);

  useEffect(() => {
    if (!center.adminLoading && !center.isAdmin && channel === NotificationChannel.ADMIN) {
      setChannel(NotificationChannel.PERSONAL);
    }
  }, [center.adminLoading, center.isAdmin, channel]);

  useEffect(() => {
    setNotificationMenuTarget(null);
    setChannelMenuVisible(false);
    setLikesTarget(null);
  }, [channel]);

  useEffect(() => {
    if (notificationMenuTarget && !selectedNotification) setNotificationMenuTarget(null);
  }, [notificationMenuTarget, selectedNotification]);

  const openNotification = useCallback(async (notification, pushRequestId = null) => {
    if (!notification?.id || openingRef.current.has(notification.id)) return;
    openingRef.current.add(notification.id);
    try {
      const markRead = () => (!notification.isRead
        ? setRead(notification, true).catch(() => false)
        : Promise.resolve(false));
      if (!mountedRef.current) return;
      const action = buildNotificationRouteAction(notification);
      if (action.type === 'status') {
        await markRead();
        setStatusAction(action);
        return;
      }
      if (notificationRequiresAvailabilityCheck(notification)) {
        let availability;
        try {
          availability = await resolveTargetAvailability(notification);
        } catch (error) {
          if (
            mountedRef.current
            && (pushRequestId === null || pushRequestRef.current === pushRequestId)
          ) {
            setStatusAction({
              ...buildStatusActionForError(error),
              onRetry: () => {
                setStatusAction(null);
                void openNotification(notification);
              },
            });
          }
          return;
        }
        if (
          !mountedRef.current
          || (pushRequestId !== null && pushRequestRef.current !== pushRequestId)
        ) return;
        if (availability?.available !== true) {
          await markRead();
          setStatusAction(buildStatusActionForError({
            reason: availability?.reason || 'unavailable',
          }));
          return;
        }
      }
      if (
        !mountedRef.current
        || (pushRequestId !== null && pushRequestRef.current !== pushRequestId)
      ) return;
      const readPromise = markRead();
      if (onOpenAction) {
        await onOpenAction(action, notification);
      } else {
        navigation.navigate(action.routeName, action.params);
      }
      await readPromise;
    } catch (error) {
      if (mountedRef.current) setStatusAction(buildStatusActionForError(error));
    } finally {
      openingRef.current.delete(notification.id);
    }
  }, [navigation, onOpenAction, resolveTargetAvailability, setRead]);

  const openNotificationLikes = useCallback(async (notification) => {
    if (!notification?.id || openingRef.current.has(notification.id)) return;
    openingRef.current.add(notification.id);
    const markRead = () => (!notification.isRead
      ? setRead(notification, true).catch(() => false)
      : Promise.resolve(false));
    try {
      const target = buildNotificationLikesTarget(notification);
      if (!target) {
        await markRead();
        if (mountedRef.current) setStatusAction(buildStatusActionForError({ reason: 'unsupported' }));
        return;
      }

      let availability;
      try {
        availability = await resolveTargetAvailability(notification);
      } catch (error) {
        if (mountedRef.current) {
          setStatusAction({
            ...buildStatusActionForError(error),
            onRetry: () => {
              setStatusAction(null);
              void openNotificationLikes(notification);
            },
          });
        }
        return;
      }
      if (!mountedRef.current) return;
      if (availability?.available !== true) {
        await markRead();
        setStatusAction(buildStatusActionForError({
          reason: availability?.reason || 'unavailable',
        }));
        return;
      }

      setLikesTarget(target);
      await markRead();
    } finally {
      openingRef.current.delete(notification.id);
    }
  }, [resolveTargetAvailability, setRead]);

  const openActorProfile = useCallback(async (notification, actor) => {
    const actorId = safeRouteId(actor?.id);
    if (!notification?.id || !actorId || openingRef.current.has(notification.id)) return;
    openingRef.current.add(notification.id);
    try {
      const readPromise = !notification.isRead
        ? setRead(notification, true).catch(() => false)
        : Promise.resolve(false);
      navigation.navigate('UserProfile', { uid: actorId });
      await readPromise;
    } finally {
      openingRef.current.delete(notification.id);
    }
  }, [navigation, setRead]);

  useEffect(() => {
    const notificationId = safeRouteId(route?.params?.notificationId);
    const expectedChannel = route?.params?.channel;
    if (!notificationId) return undefined;
    if (
      expectedChannel !== NotificationChannel.PERSONAL
      && expectedChannel !== NotificationChannel.ADMIN
    ) {
      const key = `invalid:${notificationId}:${String(expectedChannel)}`;
      if (!handledPushRef.current.has(key)) {
        handledPushRef.current.add(key);
        setStatusAction(buildStatusActionForError({ reason: 'missing' }));
        navigation.setParams?.({ notificationId: undefined, channel: undefined });
        handledPushRef.current.delete(key);
      }
      return undefined;
    }
    if (expectedChannel === NotificationChannel.ADMIN && center.adminLoading) return undefined;

    const key = `${expectedChannel}:${notificationId}`;
    if (handledPushRef.current.has(key)) return undefined;
    handledPushRef.current.add(key);
    const requestId = ++pushRequestRef.current;
    let active = true;
    setResolvingPush(true);

    Promise.resolve(resolveNotification(notificationId, expectedChannel))
      .then(async (notification) => {
        if (!active || !mountedRef.current || requestId !== pushRequestRef.current) return;
        if (!notification) {
          setStatusAction(buildStatusActionForError({ reason: 'missing' }));
          return;
        }
        setChannel(notification.channel);
        await openNotification(notification, requestId);
      })
      .catch((error) => {
        if (active && mountedRef.current && requestId === pushRequestRef.current) {
          setStatusAction(buildStatusActionForError(error));
        }
      })
      .finally(() => {
        if (active && mountedRef.current && requestId === pushRequestRef.current) {
          setResolvingPush(false);
          navigation.setParams?.({ notificationId: undefined, channel: undefined });
        }
      });

    return () => {
      active = false;
      handledPushRef.current.delete(key);
    };
  }, [
    center.adminLoading,
    resolveNotification,
    openNotification,
    navigation,
    route?.params?.channel,
    route?.params?.notificationId,
  ]);

  const toggleSelectedRead = useCallback(() => {
    if (!selectedNotification) return;
    setNotificationMenuTarget(null);
    center.setRead(selectedNotification, !selectedNotification.isRead).catch(() => {});
  }, [center, selectedNotification]);

  const deleteSelected = useCallback(() => {
    if (!selectedNotification) return;
    const notification = selectedNotification;
    setNotificationMenuTarget(null);
    confirmDestructive(
      'מחיקת ההתראה',
      'ההתראה תימחק לצמיתות ולא ניתן יהיה לשחזר אותה.',
      'מחיקה',
      () => center.deleteOne(notification).catch(() => {})
    );
  }, [center, selectedNotification]);

  const markAllRead = useCallback(() => {
    setChannelMenuVisible(false);
    center.markChannelRead(channel).catch(() => {});
  }, [center, channel]);

  const clearChannel = useCallback(() => {
    setChannelMenuVisible(false);
    const channelLabel = CHANNEL_COPY[channel];
    confirmDestructive(
      `מחיקת ${channelLabel}`,
      'כל ההתראות בערוץ הזה יימחקו לצמיתות. ערוץ ההתראות השני לא יושפע.',
      'מחיקת הכול',
      () => center.clearChannel(channel).catch(() => {})
    );
  }, [center, channel]);

  const tabs = useMemo(() => [
    {
      key: NotificationChannel.PERSONAL,
      label: 'אישי',
      icon: 'person',
      count: center.unreadCounts.personal || undefined,
    },
    {
      key: NotificationChannel.ADMIN,
      label: 'ניהול',
      icon: 'admin-panel-settings',
      count: center.unreadCounts.admin || undefined,
    },
  ], [center.unreadCounts.admin, center.unreadCounts.personal]);

  const renderHeader = () => (
    <>
      <View style={styles.header}>
        <View style={styles.headerSide} testID="notifications-header-profile-slot">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="פתיחת הפרופיל שלי"
            onPress={() => {
              if (onProfilePress) onProfilePress(user);
              else if (user?.uid) navigation.navigate('UserProfile', { uid: user.uid });
            }}
            style={({ pressed }) => [styles.iconButton, pressed && styles.rowPressed]}
            testID="notifications-profile"
          >
            {user ? (
              <Avatar photoURL={user.photoURL} displayName={user.displayName} size={36} />
            ) : (
              <Ionicons name="person-circle-outline" size={34} color={colors.textSecondary} />
            )}
          </Pressable>
        </View>
        <View style={styles.headerTitleWrap}>
          <AppText style={styles.headerTitle}>התראות</AppText>
        </View>
        <View style={[styles.headerSide, styles.headerSideLeft]} testID="notifications-header-action-slot">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="הגדרות התראות"
            onPress={() => navigation.navigate('NotificationSettings')}
            style={({ pressed }) => [styles.iconButton, pressed && styles.rowPressed]}
            testID="notifications-settings"
          >
            <Ionicons name="settings-outline" size={23} color={colors.textPrimary} />
          </Pressable>
        </View>
      </View>
      <View style={styles.controls}>
        {center.isAdmin ? (
          <SegmentedTabs
            tabs={tabs}
            value={channel}
            onChange={setChannel}
            style={styles.channelTabs}
            testID="notification-channel-tabs"
          />
        ) : null}
        <NotificationFilterChips
          options={filterOptions}
          value={activeFilter}
          onChange={(nextFilter) => center.setActiveFilter(channel, nextFilter)}
        />
        <View style={styles.summaryRow}>
          <AppText style={styles.summaryText}>
            {unreadCount > 0 ? `${unreadCount} לא נקראו` : 'הכול נקרא'}
          </AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`ניהול ${CHANNEL_COPY[channel]}`}
            onPress={() => setChannelMenuVisible(true)}
            style={({ pressed }) => [styles.iconButton, pressed && styles.rowPressed]}
            testID="notification-channel-menu"
          >
            <Ionicons name="ellipsis-horizontal-circle-outline" size={24} color={colors.brand} />
          </Pressable>
        </View>
      </View>
    </>
  );

  const renderEmpty = () => {
    if (channelState.error && !channelState.items.length) {
      return (
        <CenterState
          icon="cloud-offline-outline"
          title="לא הצלחנו לטעון את ההתראות"
          message={channelState.error}
          actionLabel="ניסיון נוסף"
          onAction={() => center.retry(channel)}
          testID="notifications-error-state"
        />
      );
    }
    if (activeFilter !== NotificationFilter.ALL) {
      return (
        <CenterState
          icon="filter-outline"
          title="אין התאמות למסנן הזה"
          message="אפשר לבחור מסנן אחר כדי לראות התראות נוספות."
          actionLabel="הצגת הכול"
          onAction={() => center.setActiveFilter(channel, NotificationFilter.ALL)}
          testID="notifications-filter-empty-state"
        />
      );
    }
    return (
      <CenterState
        icon={channel === NotificationChannel.ADMIN ? 'shield-checkmark-outline' : 'notifications-outline'}
        title={channel === NotificationChannel.ADMIN ? 'אין משימות מנהל חדשות' : 'אין התראות חדשות'}
        message={channel === NotificationChannel.ADMIN
          ? 'דיווחים ובקשות לבקרת יעדים יופיעו כאן.'
          : 'לייקים, תגובות ועדכונים חשובים יופיעו כאן.'}
        testID="notifications-empty-state"
      />
    );
  };

  const renderFooter = () => {
    if (!channelState.loadingMore) return <View style={styles.footer} />;
    return (
      <View accessibilityRole="progressbar" style={styles.footer} testID="notifications-loading-more">
        <ActivityIndicator size="small" color={colors.brand} />
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        {renderHeader()}
        {resolvingPush ? (
          <View accessibilityLiveRegion="polite" accessibilityRole="progressbar" style={styles.inlineBanner}>
            <ActivityIndicator size="small" color={colors.brand} />
            <AppText style={styles.inlineBannerText}>פותחים את ההתראה שבחרת…</AppText>
          </View>
        ) : null}
        <ErrorBanner
          message={center.mutationError}
          onDismiss={center.clearMutationError}
          testID="notifications-mutation-error"
        />
        {channelState.error && channelState.items.length ? (
          <ErrorBanner
            message={channelState.error}
            onRetry={() => center.retry(channel)}
            testID="notifications-list-error"
          />
        ) : null}

        {channelState.loading && !channelState.loaded ? (
          <CenterState
            loading
            title="טוענים את ההתראות"
            message="עוד רגע הכול יהיה מוכן."
            testID="notifications-loading-state"
          />
        ) : (
          <FlatList
            data={visibleNotifications}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <NotificationCard
                notification={item}
                busy={channelMutationBusy || Boolean(center.pendingActions[`item:${item.id}`])}
                onTargetPress={openNotification}
                onLikesPress={openNotificationLikes}
                onActorPress={openActorProfile}
                onMenuPress={(notification) => setNotificationMenuTarget({
                  id: notification.id,
                  channel: notification.channel,
                })}
              />
            )}
            contentContainerStyle={[
              styles.listContent,
              !visibleNotifications.length && styles.listContentEmpty,
            ]}
            ListEmptyComponent={renderEmpty}
            ListFooterComponent={renderFooter}
            refreshControl={(
              <RefreshControl
                refreshing={channelState.refreshing}
                onRefresh={() => center.refresh(channel)}
                colors={[colors.brand]}
                tintColor={colors.brand}
              />
            )}
            onEndReached={() => center.loadMore(channel)}
            onEndReachedThreshold={0.35}
            showsVerticalScrollIndicator={false}
            testID="notifications-list"
          />
        )}
      </View>

      <LikesModal
        visible={Boolean(likesTarget)}
        onClose={() => setLikesTarget(null)}
        collectionName={likesTarget?.collectionName}
        itemId={likesTarget?.itemId}
      />

      <NotificationOverflowMenu
        notification={selectedNotification}
        visible={Boolean(selectedNotification)}
        busy={Boolean(selectedNotification && center.pendingActions[`item:${selectedNotification.id}`])}
        onClose={() => setNotificationMenuTarget(null)}
        onToggleRead={toggleSelectedRead}
        onDelete={deleteSelected}
      />
      <NotificationChannelMenu
        channelLabel={CHANNEL_COPY[channel]}
        visible={channelMenuVisible}
        unreadCount={unreadCount}
        itemCount={channelState.items.length}
        readBusy={Boolean(center.pendingActions[`channel:${channel}:read`])}
        deleteBusy={Boolean(center.pendingActions[`channel:${channel}:delete`])}
        onClose={() => setChannelMenuVisible(false)}
        onMarkAllRead={markAllRead}
        onClear={clearChannel}
      />
      <NotificationStatusSheet
        action={statusAction}
        visible={Boolean(statusAction)}
        onClose={() => setStatusAction(null)}
        onRetry={statusAction?.onRetry}
      />
    </SafeAreaView>
  );
}
