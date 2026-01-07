# Notification System Documentation

## Overview

The PlanLi app now features a comprehensive notification system that alerts users when their posts receive likes or comments. The system is built using **Observer** and **Strategy** design patterns following **SOLID principles**.

## Architecture

### Design Patterns

1. **Observer Pattern**: Allows the notification system to subscribe to like and comment events
2. **Strategy Pattern**: Different strategies for handling like vs. comment notifications
3. **Singleton Pattern**: Single notification system instance across the app

### Core Components

```
client/src/features/notifications/
├── models/
│   └── NotificationModel.js        # Data schema and validation
├── services/
│   ├── NotificationService.js      # Firebase operations
│   └── NotificationObserver.js     # Observer pattern implementation
├── hooks/
│   ├── useNotifications.js         # Real-time notification updates
│   ├── useUnreadCount.js           # Badge counter hook
│   └── useClearNotifications.js    # Notification management
├── components/
│   └── NotificationCard.js         # Notification card UI
├── screens/
│   └── NotificationScreen.js       # Main notifications screen
└── utils/
    └── formatNotificationTime.js   # Time formatting utilities
```

## Features

### ✅ Smart Batching Logic

Notifications are sent at strategic intervals to avoid spam:
- **First interaction**: Always notify (count = 1)
- **10-99 interactions**: Every 10 (10, 20, 30, 40...)
- **100-999 interactions**: Every 100 (100, 200, 300...)
- **1000+ interactions**: Every 1000 (1000, 2000, 3000...)

### ✅ Notification Types

1. **Like Notifications**: When someone likes your post
2. **Comment Notifications**: When someone comments on your post

Each notification shows:
- Actor's avatar and name (last person who interacted)
- Total count of interactions
- Post title
- Post type (Community/Route)
- Relative timestamp

### ✅ UI Features

- **Boxy design** with rectangular cards
- **Type indicators** (heart icon for likes, chat bubble for comments)
- **Unread state** with visual highlighting
- **Badge counter** in drawer menu
- **Pull-to-refresh** for manual updates
- **Clear all** functionality
- **Empty state** with helpful message

### ✅ Time Display

- Within 24 hours: Shows time in **HH:MM** format
- Beyond 24 hours: Shows **"X days before"**

## Firebase Structure

### Firestore Collection

```
users/{userId}/notifications/{notificationId}
  ├── userId: string               // Recipient user ID
  ├── type: string                 // "like" | "comment"
  ├── postType: string             // "recommendation" | "route"
  ├── postId: string               // ID of the post
  ├── postTitle: string            // Title for display
  ├── actorId: string              // Last person who interacted
  ├── actorName: string            // Actor's display name
  ├── actorAvatar: string|null     // Actor's avatar URL
  ├── count: number                // Total interaction count
  ├── batchThreshold: number       // Threshold for this notification
  ├── isRead: boolean              // Read status
  └── timestamp: timestamp         // Creation time
```

## Usage Examples

### Triggering Notifications

Notifications are automatically triggered when:

1. **User likes a post** (in `useLikes.js`):
```javascript
// Automatically called in the like handler
await notifyLikeEvent({
  postId: 'rec123',
  postTitle: 'Best beaches in Bali',
  postType: PostType.RECOMMENDATION,
  postOwnerId: 'user123',
  actorId: 'user456',
  actorName: 'John Doe',
  actorAvatar: 'https://...',
  currentLikeCount: 10,
});
```

2. **User comments on a post** (in `CommentSection.js`):
```javascript
// Automatically called after adding comment
await notifyCommentEvent({
  postId: 'route789',
  postTitle: 'Pacific Coast Highway',
  postType: PostType.ROUTE,
  postOwnerId: 'user123',
  actorId: 'user456',
  actorName: 'Jane Smith',
  actorAvatar: 'https://...',
  currentCommentCount: 20,
});
```

### Using Notification Hooks

