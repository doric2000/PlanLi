import { useCallback } from 'react';

import { useNotificationCenter } from '../context/NotificationCenterContext';
import { NotificationChannel } from '../models/NotificationModel';

/**
 * Compatibility facade for older notification callers. New UI should use the
 * provider actions directly so a channel is always explicit.
 */
export function useClearNotifications(channel = NotificationChannel.PERSONAL) {
  const center = useNotificationCenter();

  const markAsRead = useCallback((notificationOrId, read = true) => {
    const notification = typeof notificationOrId === 'string'
      ? center.channels[channel].items.find((item) => item.id === notificationOrId)
      : notificationOrId;
    return notification ? center.setRead(notification, read) : Promise.resolve(false);
  }, [center, channel]);

  const deleteOne = useCallback((notificationOrId) => {
    const notification = typeof notificationOrId === 'string'
      ? center.channels[channel].items.find((item) => item.id === notificationOrId)
      : notificationOrId;
    return notification ? center.deleteOne(notification) : Promise.resolve(false);
  }, [center, channel]);

  return {
    clearAll: () => center.clearChannel(channel),
    markAsRead,
    deleteOne,
    clearing: Boolean(center.pendingActions[`channel:${channel}:delete`]),
    error: center.mutationError,
  };
}

export default useClearNotifications;
