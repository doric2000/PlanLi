import { NotificationChannel } from '../models/NotificationModel';
import { useNotificationChannel } from '../context/NotificationCenterContext';

/**
 * Backwards-compatible list hook backed by the notification-center provider.
 */
export function useNotifications(channel = NotificationChannel.PERSONAL) {
  const state = useNotificationChannel(channel);
  return {
    ...state,
    notifications: state.items,
  };
}

export default useNotifications;
