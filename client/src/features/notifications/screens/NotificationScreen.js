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
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppText from '../../../components/AppText';
import { Avatar } from '../../../components/Avatar';
import LikesModal from '../../../components/LikesModal';
import SegmentedTabs from '../../../components/SegmentedTabs';
import { useAuthUser } from '../../../hooks/useAuthUser';
import { openAuthFlow } from '../../../navigation/authNavigation';
import { signOutCentral } from '../../../services/AuthService';
import { colors } from '../../../styles';
import {
  NotificationCard,
  NotificationStatusSheet,
} from '../components';
import { useNotificationCenter } from '../context/NotificationCenterContext';
import {
  buildNotificationRouteAction,
  buildNotificationLikesTarget,
  buildStatusActionForError,
  notificationRequiresAvailabilityCheck,
  NotificationChannel,
} from '../models/NotificationModel';
import { resolveNotificationTargetAvailability } from '../services/NotificationService';
import { notificationCenterStyles as styles } from '../styles/notificationCenterStyles';

const safeRouteId = (value) => (
  typeof value === 'string' && value.length > 0 && value.length <= 180 && !value.includes('/')
    ? value
    : ''
);

const RECENT_ADMIN_AUTH_SECONDS = 10 * 60;

export function hasRecentTotpAdminAuthentication(tokenResult, nowMs = Date.now()) {
  const authTime = Number(tokenResult?.claims?.auth_time || 0);
  const secondFactor = tokenResult?.claims?.firebase?.sign_in_second_factor;
  return authTime > 0
    && nowMs / 1000 - authTime <= RECENT_ADMIN_AUTH_SECONDS
    && secondFactor === 'totp';
}

