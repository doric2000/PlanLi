/**
 * NotificationObserver.js
 * 
 * Implements the Observer design pattern for notification system.
 * Uses Strategy pattern for different notification types (Like, Comment).
 * Follows SOLID principles with clear separation of concerns.
 * 
 * Design Pattern: Observer + Strategy
 * - Observer: Allows subjects (posts) to notify observers (notification system) of events
 * - Strategy: Different strategies for handling like vs comment notifications
 */

import {
  createNotificationInFirestore,
  shouldNotify,
  getBatchThreshold,
  findExistingNotification,
} from './NotificationService';
import { NotificationType, PostType } from '../models/NotificationModel';

/**
 * Base Observer Interface
 * Defines the contract that all observers must implement
 */
export class NotificationObserver {
  /**
   * Update method called when subject notifies observers
   * 
   * @param {Object} data - Event data from the subject
   * @throws {Error} Must be implemented by subclasses
   */
  update(data) {
    throw new Error('update() must be implemented by subclass');
  }
}

/**
 * Subject that maintains a list of observers and notifies them of changes
 * This is the core of the Observer pattern
 */
export class NotificationSubject {
  constructor() {
    this.observers = [];
  }

  /**
   * Attach an observer to the subject
   * 
   * @param {NotificationObserver} observer - Observer to attach
   */
  attach(observer) {
    if (!(observer instanceof NotificationObserver)) {
      throw new Error('Observer must extend NotificationObserver');
    }
    this.observers.push(observer);
  }

  /**
   * Detach an observer from the subject
   * 
   * @param {NotificationObserver} observer - Observer to detach
   */
  detach(observer) {
    const index = this.observers.indexOf(observer);
    if (index > -1) {
      this.observers.splice(index, 1);
    }
  }

  /**
   * Notify all observers of an event
   * 
   * @param {Object} data - Event data to pass to observers
   */
  async notify(data) {
    const promises = this.observers.map((observer) => observer.update(data));
    await Promise.all(promises);
  }
}

/**
 * Base Strategy for notification creation
 * Implements the Strategy pattern for different notification types
 */
class NotificationStrategy {
  /**
   * Process a notification event
   * 
   * @param {Object} data - Event data
   * @returns {Promise<void>}
   */
  async process(data) {
    throw new Error('process() must be implemented by subclass');
  }

  /**
   * Validate required data fields
   * 
   * @param {Object} data - Data to validate
   * @param {Array<string>} requiredFields - Required field names
   * @throws {Error} If validation fails
   */
  validateData(data, requiredFields) {
    for (const field of requiredFields) {
      if (!data[field] && data[field] !== 0) {
        throw new Error(`Missing required field: ${field}`);
      }
    }
  }
}

/**
 * Strategy for handling Like notifications
 * Implements smart batching: notify at 1, 10, 20, 30...100, 200, 300...
 */
export class LikeNotificationStrategy extends NotificationStrategy {
  async process(data) {
    console.log('LikeNotificationStrategy processing:', data);
    try {
      // Validate required data
      this.validateData(data, [
        'postId',
        'postTitle',
        'postType',
        'postOwnerId',
        'actorId',
        'actorName',
        'currentLikeCount',
      ]);
      console.log('✅ Validation passed');

      const {
        postId,
        postTitle,
        postType,
        postOwnerId,
        actorId,
        actorName,
        actorAvatar,
        currentLikeCount,
      } = data;

      // Don't notify if user likes their own post
      if (actorId === postOwnerId) {
        console.log('Skipping self-like notification');
        return;
      }

      // Check if we should notify at this count
      const shouldSendNotification = shouldNotify(currentLikeCount);
      console.log(`shouldNotify(${currentLikeCount}):`, shouldSendNotification);
      if (!shouldSendNotification) {
        console.log(`No notification at count ${currentLikeCount}`);
        return;
      }
      console.log(`Will send notification at count ${currentLikeCount}`);

      // Get the batch threshold for this notification
      const batchThreshold = getBatchThreshold(currentLikeCount);

      // Check if we already sent a notification for this threshold
      const existingNotification = await findExistingNotification(
        postOwnerId,
        postId,
        NotificationType.LIKE,
        batchThreshold
      );

      if (existingNotification) {
        console.log(`Notification already exists for threshold ${batchThreshold}`);
        return;
      }

      // Create notification
      const notificationData = {
        userId: postOwnerId,
        type: NotificationType.LIKE,
        postType: postType,
        postId: postId,
        postTitle: postTitle,
        actorId: actorId,
        actorName: actorName,
        actorAvatar: actorAvatar || null,
        count: currentLikeCount,
        batchThreshold: batchThreshold,
      };

      await createNotificationInFirestore(notificationData);
      console.log(`Like notification created for ${postOwnerId} at count ${currentLikeCount}`);
    } catch (error) {
      console.error('Error processing like notification:', error);
      // Don't throw - we don't want to break the like functionality
    }
  }
}

/**
 * Strategy for handling Comment notifications
 * Implements smart batching: notify at 1, 10, 20, 30...100, 200, 300...
 */
