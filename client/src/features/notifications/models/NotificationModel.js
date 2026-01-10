/**
 * NotificationModel.js
 * 
 * Defines the data structure and schema for notifications in the Firestore database.
 * Follows the existing application patterns for data modeling.
 * 
 * Firestore Path: users/{userId}/notifications/{notificationId}
 */

/**
 * Notification Types
 */
export const NotificationType = {
  LIKE: 'like',
  COMMENT: 'comment',
};

/**
 * Post Types (where the notification originated from)
 */
export const PostType = {
  RECOMMENDATION: 'recommendation',
  ROUTE: 'route',
};

/**
 * Notification Schema
 * 
 * @typedef {Object} Notification
 * @property {string} id - Unique notification identifier (Firestore document ID)
 * @property {string} userId - ID of the user receiving the notification
 * @property {string} type - Type of notification (like or comment) - see NotificationType
 * @property {string} postType - Type of post (recommendation or route) - see PostType
 * @property {string} postId - ID of the post that was liked/commented
 * @property {string} postTitle - Title of the post for display
 * @property {string} actorId - ID of the user who triggered the notification (last actor)
 * @property {string} actorName - Display name of the last actor
 * @property {string|null} actorAvatar - Avatar URL of the last actor (nullable)
 * @property {number} count - Total number of likes/comments that triggered this notification
 * @property {number} batchThreshold - The threshold at which this notification was sent (1, 10, 20, 100, etc.)
 * @property {boolean} isRead - Whether the notification has been read by the user
 * @property {firebase.firestore.Timestamp} timestamp - When the notification was created
 */

/**
 * Creates a new notification object with the required fields
 * 
 * @param {Object} params - Notification parameters
 * @param {string} params.userId - ID of the user receiving the notification
 * @param {string} params.type - Notification type (like/comment)
 * @param {string} params.postType - Post type (recommendation/route)
 * @param {string} params.postId - ID of the post
 * @param {string} params.postTitle - Title of the post
 * @param {string} params.actorId - ID of the actor
 * @param {string} params.actorName - Name of the actor
 * @param {string|null} params.actorAvatar - Avatar URL of the actor
 * @param {number} params.count - Count of interactions
 * @param {number} params.batchThreshold - Batch threshold for this notification
 * @returns {Object} Notification object ready for Firestore
 */
export const createNotification = ({
  userId,
  type,
  postType,
  postId,
  postTitle,
  actorId,
  actorName,
  actorAvatar,
  count,
  batchThreshold,
}) => {
  return {
    userId,
    type,
    postType,
    postId,
    postTitle,
    actorId,
    actorName,
    actorAvatar: actorAvatar || null,
    count,
    batchThreshold,
    isRead: false,
    timestamp: new Date(),
  };
};

/**
 * Validates a notification object
 * 
 * @param {Object} notification - Notification object to validate
 * @returns {boolean} True if valid, false otherwise
 */
export const isValidNotification = (notification) => {
  if (!notification) return false;

  const requiredFields = [
    'userId',
    'type',
    'postType',
    'postId',
    'postTitle',
    'actorId',
    'actorName',
    'count',
    'batchThreshold',
    'timestamp',
  ];

  for (const field of requiredFields) {
    if (notification[field] === undefined || notification[field] === null) {
      if (field !== 'actorAvatar') {
        // actorAvatar can be null
        return false;
      }
    }
  }

  // Validate enum values
  if (!Object.values(NotificationType).includes(notification.type)) {
    return false;
  }

  if (!Object.values(PostType).includes(notification.postType)) {
    return false;
  }

  // Validate types
  if (typeof notification.count !== 'number' || notification.count < 1) {
    return false;
  }

  if (typeof notification.batchThreshold !== 'number' || notification.batchThreshold < 1) {
    return false;
  }

  return true;
};

/**
 * Formats a notification for display
 * 
 * @param {Object} notification - Notification object
 * @returns {string} Formatted notification message
 */
export const formatNotificationMessage = (notification) => {
  const { type, actorName, count, postTitle } = notification;

  if (count === 1) {
    if (type === NotificationType.LIKE) {
      return `${actorName} עשה לייק לפוסט שלך`;
    } else if (type === NotificationType.COMMENT) {
      return `${actorName} הגיב על הפוסט שלך`;
    }
  } else {
    const others = count - 1;
    if (type === NotificationType.LIKE) {
      return others === 1
        ? `${actorName} ועוד אדם אחד עשו לייק לפוסט שלך`
        : `${actorName} ועוד ${others} אנשים עשו לייק לפוסט שלך`;
    } else if (type === NotificationType.COMMENT) {
      return others === 1
        ? `${actorName} ועוד אדם אחד הגיבו על הפוסט שלך`
        : `${actorName} ועוד ${others} אנשים הגיבו על הפוסט שלך`;
    }
  }

  return 'התראה חדשה';
};