```javascript
import { useNotifications, useUnreadCount, useClearNotifications } from '../features/notifications/hooks';

function MyComponent() {
  // Get all notifications with real-time updates
  const { notifications, loading, refreshing, refresh, unreadCount } = useNotifications();
  
  // Get just the unread count (lighter weight)
  const unreadCount = useUnreadCount();
  
  // Manage notifications
  const { clearAll, markAsRead, deleteOne, clearing } = useClearNotifications();
  
  return (
    <View>
      <Text>Unread: {unreadCount}</Text>
      <Button onPress={() => clearAll()} title="Clear All" />
    </View>
  );
}
```

## Navigation Flow

1. User opens drawer menu → sees notification badge
2. Taps "Notifications" → navigates to NotificationScreen
3. Sees list of notifications with real-time updates
4. Taps a notification → marks as read → navigates to the post
5. Can clear all notifications with confirmation dialog

## Integration Points

### Modified Files

1. **useLikes.js**: Added notification trigger when liking
2. **CommentSection.js**: Added notification trigger when commenting
3. **RightDrawerNavigator.js**: Added badge and navigation
4. **ProfileMenuList.js**: Added badge display on menu item
5. **App.js**: Added NotificationScreen to stack navigator

### New Files Created

- 9 new files in `features/notifications/` directory
- 1 utility file for time formatting
- All following existing app patterns and conventions

## Configuration

### Firestore Security Rules

Update your `firestore.rules` to secure notifications:

```javascript
match /users/{userId}/notifications/{notificationId} {
  // Only the owner can read their notifications
  allow read: if request.auth != null && request.auth.uid == userId;
  
  // Anyone can create notifications (system-generated)
  allow create: if request.auth != null;
  
  // Only the owner can update (mark as read) or delete their notifications
  allow update, delete: if request.auth != null && request.auth.uid == userId;
}
```

## Best Practices

### Performance

1. **Real-time listeners** are optimized for the notifications screen only
2. **Badge counter** uses a lightweight query for just unread count
3. **Batched deletes** when clearing all notifications (max 500 per batch)

### Error Handling

- Notification failures don't break like/comment functionality
- All errors are logged but silently handled
- Rollback logic for failed operations

### User Experience

- **Optimistic updates** for immediate UI feedback
- **Pull-to-refresh** for manual sync
- **Empty states** with helpful messaging
- **Confirmation dialogs** for destructive actions

## Testing Checklist

- [ ] Like a post → notification appears at count 1
- [ ] Get 10 likes → notification appears at count 10
- [ ] Comment on post → notification appears
- [ ] Badge shows correct unread count
- [ ] Tapping notification navigates to correct post
- [ ] Mark as read works (visual state changes)
- [ ] Clear all removes all notifications
- [ ] Time formatting works (HH:MM and days)
- [ ] Self-likes/comments don't create notifications
- [ ] Empty state displays correctly

## Future Enhancements

Consider implementing:

1. **Push notifications** using Expo Notifications
2. **In-app notification banner** when receiving new notifications
3. **Notification preferences** (mute, frequency settings)
4. **More notification types** (followers, mentions, etc.)
5. **Notification grouping** (combine similar notifications)
6. **Mark all as read** functionality
7. **Auto-cleanup** of old notifications (30+ days)

## Troubleshooting

### Notifications not appearing

1. Check Firebase connection and authentication
2. Verify Firestore security rules allow creation
3. Check console for errors in `notifyLikeEvent`/`notifyCommentEvent`
4. Ensure post has `userId` field (post owner)

### Badge not updating

1. Verify `useUnreadCount` hook is imported correctly
2. Check if user is authenticated
3. Look for Firestore listener errors in console

### Navigation not working

1. Ensure screen names match: `RecommendationDetail`, `RouteDetail`
2. Verify navigation stack includes these screens
3. Check that `postId` is being passed correctly

## Support

For issues or questions about the notification system, check:
- Console logs for error messages
- Firestore console for notification documents
- Network tab for Firebase requests

---

**System Version**: 1.0.0  
**Last Updated**: January 2026  
**Maintained by**: PlanLi Development Team
