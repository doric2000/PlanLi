/**
 * formatNotificationTime.js
 * 
 * Utility to format timestamps for notification display.
 * Shows time in HH:MM format if within 24 hours, otherwise shows days.
 */

/**
 * Format notification timestamp according to requirements:
 * - Within 24 hours: HH:MM
 * - More than 24 hours: "1 day before", "2 days before", etc.
 * 
 * @param {object|number|Date} timestamp - Firestore Timestamp, JS Date, or ms
 * @returns {string} Formatted time string
 */
export function formatNotificationTime(timestamp) {
  if (!timestamp) return '';

  let date;
  if (timestamp.toDate) {
    date = timestamp.toDate();
  } else if (typeof timestamp === 'number') {
    date = new Date(timestamp);
  } else if (timestamp instanceof Date) {
    date = timestamp;
  } else {
    date = new Date(timestamp);
  }

  const now = new Date();
  const diffMs = now - date;
  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  // Within 24 hours: show HH:MM
  if (diffHours < 24) {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  // More than 24 hours: show days
  if (diffDays === 1) {
    return '1 day before';
  }

  return `${diffDays} days before`;
}

/**
 * Get short relative time for notifications (for accessibility)
 * 
 * @param {object|number|Date} timestamp - Firestore Timestamp, JS Date, or ms
 * @returns {string} Short relative time
 */
export function getShortRelativeTime(timestamp) {
  if (!timestamp) return '';

  let date;
  if (timestamp.toDate) {
    date = timestamp.toDate();
  } else if (typeof timestamp === 'number') {
    date = new Date(timestamp);
  } else if (timestamp instanceof Date) {
    date = timestamp;
  } else {
    date = new Date(timestamp);
  }

  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w`;
  return `${Math.floor(diffDays / 30)}mo`;
}
