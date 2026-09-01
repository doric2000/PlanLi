import React, { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';

import AppText from '../../../components/AppText';
import { Avatar } from '../../../components/Avatar';
import { colors } from '../../../styles';
import { formatNotificationTime } from '../../../utils/formatNotificationTime';
import {
  getNotificationPresentation,
  NotificationType,
} from '../models/NotificationModel';
import { notificationCenterStyles as styles } from '../styles/notificationCenterStyles';

const toneStyle = {
  like: styles.typeBadgeLike,
  comment: styles.typeBadgeComment,
  system: styles.typeBadgeSystem,
  admin: styles.typeBadgeAdmin,
  urgent: styles.typeBadgeUrgent,
};

function TypeBadge({ presentation }) {
  return (
    <View style={[styles.typeBadge, toneStyle[presentation.tone]]}>
      <Ionicons name={presentation.icon} size={14} color={colors.white} />
    </View>
  );
}

function LeadingPreview({ notification, presentation, onPress, busy }) {
  const isSocial = notification.type === NotificationType.LIKE
    || notification.type === NotificationType.COMMENT;
  const thumbnail = notification.target?.thumbUrls?.[0];
  const contentLabel = notification.target?.type === 'route' ? 'המסלול' : 'ההמלצה';

  if (!isSocial) {
    return (
      <View
        style={styles.leadingPreview}
        importantForAccessibility="no-hide-descendants"
        testID={`notification-type-preview-${notification.id}`}
      >
        <View style={styles.leadingIconFallback}>
          <Ionicons
            name={presentation.icon}
            size={30}
            color={presentation.tone === 'urgent' ? colors.error : colors.brand}
          />
        </View>
        <TypeBadge presentation={presentation} />
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`פתיחת ${contentLabel} הקשורה להתראה`}
      accessibilityState={{ busy, disabled: busy }}
      disabled={busy}
      onPress={() => onPress?.(notification)}
      style={({ pressed }) => [styles.leadingPreview, pressed && styles.rowPressed]}
      testID={`notification-target-${notification.id}`}
    >
      {thumbnail ? (
        <Image
          accessibilityIgnoresInvertColors
          source={{ uri: thumbnail }}
          style={styles.targetPreviewImage}
          resizeMode="cover"
          testID={`notification-target-image-${notification.id}`}
        />
      ) : (
        <View
          style={styles.leadingIconFallback}
          testID={`notification-target-fallback-${notification.id}`}
        >
          <Ionicons
            name={notification.target?.type === 'route' ? 'map-outline' : 'image-outline'}
            size={28}
            color={colors.brand}
          />
        </View>
      )}
      <TypeBadge presentation={presentation} />
    </Pressable>
  );
}

function ActorStrip({ notification, onActorPress, busy }) {
  const actors = (notification.actorPreviews?.length
    ? notification.actorPreviews
    : [notification.actorPreview].filter(Boolean)).slice(0, 4);
  if (!actors.length) return null;

  return (
    <View
      style={styles.actorPreviewStrip}
      testID={`notification-actors-${notification.id}`}
    >
      {actors.map((actor, index) => {
        const actorStyle = [
          styles.actorPreviewItem,
          index > 0 && styles.actorPreviewItemOverlap,
          { zIndex: 4 - index },
        ];
        const avatar = (
          <Avatar
            photoURL={actor.photoURL}
            displayName={actor.displayName}
            size={38}
          />
        );
        if (!actor.id) {
          return (
            <View
              key={`${actor.displayName}-${index}`}
              style={actorStyle}
              testID={`notification-actor-${notification.id}-${index}`}
            >
              {avatar}
            </View>
          );
        }
        return (
          <Pressable
            key={actor.id}
            accessibilityRole="button"
            accessibilityLabel={`פתיחת הפרופיל של ${actor.displayName}`}
            accessibilityState={{ busy, disabled: busy }}
            disabled={busy}
            onPress={() => onActorPress?.(notification, actor)}
            style={({ pressed }) => [actorStyle, pressed && styles.rowPressed]}
            testID={`notification-actor-${notification.id}-${index}`}
          >
            {avatar}
          </Pressable>
        );
      })}
    </View>
  );
}

function Meta({ time }) {
  return (
    <View style={styles.rowMeta}>
      <AppText style={styles.rowTime}>{time}</AppText>
    </View>
  );
}

export function NotificationCard({
  notification,
  onTargetPress,
  onLikesPress,
  onActorPress,
  onDeletePress,
  onSwipeOpen,
  isSwipeOpen = false,
  busy = false,
}) {
  const swipeableRef = useRef(null);
  const presentation = getNotificationPresentation(notification);
  const time = formatNotificationTime(notification.createdAt);
  const accessibilityLabel = [
    presentation.message,
    presentation.detail,
    time,
  ].filter(Boolean).join('. ');
  const isLike = notification.type === NotificationType.LIKE;

  useEffect(() => {
    if (!isSwipeOpen) swipeableRef.current?.close?.();
  }, [isSwipeOpen]);

  const targetPressProps = {
    accessibilityRole: 'button',
    accessibilityLabel,
    accessibilityHint: 'פתיחת הפריט הקשור להתראה',
    accessibilityState: { busy, disabled: busy },
    disabled: busy,
    onPress: () => onTargetPress?.(notification),
  };

  const deleteAction = () => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="מחיקת ההתראה"
      accessibilityState={{ busy, disabled: busy }}
      disabled={busy}
      onPress={() => onDeletePress?.(notification)}
      style={({ pressed }) => [styles.swipeDeleteAction, pressed && styles.swipeDeletePressed]}
      testID={`notification-delete-${notification.id}`}
    >
      {busy ? (
        <ActivityIndicator size="small" color={colors.white} />
      ) : (
        <Ionicons name="trash-outline" size={23} color={colors.white} />
      )}
      <AppText style={styles.swipeDeleteText}>מחיקה</AppText>
    </Pressable>
  );

  return (
    <Swipeable
      ref={swipeableRef}
      enabled={!busy}
      friction={2}
      rightThreshold={36}
      overshootRight={false}
      renderRightActions={deleteAction}
      onSwipeableOpen={() => onSwipeOpen?.(notification)}
      containerStyle={styles.swipeContainer}
      testID={`notification-swipe-${notification.id}`}
    >
      <View style={styles.row}>
        <LeadingPreview
          notification={notification}
          presentation={presentation}
          onPress={onTargetPress}
          busy={busy}
        />

        <View style={styles.rowBody}>
          {isLike && presentation.likeMessageParts ? (
            <View
              style={styles.likeMessageRow}
              testID={`notification-like-message-${notification.id}`}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${presentation.likeMessageParts.actionLabel}, הצגת כל האנשים שאהבו`}
                accessibilityHint="פתיחת רשימת הלייקים"
                accessibilityState={{ busy, disabled: busy }}
                disabled={busy}
                onPress={() => onLikesPress?.(notification)}
                style={({ pressed }) => [styles.likeCountAction, pressed && styles.rowPressed]}
                testID={`notification-likes-${notification.id}`}
              >
                <AppText style={styles.likeCountActionText}>
                  {presentation.likeMessageParts.actionLabel}
                </AppText>
              </Pressable>
              <Pressable
                {...targetPressProps}
                style={({ pressed }) => [styles.likeMessageRemainder, pressed && styles.rowPressed]}
                testID={`notification-row-${notification.id}`}
              >
                <AppText style={styles.rowMessage} numberOfLines={3}>
                  {presentation.likeMessageParts.remainder}
                </AppText>
              </Pressable>
            </View>
          ) : (
            <Pressable
              {...targetPressProps}
              style={({ pressed }) => [styles.rowBodyTarget, pressed && styles.rowPressed]}
              testID={`notification-row-${notification.id}`}
            >
              <AppText style={styles.rowMessage} numberOfLines={3}>
                {presentation.message}
              </AppText>
              {presentation.detail ? (
                <AppText style={styles.rowDetail} numberOfLines={3}>
                  {presentation.detail}
                </AppText>
              ) : null}
            </Pressable>
          )}

          {(notification.type === NotificationType.LIKE
            || notification.type === NotificationType.COMMENT) ? (
              <ActorStrip
                notification={notification}
                onActorPress={onActorPress}
                busy={busy}
              />
            ) : null}
          <Meta time={time} />
        </View>
      </View>
    </Swipeable>
  );
}

export default NotificationCard;
