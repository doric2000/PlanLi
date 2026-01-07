/**
 * NotificationCard.js
 * 
 * Displays a single notification in a rectangular boxy design.
 * Shows post title, type indicator icon, actor info, and relative timestamp.
 * Clickable to navigate to the associated post.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '../../../components/Avatar';
import { formatNotificationMessage } from '../models/NotificationModel';
import { formatNotificationTime } from '../../../utils/formatNotificationTime';
import { colors, spacing, typography, shadows } from '../../../styles';
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
      style={[styles.container, !isRead && styles.unreadContainer]}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      {!isRead && <View style={styles.unreadDot} />}
      <View style={styles.content}>
        <View style={styles.header}>
          <Avatar photoURL={actorAvatar} displayName={actorName} size={44} />
          <View style={styles.typeIconContainer}>{getTypeIcon()}</View>
        </View>
        <View style={styles.body}>
          <Text style={styles.message} numberOfLines={2}>{message}</Text>
          <Text style={styles.postTitle} numberOfLines={1}>"{postTitle}"</Text>
          <View style={styles.footer}>
            <View style={styles.postTypeBadge}>
              <Text style={styles.postTypeText}>{getPostTypeLabel()}</Text>
            </View>
            <Text style={styles.timestamp}>{timeString}</Text>
          </View>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} style={styles.arrowIcon} />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginHorizontal: 12,
    marginVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 1.0,
    elevation: 1,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  unreadContainer: {
    backgroundColor: '#F0F9FF',
    borderColor: '#FF9F1C',
    borderWidth: 1.5,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF9F1C',
    position: 'absolute',
    top: 12,
    left: 12,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
  },
  header: {
    position: 'relative',
  },
  typeIconContainer: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 1.0,
    elevation: 1,
  },
  body: {
    flex: 1,
    justifyContent: 'center',
  },
  message: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
    lineHeight: 18,
  },
  postTitle: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 4,
    fontStyle: 'italic',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  postTypeBadge: {
    backgroundColor: '#1E3A5F15',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  postTypeText: {
    fontSize: 12,
    color: '#1E3A5F',
    fontWeight: '500',
  },
  timestamp: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '400',
  },
  arrowIcon: {
    marginLeft: 4,
  },
});

export default NotificationCard;
