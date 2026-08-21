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
import { getNotificationPresentation } from '../models/NotificationModel';
import { notificationCenterStyles as styles } from '../styles/notificationCenterStyles';

const toneStyle = {
  like: styles.typeBadgeLike,
  comment: styles.typeBadgeComment,
  system: styles.typeBadgeSystem,
  admin: styles.typeBadgeAdmin,
  urgent: styles.typeBadgeUrgent,
};

function ActorPreview({ notification, presentation }) {
  const actors = (notification.actorPreviews?.length
    ? notification.actorPreviews
    : [notification.actorPreview].filter(Boolean)).slice(0, 4);

  return (
    <View style={styles.actorColumn} importantForAccessibility="no-hide-descendants">
      {actors.length ? (
        <View style={styles.actorStack}>
          {actors.map((actor, index) => (
            <View
              key={actor.id || `${actor.displayName}-${index}`}
              style={[styles.actorStackItem, { zIndex: 4 - index }]}
              testID={`notification-actor-${notification.id}-${index}`}
            >
              <Avatar
                photoURL={actor.photoURL}
                displayName={actor.displayName}
                size={32}
              />
            </View>
          ))}
        </View>
      ) : (
        <View style={[styles.actorStack, { justifyContent: 'center' }]}>
          <Ionicons
            name={presentation.icon}
            size={30}
            color={presentation.tone === 'urgent' ? colors.error : colors.brand}
          />
        </View>
      )}
      <View style={[styles.typeBadge, toneStyle[presentation.tone]]}>
        <Ionicons name={presentation.icon} size={14} color={colors.white} />
      </View>
    </View>
  );
}

export function NotificationCard({ notification, onPress, onMenuPress, busy = false }) {
  const presentation = getNotificationPresentation(notification);
  const time = formatNotificationTime(notification.createdAt);
  const previews = (notification.target?.thumbUrls || []).slice(0, 4);
  const accessibilityLabel = [
    presentation.message,
    presentation.detail,
    time,
    notification.isRead ? 'נקראה' : 'לא נקראה',
  ].filter(Boolean).join('. ');

  return (
    <View
      style={[
        styles.row,
        !notification.isRead && styles.rowUnread,
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint="פתיחת הפריט הקשור להתראה"
        accessibilityState={{ busy, disabled: busy }}
        disabled={busy}
        onPress={() => onPress?.(notification)}
        style={({ pressed }) => [styles.rowMain, pressed && styles.rowPressed]}
        testID={`notification-row-${notification.id}`}
      >
        <ActorPreview notification={notification} presentation={presentation} />

        <View style={styles.rowBody}>
          <AppText style={styles.rowMessage} numberOfLines={3}>
            {presentation.message}
          </AppText>
          {presentation.detail ? (
            <AppText style={styles.rowDetail} numberOfLines={3}>
              {presentation.detail}
            </AppText>
          ) : null}

          {previews.length ? (
            <View style={styles.previews} testID={`notification-previews-${notification.id}`}>
              {previews.map((uri, index) => (
                <Image
                  key={`${uri}-${index}`}
                  accessibilityIgnoresInvertColors
                  source={{ uri }}
                  style={styles.previewImage}
                  resizeMode="cover"
                />
              ))}
            </View>
          ) : null}

          <View style={styles.rowMeta}>
            <AppText style={styles.rowTime}>{time}</AppText>
            {!notification.isRead ? (
              <View style={styles.unreadPill}>
                <AppText style={styles.unreadPillText}>חדש</AppText>
              </View>
            ) : null}
          </View>
        </View>
      </Pressable>

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
