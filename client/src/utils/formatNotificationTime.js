/**
 * formatNotificationTime.js
 *
 * Utility to format timestamps for notification display.
 * Shows a local date label together with HH:MM for every notification.
 */

/**
 * Format notification timestamp according to requirements:
 *
 * @param {object|number|Date} timestamp - Firestore Timestamp, JS Date, or ms
 * @param {Date} now - Current local time; injectable for deterministic tests
 * @returns {string} Formatted time string
 */
export function formatNotificationTime(timestamp, now = new Date()) {
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

  if (Number.isNaN(date.getTime()) || Number.isNaN(now.getTime())) return '';

  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const time = `${hours}:${minutes}`;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const notificationDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (notificationDay.getTime() === today.getTime()) return `היום, ${time}`;
  if (notificationDay.getTime() === yesterday.getTime()) return `אתמול, ${time}`;

  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear() === now.getFullYear() ? '' : `.${date.getFullYear()}`;
  return `${day}.${month}${year}, ${time}`;
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

  if (diffMins < 1) return 'הרגע';
  if (diffMins < 60) return `${diffMins} דק׳`;
  if (diffHours < 24) return `${diffHours} ש׳`;
  if (diffDays < 7) return `${diffDays} י׳`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} שב׳`;
  return `${Math.floor(diffDays / 30)} ח׳`;
}
