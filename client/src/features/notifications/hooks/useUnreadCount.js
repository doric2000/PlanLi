import { useNotificationCenter } from '../context/NotificationCenterContext';
import { NotificationChannel } from '../models/NotificationModel';

export function useUnreadCount(channel) {
  const center = useNotificationCenter();
  if (channel === NotificationChannel.PERSONAL || channel === NotificationChannel.ADMIN) {
    return center.unreadCounts[channel] || 0;
  }
  return center.totalUnread;
}

export default useUnreadCount;