export class CommentNotificationStrategy extends NotificationStrategy {
  async process(data) {
    console.log('CommentNotificationStrategy processing:', data);
    try {
      // Validate required data
      this.validateData(data, [
        'postId',
        'postTitle',
        'postType',
        'postOwnerId',
        'actorId',
        'actorName',
        'currentCommentCount',
      ]);
      console.log('Validation passed');

      const {
        postId,
        postTitle,
        postType,
        postOwnerId,
        actorId,
        actorName,
        actorAvatar,
        currentCommentCount,
      } = data;

      // Don't notify if user comments on their own post
      if (actorId === postOwnerId) {
        console.log('Skipping self-comment notification');
        return;
      }

      // Check if we should notify at this count
      if (!shouldNotify(currentCommentCount)) {
        console.log(`No notification at count ${currentCommentCount}`);
        return;
      }

      // Get the batch threshold for this notification
      const batchThreshold = getBatchThreshold(currentCommentCount);

      // Check if we already sent a notification for this threshold
      const existingNotification = await findExistingNotification(
        postOwnerId,
        postId,
        NotificationType.COMMENT,
        batchThreshold
      );

      if (existingNotification) {
        console.log(`Notification already exists for threshold ${batchThreshold}`);
        return;
      }

      // Create notification
      const notificationData = {
        userId: postOwnerId,
        type: NotificationType.COMMENT,
        postType: postType,
        postId: postId,
        postTitle: postTitle,
        actorId: actorId,
        actorName: actorName,
        actorAvatar: actorAvatar || null,
        count: currentCommentCount,
        batchThreshold: batchThreshold,
      };

      await createNotificationInFirestore(notificationData);
      console.log(`Comment notification created for ${postOwnerId} at count ${currentCommentCount}`);
    } catch (error) {
      console.error('Error processing comment notification:', error);
      // Don't throw - we don't want to break the comment functionality
    }
  }
}

/**
 * Concrete Observer that uses strategies to handle different notification types
 * This is the bridge between the Observer pattern and Strategy pattern
 */
export class NotificationHandler extends NotificationObserver {
  constructor() {
    super();
    this.strategies = {
      [NotificationType.LIKE]: new LikeNotificationStrategy(),
      [NotificationType.COMMENT]: new CommentNotificationStrategy(),
    };
  }

  /**
   * Handle notification event using appropriate strategy
   * 
   * @param {Object} data - Event data
   * @param {string} data.type - Notification type (like/comment)
   */
  async update(data) {
    try {
      const { type } = data;

      if (!type || !this.strategies[type]) {
        console.error('Invalid notification type:', type);
        return;
      }

      const strategy = this.strategies[type];
      await strategy.process(data);
    } catch (error) {
      console.error('Error in NotificationHandler:', error);
    }
  }
}

/**
 * Singleton instance of the notification system
 * Provides a global point of access to the notification observer
 */
class NotificationSystem {
  constructor() {
    this.subject = new NotificationSubject();
    this.handler = new NotificationHandler();
    this.subject.attach(this.handler);
  }

  /**
   * Trigger a notification event
   * 
   * @param {string} type - Notification type (like/comment)
   * @param {Object} data - Event data
   */
  async notify(type, data) {
    await this.subject.notify({
      type,
      ...data,
    });
  }

  /**
   * Notify about a like event
   * 
   * @param {Object} data - Like event data
   */
  async notifyLike(data) {
    await this.notify(NotificationType.LIKE, data);
  }

  /**
   * Notify about a comment event
   * 
   * @param {Object} data - Comment event data
   */
  async notifyComment(data) {
    await this.notify(NotificationType.COMMENT, data);
  }
}

// Export singleton instance
export const notificationSystem = new NotificationSystem();

/**
 * Convenience function to trigger like notification
 * 
 * @param {Object} data - Like notification data
 * @example
 * notifyLikeEvent({
 *   postId: 'rec123',
 *   postTitle: 'Best beaches in Bali',
 *   postType: 'recommendation',
 *   postOwnerId: 'user123',
 *   actorId: 'user456',
 *   actorName: 'John Doe',
 *   actorAvatar: 'https://...',
 *   currentLikeCount: 10,
 * });
 */
export const notifyLikeEvent = async (data) => {
  console.log('notifyLikeEvent called with data:', {
    postId: data.postId,
    postOwnerId: data.postOwnerId,
    actorId: data.actorId,
    currentLikeCount: data.currentLikeCount,
  });
  await notificationSystem.notifyLike(data);
};

/**
 * Convenience function to trigger comment notification
 * 
 * @param {Object} data - Comment notification data
 * @example
 * notifyCommentEvent({
 *   postId: 'route789',
 *   postTitle: 'Pacific Coast Highway',
 *   postType: 'route',
 *   postOwnerId: 'user123',
 *   actorId: 'user456',
 *   actorName: 'Jane Smith',
 *   actorAvatar: 'https://...',
 *   currentCommentCount: 20,
 * });
 */
export const notifyCommentEvent = async (data) => {
  console.log('notifyCommentEvent called with data:', {
    postId: data.postId,
    postOwnerId: data.postOwnerId,
    actorId: data.actorId,
    currentCommentCount: data.currentCommentCount,
  });
  await notificationSystem.notifyComment(data);
};
