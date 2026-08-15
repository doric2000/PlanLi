import { formatNotificationMessage, NotificationType } from '../src/features/notifications/models/NotificationModel';

describe('moderation notifications', () => {
  it('uses clear Hebrew copy for normal and urgent cases', () => {
    expect(formatNotificationMessage({ type: NotificationType.MODERATION, priority: 'normal' })).toContain('דיווח קהילה');
    expect(formatNotificationMessage({ type: NotificationType.MODERATION, priority: 'urgent' })).toContain('דחוף');
    expect(formatNotificationMessage({ type: NotificationType.MODERATION, message: 'עיר חדשה ממתינה לבדיקה.' })).toContain('עיר חדשה');
  });
});
