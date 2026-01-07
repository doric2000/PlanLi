/**
 * NotificationCard.js
 * 
 * Displays a single notification in a rectangular boxy design.
 * Shows post title, type indicator icon, actor info, and relative timestamp.
 * Clickable to navigate to the associated post.
 */

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '../../../components/Avatar';
import { formatNotificationMessage } from '../models/NotificationModel';
import { formatNotificationTime } from '../../../utils/formatNotificationTime';
import { colors, notifications } from '../../../styles';
import { NotificationType, PostType } from '../models/NotificationModel';

export const NotificationCard = ({ notification, onPress, onMarkAsRead }) => {
  const {
    id,
    type,
    postType,
    postTitle,
    actorName,
    actorAvatar,
    timestamp,
    isRead,
  } = notification;

  const getTypeIcon = () => {
    switch (type) {
      case NotificationType.LIKE:
        return <Ionicons name="heart" size={20} color={colors.heart} />;
      case NotificationType.COMMENT:
        return <Ionicons name="chatbubble" size={20} color={colors.secondary} />;
      default:
        return <Ionicons name="notifications" size={20} color={colors.primary} />;
    }
  };

  const getPostTypeLabel = () => {
    return postType === PostType.ROUTE ? 'Route' : 'Community';
  };

  const message = formatNotificationMessage(notification);
  const timeString = formatNotificationTime(timestamp);

  const handlePress = () => {
    if (!isRead && onMarkAsRead) {
      onMarkAsRead(id);
    }
    if (onPress) {
      onPress(notification);
    }
  };

  return (
    <TouchableOpacity
      style={[notifications.cardContainer, !isRead && notifications.cardUnread]}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      {!isRead && <View style={notifications.cardUnreadDot} />}
      <View style={notifications.cardContent}>
        <View style={notifications.cardHeader}>
          <Avatar photoURL={actorAvatar} displayName={actorName} size={44} />
          <View style={notifications.cardTypeIconContainer}>{getTypeIcon()}</View>
        </View>
        <View style={notifications.cardBody}>
          <Text style={notifications.cardMessage} numberOfLines={2}>{message}</Text>
          <Text style={notifications.cardPostTitle} numberOfLines={1}>"{postTitle}"</Text>
          <View style={notifications.cardFooter}>
            <View style={notifications.cardPostTypeBadge}>
              <Text style={notifications.cardPostTypeText}>{getPostTypeLabel()}</Text>
            </View>
            <Text style={notifications.cardTimestamp}>{timeString}</Text>
          </View>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} style={notifications.cardArrowIcon} />
    </TouchableOpacity>
  );
};

export default NotificationCard;