function requiresRecentAdminAuthentication(error) {
  const reason = String(
    error?.details?.reason || error?.customData?.details?.reason || ''
  ).toLowerCase();
  return reason === 'recent_sign_in_required' || reason === 'totp_required';
}

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
  const { markChannelRead, resolveNotification } = center;
  const [channel, setChannel] = useState(
    initialChannel === NotificationChannel.ADMIN
      ? NotificationChannel.ADMIN
      : NotificationChannel.PERSONAL
  );
  const [openSwipeId, setOpenSwipeId] = useState(null);
  const [statusAction, setStatusAction] = useState(null);
  const [likesTarget, setLikesTarget] = useState(null);
  const [resolvingPush, setResolvingPush] = useState(false);
  const mountedRef = useRef(true);
  const openingRef = useRef(new Set());
  const handledPushRef = useRef(new Set());
  const pushRequestRef = useRef(0);

  const channelState = center.channels[channel];
  const visibleNotifications = channelState.items;
  const channelMutationBusy = Boolean(
    center.pendingActions[`channel:${channel}:read`]
    || center.pendingActions[`channel:${channel}:delete`]
  );

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
    setOpenSwipeId(null);
    setLikesTarget(null);
  }, [channel]);

  const showAdminReauthentication = useCallback(() => {
    setStatusAction({
      type: 'status',
      reason: 'admin_reauthentication_required',
      title: 'נדרשת התחברות מחדש',
      message: 'כדי לסמן את התראות הניהול כנקראו, יש להתחבר מחדש ולאשר קוד מאפליקציית האימות.',
      actionLabel: 'התחברות מחדש',
      actionTestID: 'notification-admin-reauthenticate',
      onAction: () => {
        setStatusAction(null);
        Promise.resolve(signOutCentral())
          .then(() => openAuthFlow(navigation, 'Login'))
          .catch(() => {
            if (mountedRef.current) {
              setStatusAction({
                type: 'status',
                reason: 'admin_reauthentication_failed',
                title: 'לא הצלחנו להתחבר מחדש',
                message: 'אפשר לנסות שוב בעוד כמה רגעים.',
              });
            }
          });
      },
    });
  }, [navigation]);

  useFocusEffect(useCallback(() => {
    let active = true;
    markChannelRead(NotificationChannel.PERSONAL).catch(() => {});
    if (
      channel === NotificationChannel.ADMIN
      && !center.adminLoading
      && center.isAdmin
    ) {
      Promise.resolve(user?.getIdTokenResult?.())
        .then((tokenResult) => {
          if (!active) return;
          if (!hasRecentTotpAdminAuthentication(tokenResult)) {
            showAdminReauthentication();
            return;
          }
          markChannelRead(NotificationChannel.ADMIN).catch((error) => {
            if (active && requiresRecentAdminAuthentication(error)) {
              showAdminReauthentication();
            }
          });
        })
        .catch(() => {
          if (active) showAdminReauthentication();
        });
    }
    return () => {
      active = false;
      setOpenSwipeId(null);
    };
  }, [
    center.adminLoading,
    center.isAdmin,
    channel,
    markChannelRead,
    showAdminReauthentication,
    user,
  ]));

  const openNotification = useCallback(async (notification, pushRequestId = null) => {
    if (!notification?.id || openingRef.current.has(notification.id)) return;
    openingRef.current.add(notification.id);
    try {
      if (!mountedRef.current) return;
      const action = buildNotificationRouteAction(notification);
      if (action.type === 'status') {
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
      if (onOpenAction) {
        await onOpenAction(action, notification);
      } else {
        navigation.navigate(action.routeName, action.params);
      }
    } catch (error) {
      if (mountedRef.current) setStatusAction(buildStatusActionForError(error));
    } finally {
      openingRef.current.delete(notification.id);
    }
  }, [navigation, onOpenAction, resolveTargetAvailability]);

  const openNotificationLikes = useCallback(async (notification) => {
    if (!notification?.id || openingRef.current.has(notification.id)) return;
    openingRef.current.add(notification.id);
    try {
      const target = buildNotificationLikesTarget(notification);
      if (!target) {
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
        setStatusAction(buildStatusActionForError({
          reason: availability?.reason || 'unavailable',
        }));
        return;
      }

      setLikesTarget(target);
    } finally {
      openingRef.current.delete(notification.id);
    }
  }, [resolveTargetAvailability]);

  const openActorProfile = useCallback(async (notification, actor) => {
    const actorId = safeRouteId(actor?.id);
    if (!notification?.id || !actorId || openingRef.current.has(notification.id)) return;
    openingRef.current.add(notification.id);
    try {
      navigation.navigate('UserProfile', { uid: actorId });
    } finally {
      openingRef.current.delete(notification.id);
    }
  }, [navigation]);

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

  const deleteNotification = useCallback((notification) => {
    if (!notification?.id) return;
    setOpenSwipeId(null);
    confirmDestructive(
      'מחיקת ההתראה',
      'ההתראה תימחק לצמיתות ולא ניתן יהיה לשחזר אותה.',
      'מחיקה',
      () => center.deleteOne(notification).catch(() => {})
    );
  }, [center]);

  const tabs = useMemo(() => [
    {
      key: NotificationChannel.PERSONAL,
      label: 'אישי',
      icon: 'person',
    },
    {
      key: NotificationChannel.ADMIN,
      label: 'ניהול',
      icon: 'admin-panel-settings',
    },
  ], []);

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
      {center.isAdmin ? (
        <View style={styles.controls}>
          <SegmentedTabs
            tabs={tabs}
            value={channel}
            onChange={setChannel}
            style={styles.channelTabs}
            testID="notification-channel-tabs"
          />
        </View>
      ) : null}
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
    <GestureHandlerRootView style={styles.screen}>
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
                  onDeletePress={deleteNotification}
                  isSwipeOpen={openSwipeId === item.id}
                  onSwipeOpen={() => setOpenSwipeId(item.id)}
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
              onScrollBeginDrag={() => setOpenSwipeId(null)}
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

        <NotificationStatusSheet
          action={statusAction}
          visible={Boolean(statusAction)}
          onClose={() => setStatusAction(null)}
          onRetry={statusAction?.onRetry}
        />
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}
