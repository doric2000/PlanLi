import React from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

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

function ActorStrip({ notification }) {
  const actors = (notification.actorPreviews?.length
    ? notification.actorPreviews
    : [notification.actorPreview].filter(Boolean)).slice(0, 4);
  if (!actors.length) return null;

  return (
    <View
      style={styles.actorPreviewStrip}
      importantForAccessibility="no-hide-descendants"
      testID={`notification-actors-${notification.id}`}
    >
      {actors.map((actor, index) => (
        <View
          key={actor.id || `${actor.displayName}-${index}`}
          style={[
            styles.actorPreviewItem,
            index > 0 && styles.actorPreviewItemOverlap,
            { zIndex: 4 - index },
          ]}
          testID={`notification-actor-${notification.id}-${index}`}
        >
          <Avatar
            photoURL={actor.photoURL}
            displayName={actor.displayName}
            size={38}
          />
        </View>
      ))}
    </View>
  );
}

function Meta({ notification, time }) {
  return (
    <View style={styles.rowMeta}>
      <AppText style={styles.rowTime}>{time}</AppText>
      {!notification.isRead ? (
        <View style={styles.unreadPill}>
          <AppText style={styles.unreadPillText}>חדש</AppText>
        </View>
      ) : null}
    </View>
  );
}

export function NotificationCard({
  notification,
  onTargetPress,
  onLikesPress,
  onMenuPress,
  busy = false,
}) {
  const presentation = getNotificationPresentation(notification);
  const time = formatNotificationTime(notification.createdAt);
  const accessibilityLabel = [
    presentation.message,
    presentation.detail,
    time,
    notification.isRead ? 'נקראה' : 'לא נקראה',
  ].filter(Boolean).join('. ');
  const isLike = notification.type === NotificationType.LIKE;

  const targetPressProps = {
    accessibilityRole: 'button',
    accessibilityLabel,
    accessibilityHint: 'פתיחת הפריט הקשור להתראה',
    accessibilityState: { busy, disabled: busy },
    disabled: busy,
    onPress: () => onTargetPress?.(notification),
  };

  return (
    <View style={[styles.row, !notification.isRead && styles.rowUnread]}>
      <LeadingPreview
        notification={notification}
        presentation={presentation}
        onPress={onTargetPress}
        busy={busy}
      />

      <View style={styles.rowBody}>
        {isLike && presentation.likeMessageParts ? (
          <View style={styles.likeMessageRow}>
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
            <ActorStrip notification={notification} />
          ) : null}
        <Meta notification={notification} time={time} />
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="אפשרויות להתראה"
        accessibilityState={{ busy, disabled: busy }}
        disabled={busy}
        hitSlop={4}
        onPress={() => onMenuPress?.(notification)}
        style={({ pressed }) => [styles.rowMenu, pressed && styles.rowPressed]}
        testID={`notification-menu-${notification.id}`}
      >
        {busy ? (
          <ActivityIndicator size="small" color={colors.brand} />
        ) : (
          <Ionicons name="ellipsis-horizontal" size={22} color={colors.textSecondary} />
        )}
      </Pressable>
    </View>
  );
}

export default NotificationCard;
